import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { carStats, trainingBotRun, gradeOf, RACE_CAR_LOOKS, FPS } from '../../../functions/raceSim.js';
import { createTimeAttackGame, makeSampler, fmtRace } from './timeAttackGame';
import { taStart, taFinish, taTimeout, createTrainingRace, forfeitRace } from '../../services/gameActions';
import { streamBroadcast, publishRaceFrame, clearGameFrame, useStreamGameHealth } from '../Stream/streamShared';
import './TimeAttackRace.css';

// =============================================================================
// v78 — ZAMANA KARŞI YARIŞ ekranı (antrenman · şampiyona · bahisli)
//  • Yarış tamamen cihazda akar (raceSim, 60 Hz sabit adım) — sunucu beklenmez.
//  • Bitişte tuş kaydı gönderilir; sunucu yarışı yeniden oynatıp süreyi bulur.
//  • Bahisli yarışta rakip "hayalet" olarak görünür: her oyuncu ~0,7 sn'de bir
//    son konumlarını raceGhosts/{oda}_{uid} belgesine yazar. Rakip AYNI YARIŞ
//    SÜRESİNDEKİ konumunda çizilir (başlangıç farkı/lag adaleti bozmaz).
//    Çarpışma yok. Kazanan = daha kısa süre.
// =============================================================================

const GHOST_EVERY = 6; // kare (10 Hz örnek)
const GHOST_WRITE_MS = 700;
const fmtGold = (n) => Math.round(n || 0).toLocaleString('tr-TR');

function useGhost(roomId, uid, enabled) {
  const samplesRef = useRef([]);
  const [fin, setFin] = useState(null);
  useEffect(() => {
    if (!enabled || !roomId || !uid) return undefined;
    const unsub = onSnapshot(
      doc(db, 'raceGhosts', `${roomId}_${uid}`),
      (snap) => {
        const d = snap.data();
        if (!d) return;
        const arr = samplesRef.current;
        const s = Array.isArray(d.s) ? d.s : [];
        for (let i = 0; i + 4 < s.length; i += 5) {
          const f = s[i];
          if (arr.length && f <= arr[arr.length - 1][0]) continue;
          arr.push([f, s[i + 1], s[i + 2], s[i + 3], s[i + 4]]);
        }
        if (d.fin) setFin(d.fin);
      },
      () => {}
    );
    return unsub;
  }, [roomId, uid, enabled]);
  return { samplesRef, fin };
}

export default function TimeAttackRace({ room, myUid, onExit, onSwitchRoom }) {
  const mode = room.isTraining ? 'training' : room.isChampionship ? 'champ' : 'bet';
  const me = room.players?.[myUid] || {};
  const otherUid = mode === 'bet' ? room.participantUids?.find((u) => u !== myUid) : null;
  const other = otherUid ? room.players?.[otherUid] : null;
  const bot = mode === 'training' ? room.players?.bot : null;
  const car = useMemo(() => carStats(me.catalogId || 1, me.level || 1), [me.catalogId, me.level]);

  const alreadyRan = Boolean(me.finishMs || me.dnf || me.runStartedAtMs);
  const initialPhase = room.status === 'finished' ? 'result' : me.finishMs || me.dnf ? 'waiting' : alreadyRan ? 'aborted' : 'running';
  const [phase, setPhase] = useState(initialPhase);
  const [myResult, setMyResult] = useState(me.finishMs ? { ms: me.finishMs } : null);
  const [err, setErr] = useState(null);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem('ta_muted') === '1';
    } catch {
      return false;
    }
  });
  const [confirmExit, setConfirmExit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gameOn, setGameOn] = useState(false);

  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const hud = { tm: useRef(null), sp: useRef(null), nb: useRef(null), pg: useRef(null), pgo: useRef(null), wrong: useRef(null), cd: useRef(null), gap: useRef(null) };
  const gameRef = useRef(null);
  const framesRef = useRef(0);
  const lostRef = useRef(false);

  // Rakip: antrenmanda bot (deterministik simülasyon), bahiste hayalet
  const ghost = useGhost(room.id, otherUid, mode === 'bet');
  const opp = useMemo(() => {
    if (mode === 'training' && bot) {
      const run = trainingBotRun(room.trainingLevel || 1, 2);
      return { look: RACE_CAR_LOOKS[bot.catalogId] || RACE_CAR_LOOKS[1], name: 'Bot', sample: makeSampler(run.samples, { extrapolate: 4 }) };
    }
    if (mode === 'bet' && other) {
      return {
        look: RACE_CAR_LOOKS[other.catalogId] || RACE_CAR_LOOKS[1],
        name: other.displayName || 'Rakip',
        sample: makeSampler(ghost.samplesRef.current, { extrapolate: 150, track: true }),
        smooth: true,
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bot?.catalogId, other?.catalogId, room.trainingLevel]);

  // Rakibin bitirdiği süre (bahis) — onu geçersek yarış kaybedildi
  const otherFinMs = other?.finishMs || ghost.fin || null;
  const otherFinRef = useRef(otherFinMs);
  otherFinRef.current = otherFinMs;

  // --- hayalet yazıcı (bahisli) ---
  const ghostBuf = useRef([]);
  const lastGhostF = useRef(-999);
  const writeGhost = (fin = null) => {
    if (mode !== 'bet') return;
    const s = ghostBuf.current.slice(-14).flat();
    setDoc(doc(db, 'raceGhosts', `${room.id}_${myUid}`), { uid: myUid, roomId: room.id, s, fin, at: serverTimestamp() }).catch(() => {});
  };

  const submit = async (runs, dnf = false) => {
    setErr(null);
    for (let i = 0; i < 4; i++) {
      try {
        const res = await taFinish(room.id, runs, dnf);
        return res?.data || {};
      } catch (e) {
        const msg = e?.message || 'Sonuç gönderilemedi.';
        if (e?.code === 'functions/failed-precondition' || i === 3) {
          setErr(msg);
          return null;
        }
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
    }
    return null;
  };

  // --- oyunu kur (bir kez; ekran kapanana kadar yaşar) ---
  useEffect(() => {
    if (initialPhase !== 'running' || gameRef.current) return undefined;
    let cancelled = false;
    const g = createTimeAttackGame({
      canvas: canvasRef.current,
      mini: miniRef.current,
      hud: Object.fromEntries(Object.entries(hud).map(([k, r]) => [k, r.current])),
      car,
      opp,
      onFrame: (f) => {
        framesRef.current = f;
        if (mode === 'bet') {
          if (f - lastGhostF.current >= GHOST_EVERY) {
            lastGhostF.current = f;
            const st = g.state;
            if (st) ghostBuf.current.push([f, Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10, Math.round(st.a * 1000) / 1000, st.nos ? 1 : 0]);
          }
          // rakip bitirdi ve biz onun süresini geçtik → kaybettik
          const ofm = otherFinRef.current;
          if (ofm && !lostRef.current && (f * 1000) / FPS > ofm) {
            lostRef.current = true;
            g.stop();
            setPhase('submitting');
            submit(null, true).then(() => setPhase('waiting'));
          }
        }
      },
      onFinish: async ({ frames, runs }) => {
        const ms = Math.round((frames * 1000) / FPS);
        setMyResult({ ms, grade: gradeOf(ms, car.catalogId, car.level) });
        setPhase('submitting');
        if (mode === 'bet') {
          const st = g.state;
          ghostBuf.current.push([frames, Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10, Math.round(st.a * 1000) / 1000, 0]);
          writeGhost(ms);
        }
        const res = await submit(runs);
        if (cancelled) return;
        if (res?.finishMs) setMyResult((r) => ({ ...r, ms: res.finishMs }));
        setPhase(res ? 'waiting' : 'error');
      },
    });
    gameRef.current = g;
    if (import.meta.env.DEV) window.__taGame = g; // geliştirme/önizleme testleri için
    setGameOn(true);
    g.setMuted(muted);
    // tek deneme kaydı (yenileyip yeniden denemek engellenir)
    taStart(room.id).catch((e) => {
      if (e?.code === 'functions/already-exists') {
        g.stop();
        setPhase('aborted');
      }
    });
    return () => {
      cancelled = true;
      g.destroy();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v81 — YAYIN: yayındaysan (koltuktan "Oyun oyna → Yarış Pisti") izleyiciler
  // yarışı canlı izler. ~10 kare/sn küçük durum gönderilir; izleyici aynı pisti
  // kendi cihazında çizer. Sonuç ekranı da yayına yansır.
  const [onAir] = useState(() => Boolean(streamBroadcast.uid));
  const onAirHealth = useStreamGameHealth(onAir);
  const pubRef = useRef({});
  pubRef.current = { phase, myResult, grade: myResult?.grade || me.grade || null, finished: room.status === 'finished', winnerUid: room.winnerUid };
  useEffect(() => {
    if (!onAir) return undefined;
    const base = {
      md: mode,
      cat: car.catalogId || 1,
      lv: car.level || 1,
      oc: mode === 'training' ? bot?.catalogId || 1 : mode === 'bet' ? other?.catalogId || 1 : 0,
      on: mode === 'training' ? 'Bot' : mode === 'bet' ? String(other?.displayName || 'Rakip').slice(0, 16) : '',
    };
    const iv = setInterval(() => {
      if (!streamBroadcast.uid) return;
      const g = gameRef.current;
      const pr = pubRef.current;
      const v = g ? g.streamView : null;
      let res = null;
      if (pr.phase !== 'running') {
        const ms = pr.myResult?.ms || me.finishMs || null;
        const won = pr.finished && mode !== 'champ' ? pr.winnerUid === myUid : null;
        res = { ms, gr: pr.grade || (ms ? gradeOf(ms, car.catalogId, car.level) : null), w: won === null ? null : won ? 1 : pr.winnerUid === 'draw' ? 2 : 0 };
      }
      publishRaceFrame({ ...base, ...(v || { ph: 'done' }), res });
    }, 100);
    return () => {
      clearInterval(iv);
      if (streamBroadcast.uid) clearGameFrame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAir, room.id]);

  // hayalet yazımı (0,7 sn'de bir)
  useEffect(() => {
    if (mode !== 'bet' || phase !== 'running') return undefined;
    const iv = setInterval(() => {
      if (ghostBuf.current.length) writeGhost(null);
    }, GHOST_WRITE_MS);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase]);

  // yarıda kalmış deneme (sayfa yenilendi / uygulama kapandı) → bitirilemedi
  useEffect(() => {
    if (phase !== 'aborted' || room.status !== 'racing' || me.finishMs || me.dnf) return;
    submit(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // oda bitti → sonuç (rakip çıktıysa / süre dolduysa yarış da durur)
  useEffect(() => {
    if (room.status !== 'finished' || phase === 'result') return;
    if (phase === 'submitting') return; // kendi sonucumuz yolda
    gameRef.current?.stop();
    setPhase('result');
  }, [room.status, phase]);

  // bahisli: süre doldu
  useEffect(() => {
    if (mode !== 'bet' || room.status !== 'racing' || !room.deadlineMs) return undefined;
    const ms = room.deadlineMs - Date.now() + 1500;
    const t = setTimeout(() => taTimeout(room.id).catch(() => {}), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [mode, room.status, room.deadlineMs, room.id]);

  // klavye
  useEffect(() => {
    const KM = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'g', KeyW: 'g', ArrowDown: 'b', KeyS: 'b', Space: 'n', ShiftLeft: 'n', ShiftRight: 'n', KeyN: 'n' };
    const down = (e) => {
      const k = KM[e.code];
      if (k && gameRef.current) {
        gameRef.current.setKey(k, true);
        e.preventDefault();
      }
    };
    const up = (e) => {
      const k = KM[e.code];
      if (k && gameRef.current) {
        gameRef.current.setKey(k, false);
        e.preventDefault();
      }
    };
    const blur = () => gameRef.current?.releaseAll();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    gameRef.current?.setMuted(m);
    try {
      localStorage.setItem('ta_muted', m ? '1' : '0');
    } catch {
      /* yoksay */
    }
  };

  const btn = (k) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('on');
      gameRef.current?.setKey(k, true);
    },
    onPointerUp: (e) => {
      e.currentTarget.classList.remove('on');
      gameRef.current?.setKey(k, false);
    },
    onPointerCancel: (e) => {
      e.currentTarget.classList.remove('on');
      gameRef.current?.setKey(k, false);
    },
    onPointerLeave: (e) => {
      e.currentTarget.classList.remove('on');
      gameRef.current?.setKey(k, false);
    },
    onContextMenu: (e) => e.preventDefault(),
  });

  // çıkış: yarış sürerken çıkmak = bitirememek (bahiste kaybetmek)
  const racingNow = phase === 'running' && room.status === 'racing';
  const handleClose = () => {
    if (racingNow) setConfirmExit(true);
    else onExit();
  };
  const confirmForfeit = async () => {
    setBusy(true);
    gameRef.current?.stop();
    try {
      await forfeitRace(room.id);
    } catch {
      /* yine de çık */
    }
    setBusy(false);
    setConfirmExit(false);
    onExit();
  };

  const retryTraining = async () => {
    setBusy(true);
    try {
      const res = await createTrainingRace(me.vehicleId, room.trainingLevel);
      if (res?.data?.roomId) onSwitchRoom?.(res.data.roomId);
    } catch (e) {
      setErr(e?.message || 'Antrenman başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  // HUD ilk çizimde var olmalı (oyun, HUD öğelerini kurulumda alır)
  const showGame = gameOn || initialPhase === 'running';
  const myMs = myResult?.ms || me.finishMs || null;
  const grade = myResult?.grade || me.grade || (myMs ? gradeOf(myMs, car.catalogId, car.level) : null);
  const gradeCol = { S: '#ffc83d', A: '#00f0ff', B: '#6dff9c', C: '#ff6b81' }[grade] || '#fff';

  return (
    <div className="ta-root">
      {onAir && <div className={`ta-onair${onAirHealth === 'err' ? ' bad' : ''}`}>{onAirHealth === 'err' ? '⚠ Yarış yayına gönderilemiyor' : '🔴 CANLI · yarış yayında'}</div>}
      <canvas ref={canvasRef} className="ta-canvas" style={{ visibility: showGame ? 'visible' : 'hidden' }} />
      {showGame && (
        <>
          <div className="ta-hud">
            <div className="tl">
              <div className="lbl">SÜRE</div>
              <div ref={hud.tm} className="tm">
                00:00.000
              </div>
              <canvas ref={miniRef} className="ta-mm" width="128" height="192" />
            </div>
            <div className="tc">
              <div className="lbl">NİTRO</div>
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
              <div className="lbl">
                KM/H · SV <b className="lv">{car.level}</b>
              </div>
              <div className="ta-tools">
                <button type="button" onClick={toggleMute} aria-label="Ses">
                  {muted ? '🔇' : '🔊'}
                </button>
                <button type="button" onClick={handleClose} aria-label="Çık">
                  ✕
                </button>
              </div>
            </div>
          </div>
          <div ref={hud.cd} className="ta-cd" />
          <div ref={hud.wrong} className="ta-wrong">
            TERS YÖN!
          </div>
          {phase === 'running' && (
            <div className="ta-ctl">
              <div className="left">
                <button type="button" {...btn('l')} aria-label="Sol">
                  ◀
                </button>
                <button type="button" {...btn('r')} aria-label="Sağ">
                  ▶
                </button>
              </div>
              <div className="right">
                <button type="button" className="nos" {...btn('n')}>
                  NOS
                </button>
                <button type="button" className="brk" {...btn('b')}>
                  FREN
                </button>
                <button type="button" className="gas" {...btn('g')}>
                  GAZ
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {phase !== 'running' && (
        <div className={`ta-res${showGame ? '' : ' solid'}`}>
          <div className="box">
            <ResultBody
              mode={mode}
              phase={phase}
              room={room}
              me={me}
              myUid={myUid}
              other={other}
              bot={bot}
              myMs={myMs}
              grade={grade}
              gradeCol={gradeCol}
              err={err}
            />
            <div className="btns">
              {mode === 'training' && phase === 'result' && (
                <button type="button" className="cta" disabled={busy} onClick={retryTraining}>
                  {room.winnerUid === myUid ? 'TEKRAR YARIŞ' : 'YENİDEN DENE'}
                </button>
              )}
              <button type="button" className={mode === 'training' && phase === 'result' ? 'ghost' : 'cta'} onClick={onExit}>
                {phase === 'waiting' && mode === 'bet' ? 'KÜÇÜLT' : 'LOBİYE DÖN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmExit && (
        <div className="ta-confirm">
          <div className="box">
            <p>Yarış bitmeden çıkmak istediğine emin misin?</p>
            <p className="sub">{mode === 'bet' ? 'Çıkarsan yarışı kaybetmiş sayılırsın.' : mode === 'champ' ? 'Bugünkü şampiyona hakkın kullanılmış sayılır.' : 'Bu deneme kaybedilmiş sayılır.'}</p>
            <div className="btns">
              <button type="button" className="ghost" disabled={busy} onClick={() => setConfirmExit(false)}>
                Vazgeç
              </button>
              <button type="button" className="cta" disabled={busy} onClick={confirmForfeit}>
                Evet, Çık
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBody({ mode, phase, room, me, myUid, other, bot, myMs, grade, gradeCol, err }) {
  const finished = room.status === 'finished';
  if (phase === 'aborted' && !finished) {
    return (
      <>
        <div className="lbl">YARIŞ YARIDA KALDI</div>
        <p className="sub">Bu yarış daha önce başlatılmış ve bitirilmemiş. Her yarışta tek deneme hakkın var.</p>
      </>
    );
  }
  if (phase === 'submitting') {
    return (
      <>
        <div className="lbl">BİTİŞ</div>
        {myMs && <div className="tm big">{fmtRace(myMs)}</div>}
        <p className="sub">Sonuç doğrulanıyor…</p>
      </>
    );
  }
  if (phase === 'error') {
    return (
      <>
        <div className="lbl">SONUÇ GÖNDERİLEMEDİ</div>
        {myMs && <div className="tm big">{fmtRace(myMs)}</div>}
        <p className="sub err">{err || 'Bağlantı hatası.'}</p>
      </>
    );
  }
  const timeBlock = myMs ? (
    <>
      <div className="grade" style={{ color: gradeCol, textShadow: `0 0 30px ${gradeCol}` }}>
        {grade}
      </div>
      <div className="tm big">{fmtRace(myMs)}</div>
    </>
  ) : null;

  if (mode === 'bet') {
    const bet = room.betAmount || 0;
    if (!finished) {
      return (
        <>
          <div className="lbl">{myMs ? 'YARIŞ TAMAMLANDI' : 'YARIŞ BİTTİ'}</div>
          {timeBlock}
          <p className="sub">
            {other?.finishMs ? `${other.displayName}: ${fmtRace(other.finishMs)}` : `${other?.displayName || 'Rakip'} hâlâ yarışıyor…`}
          </p>
          <p className="sub dim">Kısa süre kazanır. Rakip en geç 4 dakika içinde bitirmezse kazanırsın.</p>
        </>
      );
    }
    const won = room.winnerUid === myUid;
    const draw = room.winnerUid === 'draw' || !room.winnerUid;
    const meP = room.players?.[myUid] || me;
    const oP = other ? room.players?.[Object.keys(room.players || {}).find((u) => u !== myUid)] || other : null;
    return (
      <>
        <div className="lbl">{draw ? 'BERABERE' : won ? 'KAZANDIN!' : 'KAYBETTİN'}</div>
        {timeBlock}
        <div className="ta-vs">
          <span>
            Sen <b>{meP.finishMs ? fmtRace(meP.finishMs) : meP.forfeited ? 'çıktı' : meP.dnf ? 'geride kaldı' : 'bitiremedi'}</b>
          </span>
          <span>
            {oP?.displayName || 'Rakip'} <b>{oP?.finishMs ? fmtRace(oP.finishMs) : oP?.forfeited ? 'çıktı' : 'bitiremedi'}</b>
          </span>
        </div>
        <p className={`ta-gold ${won ? 'win' : draw ? '' : 'lose'}`}>{draw ? 'Bahisler iade edildi.' : won ? `+${fmtGold(bet * 2)} altın` : `-${fmtGold(bet)} altın`}</p>
      </>
    );
  }

  if (mode === 'training') {
    const lvl = room.trainingLevel || 1;
    if (!finished) {
      return (
        <>
          <div className="lbl">YARIŞ TAMAMLANDI</div>
          {timeBlock}
          <p className="sub">Sonuç bekleniyor…</p>
        </>
      );
    }
    const won = room.winnerUid === myUid;
    return (
      <>
        <div className="lbl">{won ? `${lvl}. SEVİYE TAMAMLANDI! 🎉` : 'BOT KAZANDI'}</div>
        {timeBlock}
        <div className="ta-vs">
          <span>
            Sen <b>{myMs ? fmtRace(myMs) : 'bitiremedi'}</b>
          </span>
          <span>
            Bot ({bot?.vehicleModel}) <b>{bot?.finishMs ? fmtRace(bot.finishMs) : '—'}</b>
          </span>
        </div>
        <p className="sub">{won ? `İlk galibiyette ${fmtGold(lvl * 1000)} altın ödül ve sonraki seviye açılır.` : 'Nitroyu düzlüklerde kullan, virajlara frenle gir.'}</p>
      </>
    );
  }

  // şampiyona
  return (
    <>
      <div className="lbl">{myMs ? 'ŞAMPİYONA TURU TAMAMLANDI' : 'ŞAMPİYONA'}</div>
      {timeBlock}
      <p className="sub">
        {myMs
          ? `Bugün bu araçla en hızlı süreyi yapan gece 00:00'da ${fmtGold(carStats(me.catalogId || 1).price / 5)} altın ödülü kazanır.`
          : 'Bu deneme tamamlanmadı — bu araçla yarın tekrar katılabilirsin.'}
      </p>
    </>
  );
}
