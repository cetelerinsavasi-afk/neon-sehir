import { useEffect, useRef, useState } from 'react';
import { IN, lerpState } from './games/common.js';
import { connectRoom } from './net';

// =============================================================================
// v75 — GameRunner: oyun döngüsü + dokunmatik/klavye kontrolleri.
//  mode.kind: 'bot'   → yerel simülasyon, rakip bot
//             'host'  → simülasyonu bu cihaz yürütür, durumu ~15 Hz yayınlar
//             'guest' → v77: İSTEMCİ TAHMİNİ — konuk aynı simülasyonu kendi
//                       cihazında da yürütür; kendi girdisi ANINDA ekrana
//                       yansır. Ev sahibinden gelen her durum (yetkili kaynak)
//                       geldiğinde tahmin, ağ gecikmesi kadar ileri sarılarak
//                       düzeltilir ve görüntü yumuşakça yeni duruma kayar.
//                       Skor/sonuç her zaman ev sahibinin durumundan gelir.
// =============================================================================
const DT = 1 / 60;
const SEND_MS = 50; // ~20 Hz durum yayını
const clone = (o) => JSON.parse(JSON.stringify(o));
// tahminde ev sahibinin durumundan aynen alınan (skor/sonuç) alanlar
const NET_AUTH = ['sc', 'wins', 'round', 'over', 'win', 'msg', 'names'];
const BTN_LABEL = { L: '◀', R: '▶', U: '⤴', A: 'A', B: 'B' };
const KEYMAP = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'U', w: 'U', W: 'U', ' ': 'A', j: 'A', J: 'A', k: 'B', K: 'B', l: 'B', L: 'B', ArrowDown: 'B' };

export default function GameRunner({ game, mode, names, onExit, onAgain }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(0);
  const [result, setResult] = useState(null);
  const [netMsg, setNetMsg] = useState(mode.kind === 'guest' ? 'Bağlanılıyor…' : '');
  const [pressed, setPressed] = useState(0);
  const me = mode.kind === 'guest' ? 1 : 0;

  // tuval boyutu
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    const fit = () => {
      const w = wrap.clientWidth;
      const h = Math.round((w * game.H) / game.W);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [game]);

  // klavye
  useEffect(() => {
    const set = (k, v) => {
      const b = KEYMAP[k];
      if (!b) return false;
      const bit = IN[b];
      inputRef.current = v ? inputRef.current | bit : inputRef.current & ~bit;
      setPressed(inputRef.current);
      return true;
    };
    const down = (e) => set(e.key, true) && e.preventDefault();
    const up = (e) => set(e.key, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ana döngü
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let alive = true;
    let state = game.create(names);
    const botMem = {};
    let acc = 0;
    let last = performance.now();
    let lastSend = 0;
    let guestInput = 0;
    let guestEcho = 0; // konuğun son girdisinin gönderim anı (geri yansıtılır)
    // konuk tahmini
    let pred = null; // yerel simülasyon
    let vis = null; // ekrana çizilen (düzeltmeler yumuşatılır)
    let rtt = 150;
    let lastEcho = 0;
    let predAcc = 0;
    let conn = null;
    let ended = false;
    // konuk: ev sahibinden gelen son (yetkili) durum
    let snapB = null;

    const finish = (res) => {
      if (ended) return;
      ended = true;
      setResult(res);
    };

    if (mode.kind !== 'bot') {
      connectRoom(mode.gameId, mode.roomId, mode.kind, {
        onInput: (v) => {
          guestInput = v % 32;
          guestEcho = Math.floor(v / 32);
        },
        onState: (json) => {
          try {
            const s = JSON.parse(json);
            const now = performance.now();
            snapB = { s, at: now };
            // gecikme ölçümü: ev sahibi son girdimizin zamanını geri yolladı
            if (s._echo && s._echo !== lastEcho) {
              lastEcho = s._echo;
              const sample = now - s._echo;
              if (sample > 0 && sample < 3000) rtt = rtt * 0.8 + sample * 0.2;
            }
            // tahmini yetkili duruma oturt ve gecikme kadar ileri sar
            pred = clone(s);
            const hostIn = s._in?.[0] || 0;
            const ahead = Math.min(0.3, Math.max(0, rtt / 2000 + SEND_MS / 2000));
            for (let k = Math.round(ahead / DT); k > 0; k--) game.step(pred, [hostIn, inputRef.current], DT);
            if (!vis) vis = clone(pred);
            setNetMsg('');
          } catch {
            /* bozuk paket */
          }
        },
        onGuest: (g) => {
          if (mode.kind === 'host' && g?.left && !ended) finish({ winner: 0, text: 'Rakip oyundan ayrıldı', forfeit: true });
        },
        onMeta: (meta) => {
          if (mode.kind === 'guest' && !meta && !ended) finish({ winner: 1, text: 'Ev sahibi oyundan ayrıldı', forfeit: true });
        },
      }).then((c) => {
        if (!alive) {
          c.close();
          return;
        }
        conn = c;
        if (mode.kind === 'host') c.setStatus('playing');
      });
    }

    const draw = (s) => {
      ctx.setTransform(cv.width / game.W, 0, 0, cv.height / game.H, 0, 0);
      game.render(ctx, s, me);
    };

    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (mode.kind === 'guest') {
        conn?.sendInput(inputRef.current);
        if (snapB && pred) {
          // kendi girdimizle yerel simülasyon (anında tepki)
          const hostIn = snapB.s._in?.[0] || 0;
          predAcc += dt;
          while (predAcc >= DT) {
            predAcc -= DT;
            game.step(pred, [hostIn, inputRef.current], DT);
          }
          // skor/sonuç hep ev sahibinden
          NET_AUTH.forEach((k) => {
            if (k in snapB.s) pred[k] = clone(snapB.s[k]);
          });
          // düzeltmeleri yumuşat (~50 ms)
          const k = 1 - Math.exp(-dt * 22);
          vis = (game.lerp || lerpState)(vis || pred, pred, k);
          draw(vis);
          const res = game.result(snapB.s);
          if (res) finish(res);
        } else if (snapB) {
          draw(snapB.s);
        } else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = '#05070d';
          ctx.fillRect(0, 0, cv.width, cv.height);
        }
        return;
      }
      if (document.hidden && mode.kind === 'bot') return;
      acc += dt;
      while (acc >= DT) {
        acc -= DT;
        const other = mode.kind === 'bot' ? game.bot(state, 1, botMem) : guestInput;
        game.step(state, [inputRef.current, other], DT);
      }
      draw(state);
      if (mode.kind === 'host' && conn && now - lastSend > SEND_MS) {
        lastSend = now;
        // _in: girdiler (konuk tahmini için) · _echo: konuğun son girdi zamanı (gecikme ölçümü)
        conn.sendState(JSON.stringify({ ...state, _in: [inputRef.current, guestInput], _echo: guestEcho }));
      }
      const res = game.result(state);
      if (res) {
        if (mode.kind === 'host' && conn) {
          conn.sendState(JSON.stringify(state));
          conn.setStatus('done');
        }
        finish(res);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (conn) conn.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mode]);

  const press = (b, v) => (e) => {
    e.preventDefault();
    const bit = IN[b];
    inputRef.current = v ? inputRef.current | bit : inputRef.current & ~bit;
    setPressed(inputRef.current);
  };
  // (bileşen değil düz fonksiyon: her basışta yeniden oluşturulup dokunmayı kaybetmesin)
  const renderBtn = (b) => (
    <button
      key={b}
      type="button"
      className={`gs-btn${pressed & IN[b] ? ' on' : ''}`}
      onPointerDown={press(b, true)}
      onPointerUp={press(b, false)}
      onPointerLeave={press(b, false)}
      onPointerCancel={press(b, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {game.controls.labels?.[b] || BTN_LABEL[b]}
    </button>
  );

  const outcome = result ? (result.winner < 0 ? 'Berabere' : result.winner === me ? 'Kazandın! 🎉' : 'Kaybettin') : '';

  return (
    <div className="gs-runner">
      <div className="gs-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="gs-canvas" />
        {netMsg && <div className="gs-net">{netMsg}</div>}
        {result && (
          <div className="gs-result">
            <p className="gs-result-title">{outcome}</p>
            {result.text && <p className="gs-result-sub">{result.text}</p>}
            <div className="gs-result-btns">
              {onAgain && (
                <button type="button" className="gs-pill primary" onClick={onAgain}>
                  {mode.kind === 'bot' ? '🔁 Tekrar oyna' : '🔁 Yeni maç'}
                </button>
              )}
              <button type="button" className="gs-pill" onClick={onExit}>
                Menü
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="gs-pad">
        <div className="gs-pad-side">
          {game.controls.left.map(renderBtn)}
        </div>
        <div className="gs-pad-side right">
          {game.controls.right.map(renderBtn)}
        </div>
      </div>
      <p className="gs-keys">Klavye: ← → hareket · ↑ zıpla · Boşluk / J · K</p>
    </div>
  );
}
