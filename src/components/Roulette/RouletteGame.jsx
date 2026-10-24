import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { spinRoulette } from '../../services/gameActions';
import {
  ROULETTE_ORDER,
  ROULETTE_CHIPS,
  ROULETTE_MAX_TOTAL,
  rouletteColor,
  rouletteMult,
  rouletteKeyLabel,
  rouletteMaxNetWin,
} from '../../../functions/casinoRules.js';
import './Roulette.css';

// =============================================================================
// v124 — RULET (kullanıcının örneği Rulet.html'in telefona uyarlanmış hâli)
// 0–12 çark; sayıya veya yeşile (0) bahis 12 katı, kırmızı/siyaha 2 katı geri.
// Fiş 10 / 100 / 1000. Bahisler cihazda dizilir; "Çevir"e basınca sonuç
// SUNUCUDA çekilir (spinRoulette) ve çark o sayıya döner.
// Props:
//   casinoId     — 'game' (oyunun gazinosu) ya da oyuncu gazinosunun evi (Faz 6)
//   bankLimit    — oyuncu gazinosunda masanın altını (kazancı karşılamalı); null = sınırsız
//   onResult     — (sonuç) => void  (yayın vb. için)
//   onState      — v124 Faz 7 yayın: ({ b: bahisler, s: dönüyor mu, r: son çevirme {id,i,n,net} }) => void
//   mirror       — v124 Faz 7 izleyici: yayıncının onState çıktısı; butonsuz, çark aynı sayıya döner
// =============================================================================
const N = ROULETTE_ORDER.length;
const TAU = Math.PI * 2;
const COLORS = { red: '#b8302a', black: '#17191b', green: '#1f7a46' };
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const SPIN_MS = 5200;
const NO_BANK_TEXT = 'Casinoda yeterli altın olmadığı için bu bahis açılamıyor.';

function drawWheel(ctx, wheelAngle, ball) {
  const cx = 160;
  const cy = 160;
  ctx.clearRect(0, 0, 320, 320);
  ctx.fillStyle = '#4a2f14';
  ctx.beginPath();
  ctx.arc(cx, cy, 158, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#d2ab55';
  ctx.lineWidth = 3;
  ctx.stroke();
  const seg = TAU / N;
  ROULETTE_ORDER.forEach((n, i) => {
    const a0 = wheelAngle + i * seg - Math.PI / 2 - seg / 2;
    const a1 = a0 + seg;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 140, a0, a1);
    ctx.closePath();
    ctx.fillStyle = COLORS[rouletteColor(n)];
    ctx.fill();
    ctx.strokeStyle = '#d2ab55';
    ctx.lineWidth = 1;
    ctx.stroke();
    const am = (a0 + a1) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(am) * 122, cy + Math.sin(am) * 122);
    ctx.rotate(am + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 98, 0, TAU);
  ctx.fillStyle = '#2a1c0c';
  ctx.fill();
  ctx.strokeStyle = '#d2ab55';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, TAU);
  ctx.fillStyle = '#d2ab55';
  ctx.fill();
  if (ball) {
    const a = ball.angle - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * ball.r, cy + Math.sin(a) * ball.r, 6, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Masa: 1–12 iki sıra, altta Kırmızı · Siyah · Yeşil (0)
const BOARD = [
  ...Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return { key: `n${n}`, label: String(n), cls: rouletteColor(n), row: Math.ceil(n / 6), col: ((n - 1) % 6) + 1, span: 1 };
  }),
  { key: 'red', label: 'Kırmızı', cls: 'red', row: 3, col: 1, span: 2 },
  { key: 'black', label: 'Siyah', cls: 'black', row: 3, col: 3, span: 2 },
  { key: 'green', label: 'Yeşil (0)', cls: 'green', row: 3, col: 5, span: 2 },
];

export default function RouletteGame({ casinoId = 'game', bankLimit = null, onResult, onState, mirror = null }) {
  const { player } = usePlayer();
  const gold = Math.max(0, Math.floor(Number(player?.gold || 0)));
  const [chip, setChip] = useState(10);
  const [bets, setBets] = useState({});
  const [stack, setStack] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState('Bir fiş seç, masada bahis koy, sonra çevir.');
  const [hist, setHist] = useState([]);
  const [lastWin, setLastWin] = useState(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const angleRef = useRef(0);
  const rafRef = useRef(0);
  const aliveRef = useRef(true);

  const [lastSpin, setLastSpin] = useState(null); // { id, i, n, net } — yayına giden son çevirme
  const watch = Boolean(mirror);
  const shownBets = watch ? mirror?.b || {} : bets;
  const total = Object.values(shownBets).reduce((a, b) => a + b, 0);
  // Çark dönerken bakiye donar (sonuç sunucudan önce gelir; sürpriz bozulmasın)
  const [frozen, setFrozen] = useState(null);
  const balance = frozen ?? gold - total;

  useEffect(() => {
    aliveRef.current = true;
    const cv = canvasRef.current;
    if (!cv) return undefined;
    // (yayında izleyici de aynı çarkı çizer)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = 320 * dpr;
    cv.height = 320 * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    drawWheel(ctx, angleRef.current, null);
    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const place = (key) => {
    if (spinning || watch) return;
    if (balance < chip) {
      setMsg('Bakiye yetersiz. Daha küçük bir fiş seç.');
      return;
    }
    if (total + chip > ROULETTE_MAX_TOTAL) {
      setMsg(`Tek çevirmede en fazla ${fmt(ROULETTE_MAX_TOTAL)} altın bahis açılabilir.`);
      return;
    }
    const next = { ...bets, [key]: (bets[key] || 0) + chip };
    if (bankLimit != null && rouletteMaxNetWin(next) > bankLimit) {
      setMsg(NO_BANK_TEXT);
      return;
    }
    setBets(next);
    setStack((s) => [...s, [key, chip]]);
    setLastWin(null);
  };
  const undo = () => {
    const s = stack[stack.length - 1];
    if (!s || spinning) return;
    setStack(stack.slice(0, -1));
    setBets((b) => {
      const n = { ...b, [s[0]]: (b[s[0]] || 0) - s[1] };
      if (!n[s[0]]) delete n[s[0]];
      return n;
    });
  };
  const clear = () => {
    if (spinning) return;
    setBets({});
    setStack([]);
  };

  const animateTo = useCallback(
    (idx) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const w0 = angleRef.current;
        const turns = 6 + Math.random() * 2;
        const target = (idx * TAU) / N;
        const frame = (now) => {
          if (!aliveRef.current) return resolve();
          const t = Math.min((now - t0) / SPIN_MS, 1);
          const e = 1 - Math.pow(1 - t, 3);
          angleRef.current = w0 + e * TAU * 1.5;
          const rel = target - (1 - e) * turns * TAU;
          let r = 128;
          if (t > 0.7) {
            const k = (t - 0.7) / 0.3;
            r = 128 - (128 - 122) * k + (k < 1 ? Math.sin(k * 18) * 4 * (1 - k) : 0);
          }
          drawWheel(ctxRef.current, angleRef.current, { angle: angleRef.current + rel, r });
          if (t < 1) rafRef.current = requestAnimationFrame(frame);
          else resolve();
        };
        rafRef.current = requestAnimationFrame(frame);
      }),
    []
  );

  const spin = async () => {
    if (spinning || !total) return;
    setSpinning(true);
    setFrozen(gold - total);
    setMsg('Top dönüyor…');
    const placed = bets;
    let res;
    try {
      res = (await spinRoulette(placed, casinoId)).data;
    } catch (err) {
      setSpinning(false);
      setFrozen(null);
      setMsg(err?.message || 'Çevirme başarısız.');
      return;
    }
    setLastSpin({ id: Date.now(), i: res.index, n: res.number, net: res.net });
    await animateTo(res.index);
    if (!aliveRef.current) return;
    const n = res.number;
    const name = n === 0 ? 'yeşil' : rouletteColor(n) === 'red' ? 'kırmızı' : 'siyah';
    setMsg(`${n} ${name}. ` + (res.net > 0 ? `Kazandın: +${fmt(res.net)} altın` : res.net === 0 ? 'Bahsin geri döndü.' : `Kaybettin: ${fmt(res.net)} altın`));
    setHist((h) => [n, ...h].slice(0, 14));
    setLastWin(n === 0 ? 'green' : `n${n}`);
    setBets({});
    setStack([]);
    setSpinning(false);
    setFrozen(null);
    onResult?.({ ...res, bets: placed });
  };

  // v124 Faz 7 — yayıncı: masa durumu değiştikçe yayına
  useEffect(() => {
    if (!watch) onState?.({ b: bets, s: spinning ? 1 : 0, r: lastSpin });
  }, [bets, spinning, lastSpin, watch, onState]);
  // v124 Faz 7 — izleyici: yeni çevirme gelince çark aynı sayıya döner
  const mSpinId = mirror?.r?.id || null;
  const seenSpin = useRef(undefined);
  useEffect(() => {
    if (!watch) return;
    if (seenSpin.current === undefined) {
      seenSpin.current = mSpinId; // yayına sonradan girildi: eski çevirme oynatılmaz
      return;
    }
    if (!mSpinId || seenSpin.current === mSpinId) return;
    seenSpin.current = mSpinId;
    const r = mirror.r;
    setSpinning(true);
    setMsg('Top dönüyor…');
    animateTo(r.i).then(() => {
      if (!aliveRef.current) return;
      const name = r.n === 0 ? 'yeşil' : rouletteColor(r.n) === 'red' ? 'kırmızı' : 'siyah';
      setMsg(`${r.n} ${name}. ` + (r.net > 0 ? `Kazandı: +${fmt(r.net)} altın` : r.net === 0 ? 'Bahis geri döndü.' : `Kaybetti: ${fmt(r.net)} altın`));
      setHist((h) => [r.n, ...h].slice(0, 14));
      setLastWin(r.n === 0 ? 'green' : `n${r.n}`);
      setSpinning(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mSpinId, watch, animateTo]);

  const keys = Object.keys(shownBets);
  return (
    <div className="rl-root">
      <section className="rl-panel" aria-label="Çark">
        <canvas ref={canvasRef} className="rl-canvas" aria-label="Rulet çarkı" />
        <div className="rl-stats">
          {!watch && (
            <span>
              Bakiye <b>{fmt(balance)}</b>
            </span>
          )}
          <span>
            Bahis <b>{fmt(total)}</b>
          </span>
        </div>
        <p className="rl-msg" aria-live="polite">
          {watch && !spinning && !hist.length ? 'Bahisler masada…' : msg}
        </p>
        {hist.length > 0 && (
          <div className="rl-hist" aria-label="Son sayılar">
            {hist.map((n, i) => (
              <span key={i} className={`rl-h ${rouletteColor(n)}`}>
                {n}
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="rl-panel" aria-label="Masa">
        {!watch && <div className="rl-chips">
          <span>Fiş:</span>
          {ROULETTE_CHIPS.map((v) => (
            <button key={v} className="rl-chip" aria-pressed={chip === v} onClick={() => setChip(v)}>
              {v >= 1000 ? '1K' : v}
            </button>
          ))}
        </div>}
        <div className="rl-board">
          {BOARD.map((c) => (
            <button
              key={c.key}
              className={`rl-cell ${c.cls}${lastWin === c.key ? ' win' : ''}`}
              style={{ gridRow: c.row, gridColumn: c.span > 1 ? `${c.col} / span ${c.span}` : c.col }}
              aria-label={`Bahis: ${rouletteKeyLabel(c.key)}`}
              disabled={spinning || watch}
              onClick={() => place(c.key)}
            >
              {c.label}
              {shownBets[c.key] ? <span className="rl-amt">{shownBets[c.key] >= 1000 ? `${Math.floor(shownBets[c.key] / 100) / 10}K` : shownBets[c.key]}</span> : null}
            </button>
          ))}
        </div>
        <div className="rl-slip" aria-live="polite">
          {keys.length ? (
            keys.map((k) => {
              const t = shownBets[k] * rouletteMult(k);
              return (
                <div key={k}>
                  <span>
                    {rouletteKeyLabel(k)}: {fmt(shownBets[k])}
                  </span>
                  <span>
                    {watch ? 'kazanırsa' : 'kazanırsan'} <b>{fmt(t)}</b> (+{fmt(t - shownBets[k])})
                  </span>
                </div>
              );
            })
          ) : (
            <div>
              <span>{watch ? 'Henüz bahis yok.' : 'Henüz bahis yok. Fiş seç, masaya dokun.'}</span>
            </div>
          )}
        </div>
        {!watch && <div className="rl-actions">
          <button className="rl-btn main" disabled={spinning || !keys.length} onClick={spin}>
            {spinning ? 'Dönüyor…' : 'Çevir'}
          </button>
          <button className="rl-btn" disabled={spinning || !stack.length} onClick={undo}>
            Geri al
          </button>
          <button className="rl-btn" disabled={spinning || !stack.length} onClick={clear}>
            Temizle
          </button>
        </div>}
        <p className="rl-note">Çarkta 0–12 var. Sayıya veya yeşile (0) bastıysan bahsin 12 katı, kırmızı/siyaha bastıysan 2 katı geri gelir.</p>
      </section>
    </div>
  );
}
