import { useEffect, useRef, useState } from 'react';
import { carStats, RACE_CAR_LOOKS } from '../../../functions/raceSim.js';
import { createTimeAttackGame, fmtRace } from '../RaceTrackScreen/timeAttackGame';
import '../RaceTrackScreen/TimeAttackRace.css';

// =============================================================================
// v81 — Yayında yarış (şampiyona / bahisli / antrenman). Yayıncı ~10 kez/sn
// küçük bir durum yollar ({x,y,a,vx,vy,f,nos,ni,pd,ph,cd,o,…}); burada aynı gece
// pisti zamana karşı yarış motorunun "izleyici" kipiyle (fizik yok, ara değer)
// çizilir. Sonuç ekranı da gösterilir.
// frameRef.current: { g:'race', s(json), at }
// =============================================================================
const MODE_LABEL = { champ: '🏆 Şampiyona', bet: '🏁 Bahisli Yarış', training: '🎓 Antrenman' };

export default function StreamRaceView({ frameRef }) {
  const [meta, setMeta] = useState(null); // { key, md, cat, lv, oc, on }
  const [res, setRes] = useState(null);
  const lastAt = useRef(0);
  const lastData = useRef(null);
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const engRef = useRef(null);
  const hud = { tm: useRef(null), sp: useRef(null), nb: useRef(null), pg: useRef(null), pgo: useRef(null), wrong: useRef(null), cd: useRef(null), gap: useRef(null) };


  // kareleri oku (tek döngü; oyun motoru ayrı kurulur)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const f = frameRef.current;
      if (!f || f.g !== 'race' || f.at === lastAt.current) return;
      lastAt.current = f.at;
      let d;
      try {
        d = JSON.parse(f.s);
      } catch {
        return;
      }
      lastData.current = d;
      const key = `${d.md}|${d.cat}|${d.lv}|${d.oc}|${d.on}`;
      setMeta((m) => (m?.key === key ? m : { key, md: d.md, cat: d.cat, lv: d.lv, oc: d.oc, on: d.on }));
      const r = d.res || null;
      setRes((p) => (JSON.stringify(p) === JSON.stringify(r) ? p : r));
      engRef.current?.feed(d);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frameRef]);

  useEffect(() => {
    if (!meta || !canvasRef.current) return undefined;
    const car = carStats(meta.cat || 1, meta.lv || 1);
    const opp = meta.oc ? { look: RACE_CAR_LOOKS[meta.oc] || RACE_CAR_LOOKS[1], name: meta.on || 'Rakip', sample: () => null } : null;
    const g = createTimeAttackGame({
      canvas: canvasRef.current,
      mini: miniRef.current,
      hud: Object.fromEntries(Object.entries(hud).map(([k, r]) => [k, r.current])),
      car,
      opp,
      spectate: true,
    });
    engRef.current = g;
    if (lastData.current) g.feed(lastData.current);
    return () => {
      g.destroy();
      engRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.key]);

  const opp = Boolean(meta?.oc);
  return (
    <div className="ta-root st-race">
      <canvas ref={canvasRef} className="ta-canvas" />
      <div className="ta-hud">
        <div className="tl">
          <div className="lbl">SÜRE</div>
          <div ref={hud.tm} className="tm">
            00:00.000
          </div>
          <canvas ref={miniRef} className="ta-mm" width="128" height="192" />
        </div>
        <div className="tc">
          <div className="lbl">{meta ? MODE_LABEL[meta.md] || 'YARIŞ' : 'YARIŞ'}</div>
          <div className="nb">
            <i ref={hud.nb} />
          </div>
          <div className="pg">
            <i ref={hud.pg} />
            {opp && <b ref={hud.pgo} />}
          </div>
          {opp && <div ref={hud.gap} className="ta-gap" />}
        </div>
        <div className="tr">
          <div ref={hud.sp} className="sp">
            0
          </div>
          <div className="lbl">KM/H</div>
        </div>
      </div>
      <div ref={hud.cd} className="ta-cd" />
      <div ref={hud.wrong} className="ta-wrong">
        TERS YÖN!
      </div>
      {res && (
        <div className="st-race-res">
          <small>{res.w === 1 ? 'KAZANDI!' : res.w === 0 ? 'KAYBETTİ' : res.w === 2 ? 'BERABERE' : res.ms ? 'BİTİŞ' : 'YARIŞ BİTTİ'}</small>
          {res.gr && <b className="gr">{res.gr}</b>}
          {res.ms ? <b>{fmtRace(res.ms)}</b> : null}
        </div>
      )}
    </div>
  );
}
