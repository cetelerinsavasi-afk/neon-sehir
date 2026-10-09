import { useEffect, useRef } from 'react';
import { ARCADE_BY_ID } from '../Arcade/games/index.js';
import { lerpState, NO_LERP } from '../Arcade/games/common.js';

// =============================================================================
// v80 — Yayında oynanan oyun salonu oyununu izleyiciye gösterir. Yayıncı oyun
// durumunu ~8 kez/sn yollar; burada son iki kare arasında ~150 ms geriden akıcı
// ara değerlenip oyunun KENDİ çizimiyle çizilir (video değil → çok az veri).
// frames: { g, s(json), n, me, at } (en son gelen) — ref üzerinden beslenir.
// =============================================================================
const DELAY = 160;

export default function StreamGameView({ frameRef }) {
  const cvRef = useRef(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    const cv = cvRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return undefined;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let snaps = [];
    let lastAt = 0;
    let gameId = null;
    const fit = (game) => {
      const w = wrap.clientWidth;
      const hMax = wrap.clientHeight;
      let cw = w;
      let ch = Math.round((w * game.H) / game.W);
      if (ch > hMax) {
        ch = hMax;
        cw = Math.round((hMax * game.W) / game.H);
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
        cv.style.width = `${cw}px`;
        cv.style.height = `${ch}px`;
        cv.width = Math.round(cw * dpr);
        cv.height = Math.round(ch * dpr);
      }
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const f = frameRef.current;
      if (f && f.at !== lastAt && ARCADE_BY_ID[f.g]) {
        lastAt = f.at;
        if (f.g !== gameId) {
          gameId = f.g;
          snaps = [];
        }
        try {
          snaps.push({ at: now, s: JSON.parse(f.s), me: f.me || 0 });
          if (snaps.length > 8) snaps.shift();
        } catch {
          /* bozuk kare */
        }
      }
      const game = ARCADE_BY_ID[gameId];
      if (!game || !snaps.length) return;
      fit(game);
      const target = now - DELAY;
      let a = snaps[0];
      let b = snaps[snaps.length - 1];
      for (let k = snaps.length - 1; k > 0; k--) {
        if (snaps[k - 1].at <= target) {
          a = snaps[k - 1];
          b = snaps[k];
          break;
        }
      }
      const skip = game.noLerp ? new Set([...NO_LERP, ...game.noLerp]) : NO_LERP;
      let view = b.s;
      if (a !== b && target > a.at && target < b.at) view = lerpState(a.s, b.s, (target - a.at) / Math.max(1, b.at - a.at), skip);
      else if (target <= a.at) view = a.s;
      try {
        ctx.setTransform(cv.width / game.W, 0, 0, cv.height / game.H, 0, 0);
        game.render(ctx, view, b.me);
      } catch {
        /* çizim hatası tek kareyi atlar */
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frameRef]);
  return (
    <div className="st-game" ref={wrapRef}>
      <canvas ref={cvRef} />
    </div>
  );
}
