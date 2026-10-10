import { useEffect, useRef, useState } from 'react';
import { IN, IN_MASK, lerpState, NO_LERP, softenBotInput } from './games/common.js';
import { connectRoom } from './net';
import { publishGameFrame, clearGameFrame, streamBroadcast } from '../Stream/streamShared';

// =============================================================================
// v79 — GameRunner: 2–4 oyunculu oyun döngüsü + dokunmatik/klavye kontrolleri.
//  mode.kind: 'bot'   → yerel simülasyon, rakipler bot
//             'host'  → simülasyonu bu cihaz yürütür (yetkili), durumu ~20 Hz yayınlar;
//                       ayrılan oyuncunun yerine bot geçer
//             'guest' → ANLIK GÖRÜNTÜ ARA DEĞERLEME: ekrana ev sahibinin son iki
//                       durumu arasında ~100 ms geriden, akıcı çizilir (zıplama yok).
//                       Sadece KENDİ karakterin yerelde tahmin edilir (anında tepki);
//                       skor/olay/sonuç her zaman ev sahibinden gelir.
//                       (v79 öncesi: tüm durum 0,3 sn ileri tahmin ediliyor, konukta
//                       kendi kendine gol/duraklama oluyor ve skor ara değere
//                       çekiliyordu → kasma + bozuk skor tablosu.)
// Oyun arayüzü: { id, W, H, min, max, controls, create(names), step(s, inputs, dt),
//   bot(s, i, mem), result(s), render(c, s, me), selfKey?='p', predict?=true, noLerp? }
// =============================================================================
const DT = 1 / 60;
const SEND_MS = 33; // v81: ~30 Hz durum yayını (eskiden 20 Hz) — RTDB bant genişliği, Firestore değil
// v81 — konuk: ekranı geriden çizme payı artık AĞA GÖRE kendiliğinden ayarlanır
// (paketlerin geliş aralığı + titremesi). Sabit 105 ms, mobil ağda paket geç
// gelince ekranı dondurup sıçratıyordu ("lag").
const INTERP_MIN = 55;
const INTERP_MAX = 240;
const INTERP_START = 100;
const EXTRAP_MAX = 0.45; // paket gecikirse en fazla bu oranda ileri tahmin
const PRED_MAX_MS = 1200; // v86: konuk kendi girdilerini en fazla bu kadar geriden yeniden oynatır
const clone = (o) => JSON.parse(JSON.stringify(o));
const BTN_LABEL = { L: '◀', R: '▶', U: '⤴', D: '⤵', A: 'A', B: 'B' };
const KEYMAP = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'U', w: 'U', W: 'U', ' ': 'A', j: 'A', J: 'A', k: 'B', K: 'B', l: 'B', L: 'B', ArrowDown: 'B', s: 'B', S: 'B' };

export default function GameRunner({ game, mode, names, onExit, onAgain }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stickRef = useRef(null);
  const draggingRef = useRef(false);
  const inputRef = useRef(0);
  const [result, setResult] = useState(null);
  const [netMsg, setNetMsg] = useState(mode.kind === 'guest' ? 'Bağlanılıyor…' : '');
  const [pressed, setPressed] = useState(0);
  const [knob, setKnob] = useState(null);
  const me = mode.kind === 'guest' ? mode.me : 0;
  const stick = Boolean(game.controls.stick);
  const selfKey = game.selfKey || 'p';

  const setBits = (fn) => {
    inputRef.current = fn(inputRef.current) & IN_MASK;
    setPressed(inputRef.current);
  };

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

  // klavye (joystick'li oyunlarda ↓ = aşağı)
  useEffect(() => {
    const set = (k, v) => {
      let b = KEYMAP[k];
      if (stick && (k === 'ArrowDown' || k === 's' || k === 'S')) b = 'D';
      if (!b) return false;
      const bit = IN[b];
      setBits((cur) => (v ? cur | bit : cur & ~bit));
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
  }, [stick]);

  // ana döngü
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    const n = names.length;
    const roster = mode.roster || names.map((nm, i) => ({ name: nm, bot: i !== 0 }));
    const myUid = mode.myUid || '';
    let raf = 0;
    let alive = true;
    let state = game.create(names);
    // v86: bot zorluğu (kolay = aynı bot, insan acemiliğinde; zor = eski botlar)
    const easy = mode.level === 'easy';
    const botMem = names.map(() => (easy && game.easy?.skill != null ? { skill: game.easy.skill } : {}));
    const botIn = (i) => {
      const raw = game.bot(state, i, botMem[i]);
      return easy ? softenBotInput(raw, botMem[i], game.easy) : raw;
    };
    let acc = 0;
    let last = performance.now();
    let lastSend = 0;
    let conn = null;
    let ended = false;
    // ev sahibi
    const guestIn = {}; // uid → bitler
    const guestEcho = {}; // uid → konuğun son girdi zamanı (geri yansıtılır)
    const gone = new Set(); // ayrılan oyuncuların uid'leri (yerlerine bot)
    // konuk
    const snaps = []; // [{ at, s }]
    let pred = null;
    let predAcc = 0;
    let selfVis = null;
    let rtt = 140;
    let lastEcho = 0;
    let lastSnapAt = 0;
    let avgIv = SEND_MS * 1.5; // paket geliş aralığı (ortalama)
    let jit = 15; // titreme
    let interpMs = INTERP_START;
    const predVis = {}; // v81: game.predictKeys (ör. kafa topunda top) — yerel tahmin, yumuşak düzeltme
    // v86 — konuğun girdi geçmişi (zaman, bitler): ev sahibinin "şu ana kadar aldım"
    // dediği andan (state._e) sonraki girdiler yetkili durumun üstünde yeniden oynatılır
    // (istemci tarafı uzlaştırma). Eskiden sadece rtt/2 ileri sarılıyordu → katılanın
    // kendi karakteri her pakette geri çekiliyor, donuyor, bırakınca kayıyordu.
    const hist = [];
    const bitsAt = (t) => {
      for (let k = hist.length - 1; k >= 0; k--) if (hist[k][0] <= t) return hist[k][1];
      return hist.length ? hist[0][1] : 0;
    };

    const finish = (res) => {
      if (ended) return;
      ended = true;
      setResult(res);
    };
    const humanOthers = () => roster.filter((r, i) => i !== 0 && !r.bot && r.uid && !gone.has(r.uid));

    if (mode.kind !== 'bot') {
      connectRoom(
        mode.gameId,
        mode.roomId,
        mode.kind,
        {
          onInputs: (obj) => {
            Object.entries(obj).forEach(([uid, v]) => {
              const num = Number(v) || 0;
              guestIn[uid] = num % 64;
              guestEcho[uid] = Math.floor(num / 64);
            });
          },
          onPlayers: (p) => {
            Object.values(p).forEach((v) => {
              if (v?.uid && v.left) gone.add(v.uid);
            });
            if (mode.kind === 'host' && !ended && humanOthers().length === 0 && roster.filter((r) => !r.bot).length === 2) {
              finish({ winner: 0, text: 'Rakip oyundan ayrıldı', forfeit: true });
            }
          },
          onState: (json) => {
            try {
              const s = JSON.parse(json);
              const now = performance.now();
              if (lastSnapAt) {
                const iv = Math.min(1000, now - lastSnapAt);
                avgIv = avgIv * 0.92 + iv * 0.08;
                jit = jit * 0.9 + Math.abs(iv - avgIv) * 0.1;
              }
              snaps.push({ at: now, s });
              while (snaps.length > 20) snaps.shift();
              lastSnapAt = now;
              // gecikme ölçümü: ev sahibi son girdimizin zamanını geri yolladı
              const echo = s._e?.[myUid];
              if (echo && echo !== lastEcho) {
                lastEcho = echo;
                const sample = now - echo;
                if (sample > 0 && sample < 3000) rtt = rtt * 0.8 + sample * 0.2;
              }
              // kendi karakterimiz için tahmin: yetkili duruma otur, ev sahibinin henüz
              // almadığı girdilerimizi (echo'dan bu yana) geçmişten yeniden oynat
              if (game.predict !== false && !s.over) {
                const base = clone(s);
                base._pred = true;
                const ins = (s._in || []).slice();
                if (!(base.pause > 0)) {
                  const from = echo && now - echo > 0 && now - echo < PRED_MAX_MS ? echo : null;
                  if (from != null) {
                    const steps = Math.round((now - from) / 1000 / DT);
                    for (let k = 0; k < steps; k++) {
                      ins[me] = bitsAt(from + k * DT * 1000);
                      game.step(base, ins, DT);
                      if (base.pause > 0) break;
                    }
                  } else {
                    ins[me] = inputRef.current;
                    const ahead = Math.min(PRED_MAX_MS / 1000, Math.max(0, rtt / 1000));
                    for (let k = Math.round(ahead / DT); k > 0; k--) game.step(base, ins, DT);
                  }
                }
                predAcc = 0;
                pred = base;
              } else pred = null;
              setNetMsg('');
            } catch {
              /* bozuk paket */
            }
          },
          onMeta: (meta) => {
            if (mode.kind === 'guest' && !meta && !ended) finish({ winner: -2, text: 'Ev sahibi oyundan ayrıldı', forfeit: true });
          },
        },
        myUid,
        mode.slot
      ).then((c) => {
        if (!alive) {
          c.close();
          return;
        }
        conn = c;
      });
    }

    const draw = (s) => {
      ctx.setTransform(cv.width / game.W, 0, 0, cv.height / game.H, 0, 0);
      game.render(ctx, s, me);
    };
    const skip = game.noLerp ? new Set([...NO_LERP, ...game.noLerp]) : NO_LERP;
    const lerpFn = game.lerp || ((a, b, t) => lerpState(a, b, t, skip));

    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (mode.kind === 'guest') {
        conn?.sendInput(inputRef.current);
        // girdi geçmişi (en fazla ~1,5 sn)
        if (!hist.length || hist[hist.length - 1][1] !== inputRef.current) hist.push([now, inputRef.current]);
        while (hist.length > 2 && hist[1][0] < now - PRED_MAX_MS - 300) hist.shift();
        if (!snaps.length) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = '#05070d';
          ctx.fillRect(0, 0, cv.width, cv.height);
          return;
        }
        // ekran zamanı: en yeni paketten interpMs geride → iki paket arası
        const want = Math.max(INTERP_MIN, Math.min(INTERP_MAX, avgIv * 1.15 + jit * 2.5 + 8));
        interpMs += (want - interpMs) * Math.min(1, dt * 1.5); // yavaş uyum: zaman sıçramasın
        const target = now - interpMs;
        let a = snaps[0];
        let b = snaps[snaps.length - 1];
        for (let k = snaps.length - 1; k > 0; k--) {
          if (snaps[k - 1].at <= target) {
            a = snaps[k - 1];
            b = snaps[k];
            break;
          }
        }
        let view;
        if (a === b) view = b.s;
        else if (target >= b.at) {
          // paket gecikti: donmak yerine kısa süre aynı hızla ileri tahmin
          const over = (target - b.at) / Math.max(1, b.at - a.at);
          view = over > 0 && !b.s.over && !(b.s.pause > 0) ? lerpFn(a.s, b.s, 1 + Math.min(EXTRAP_MAX, over)) : b.s;
        } else if (target <= a.at) view = a.s;
        else view = lerpFn(a.s, b.s, (target - a.at) / Math.max(1, b.at - a.at));
        // kendi karakterimiz: yerel tahmin (anında tepki), düzeltmeler yumuşak
        if (pred && !view.over) {
          const latest = snaps[snaps.length - 1].s;
          if (!(pred.pause > 0)) {
            predAcc += dt;
            const ins = (latest._in || []).slice();
            ins[me] = inputRef.current;
            let guard = 0;
            while (predAcc >= DT && guard++ < 8) {
              predAcc -= DT;
              game.step(pred, ins, DT);
            }
          }
          const mine = pred[selfKey]?.[me];
          if (mine && view[selfKey]?.[me]) {
            selfVis = selfVis ? lerpFn(selfVis, mine, 1 - Math.exp(-dt * 25)) : clone(mine);
            // tahmin yetkili konumdan çok uzaklaştıysa (ölüm/ışınlanma) yetkiliyi kullan
            const auth = latest[selfKey]?.[me];
            // (tahmin artık tam gecikme kadar ileride → eşik gecikmeyle büyür)
            const far = auth && typeof auth.x === 'number' && Math.hypot((selfVis.x ?? 0) - auth.x, (selfVis.y ?? 0) - (auth.y ?? 0)) > Math.max(70, rtt * 0.3);
            view = { ...view, [selfKey]: view[selfKey].map((p, i) => (i === me && !far && !p.dead && !p.out ? { ...p, ...selfVis, dead: p.dead, out: p.out } : p)) };
          }
          // v81: ek tahmin (ör. kafa topunda top): kendi vuruşuna anında tepki verir,
          // ev sahibinden gelen gerçek konuma yumuşakça çekilir; ışınlanmada (gol/başlama) atlar
          if (Array.isArray(game.predictKeys)) {
            for (const k of game.predictKeys) {
              const pk = pred[k];
              if (!pk || typeof pk !== 'object') continue;
              const auth = latest[k];
              // gol / başlama (oyun duraklamada): gerçek konuma atla
              const reset = latest.pause > 0 || pred.pause > 0;
              const cur = predVis[k];
              const tooFar = cur && typeof cur.x === 'number' && Math.hypot((cur.x ?? 0) - (pk.x ?? 0), (cur.y ?? 0) - (pk.y ?? 0)) > 160;
              predVis[k] = reset && auth ? clone(auth) : !cur || tooFar ? clone(pk) : lerpFn(cur, pk, 1 - Math.exp(-dt * 22));
              view = { ...view, [k]: predVis[k] };
            }
          }
        }
        draw(view);
        if (streamBroadcast.uid) publishGameFrame(game, view, names, me); // v80: yayındaysam izleyiciler de görsün
        if (import.meta.env?.DEV && window.__gsTrace) window.__gsTrace.push([now, view.b?.x ?? view.p?.[0]?.x, view.b?.y ?? view.p?.[0]?.y, view.sc ? view.sc.join('-') : '']);
        if (now - lastSnapAt > 6000 && !ended) setNetMsg('Bağlantı zayıf…');
        const res = game.result(snaps[snaps.length - 1].s);
        if (res) finish(res);
        return;
      }

      if (document.hidden && mode.kind === 'bot') return;
      acc += dt;
      let guard = 0;
      while (acc >= DT && guard++ < 10) {
        acc -= DT;
        const ins = [];
        for (let i = 0; i < n; i++) {
          const r = roster[i] || {};
          if (i === 0) ins.push(inputRef.current);
          else if (mode.kind === 'bot' || r.bot || !r.uid || gone.has(r.uid)) ins.push(botIn(i));
          else ins.push(guestIn[r.uid] || 0);
        }
        state._lastIn = ins;
        game.step(state, ins, DT);
      }
      draw(state);
      if (streamBroadcast.uid) publishGameFrame(game, state, names, me); // v80: yayındaysam izleyiciler de görsün
      if (mode.kind === 'host' && conn && now - lastSend > SEND_MS) {
        lastSend = now;
        const { _lastIn, ...pub } = state;
        conn.sendState(JSON.stringify({ ...pub, _in: _lastIn || [], _e: guestEcho }));
      }
      const res = game.result(state);
      if (res) {
        if (mode.kind === 'host' && conn) {
          const { _lastIn, ...pub } = state;
          conn.sendState(JSON.stringify({ ...pub, _in: _lastIn || [] }), true); // maç sonu: her zaman gönder
          conn.setStatus('done');
        }
        finish(res);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (conn) conn.leave(mode.slot);
      if (streamBroadcast.uid) clearGameFrame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mode]);

  const press = (b, v) => (e) => {
    e.preventDefault();
    const bit = IN[b];
    setBits((cur) => (v ? cur | bit : cur & ~bit));
  };
  // (bileşen değil düz fonksiyon: her basışta yeniden oluşturulup dokunmayı kaybetmesin)
  const renderBtn = (b) => (
    <button
      key={b}
      type="button"
      className={`gs-btn${pressed & IN[b] ? ' on' : ''}${game.controls.big?.includes(b) ? ' big' : ''}`}
      onPointerDown={press(b, true)}
      onPointerUp={press(b, false)}
      onPointerLeave={press(b, false)}
      onPointerCancel={press(b, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {game.controls.labels?.[b] || BTN_LABEL[b]}
    </button>
  );

  // v79 — sanal joystick (8 yön → L/R/U/D bitleri)
  const stickMove = (e) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy });
    const dead = 0.32;
    let bits = 0;
    if (len > dead) {
      const ang = Math.atan2(dy, dx);
      const oct = Math.round(ang / (Math.PI / 4)); // -4..4
      const dirs = { 0: IN.R, 1: IN.R | IN.D, 2: IN.D, 3: IN.L | IN.D, 4: IN.L, '-4': IN.L, '-3': IN.L | IN.U, '-2': IN.U, '-1': IN.R | IN.U };
      bits = dirs[oct] || 0;
    }
    setBits((cur) => (cur & ~(IN.L | IN.R | IN.U | IN.D)) | bits);
  };
  const stickEnd = () => {
    draggingRef.current = false;
    setKnob(null);
    setBits((cur) => cur & ~(IN.L | IN.R | IN.U | IN.D));
  };
  // v79 — ekrana dokun = A (ör. Uzay Koşusu'nda yerçekimini çevir)
  const tapProps = game.controls.tap
    ? {
        onPointerDown: (e) => {
          e.preventDefault();
          setBits((cur) => cur | IN.A);
        },
        onPointerUp: () => setBits((cur) => cur & ~IN.A),
        onPointerLeave: () => setBits((cur) => cur & ~IN.A),
        onPointerCancel: () => setBits((cur) => cur & ~IN.A),
      }
    : {};

  const winnerName = result && result.winner >= 0 ? names[result.winner] : '';
  const outcome = result ? (result.winner === -2 ? 'Maç bitti' : result.winner < 0 ? 'Berabere' : result.winner === me ? 'Kazandın! 🎉' : names.length > 2 ? `${winnerName} kazandı` : 'Kaybettin') : '';

  return (
    <div className="gs-runner">
      <div className="gs-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="gs-canvas" {...tapProps} onContextMenu={(e) => e.preventDefault()} />
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
          {stick ? (
            <div
              ref={stickRef}
              className="gs-stick"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                draggingRef.current = true;
                stickMove(e);
              }}
              onPointerMove={(e) => draggingRef.current && stickMove(e)}
              onPointerUp={stickEnd}
              onPointerCancel={stickEnd}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="gs-knob" style={knob ? { transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` } : undefined} />
            </div>
          ) : (
            game.controls.left.map(renderBtn)
          )}
        </div>
        <div className="gs-pad-side right">{game.controls.right.map(renderBtn)}</div>
      </div>
      <p className="gs-keys">{game.controls.hint || (stick ? 'Klavye: ok tuşları hareket · Boşluk / J · K' : 'Klavye: ← → hareket · ↑ zıpla · Boşluk / J · K')}</p>
    </div>
  );
}
