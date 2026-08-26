import { useCallback, useEffect, useRef, useState } from 'react';
import './FactoryShiftGame.css';
import './FactoryMiniGames.css';

// TempoSyncGame — Bant Senkronu (Tempo Oyunu). Yeni istek: "fabrikada
// üretim yapıldığında 3 farklı mini oyundan biri rastgele karşına çıksın" —
// FactoryShiftGame/HookGoldGame ile AYNI dış arayüzü (onComplete/onClose,
// submitting/success/error faz akışı) paylaşan ÜÇÜNCÜ mini oyun. Ekranda
// sağa-sola hareket eden bir gösterge var, sabit/dar bir "hedef alan"
// üzerindeyken oyuncu ekrana basarsa isabet sayılır, dışındayken basarsa
// ıska sayılır ve sayaç sıfırlanır. Üst üste 3 isabetle görev tamamlanır.
// Her isabetten sonra gösterge hızlanır (kolay başlayıp zorlaşan yapı).
const W = 640;
const H = 480;
const TRACK_Y = H / 2;
const TRACK_H = 64;
const TARGET_W = 84;
const TARGET_X = W / 2 - TARGET_W / 2; // sabit, ortalanmış hedef alan
const TARGET_STREAK = 3;
const BASE_SPEED = 3.2;
const SPEED_STEP = 1.18; // her isabetten sonra çarpılır
const MAX_SPEED = 9.5;
const ROUND_TIME_LIMIT = 22; // saniye

export default function TempoSyncGame({ onComplete, onClose }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);

  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT);
  const [phase, setPhase] = useState('playing'); // playing | submitting | success | error
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [roundMsg, setRoundMsg] = useState('');
  const [flash, setFlash] = useState(null); // 'hit' | 'miss' | null

  const phaseRef = useRef('playing');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const gameRef = useRef({
    indicatorX: W / 2,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: BASE_SPEED,
    streakNow: 0,
  });

  const blip = useCallback((freq, type = 'triangle') => {
    try {
      audioCtxRef.current = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.stop(ctx.currentTime + 0.25);
    } catch {
      // Ses opsiyonel.
    }
  }, []);

  const handleComplete = useCallback(async () => {
    setPhase('submitting');
    try {
      const res = await onComplete();
      setResultData(res || null);
      setPhase('success');
    } catch (err) {
      setErrorMsg(err?.message || 'Üretim işlenemedi.');
      setPhase('error');
    }
  }, [onComplete]);

  const resetRound = useCallback((withMessage) => {
    const g = gameRef.current;
    g.speed = BASE_SPEED;
    g.streakNow = 0;
    setStreak(0);
    setTimeLeft(ROUND_TIME_LIMIT);
    if (withMessage) {
      setRoundMsg(withMessage);
      setTimeout(() => setRoundMsg(''), 1600);
    }
  }, []);

  // Süre sayacı.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          resetRound('Süre doldu, tekrar deniyorsun!');
          return ROUND_TIME_LIMIT;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, resetRound]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const g = gameRef.current;
    const padding = 24;

    function update() {
      if (phaseRef.current !== 'playing') return;
      g.indicatorX += g.dir * g.speed;
      if (g.indicatorX < padding) {
        g.indicatorX = padding;
        g.dir = 1;
      }
      if (g.indicatorX > W - padding) {
        g.indicatorX = W - padding;
        g.dir = -1;
      }
    }

    function drawBackground() {
      ctx.fillStyle = '#111a20';
      ctx.fillRect(0, 0, W, H);
      const grad = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 420);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function drawTrack() {
      const y = TRACK_Y - TRACK_H / 2;
      ctx.fillStyle = '#1c2830';
      ctx.fillRect(padding, y, W - padding * 2, TRACK_H);
      ctx.strokeStyle = '#3a4b55';
      ctx.lineWidth = 2;
      ctx.strokeRect(padding, y, W - padding * 2, TRACK_H);

      // Hedef alan (sabit, dar).
      const targetGrad = ctx.createLinearGradient(TARGET_X, 0, TARGET_X + TARGET_W, 0);
      targetGrad.addColorStop(0, 'rgba(242,182,50,0.15)');
      targetGrad.addColorStop(0.5, 'rgba(242,182,50,0.45)');
      targetGrad.addColorStop(1, 'rgba(242,182,50,0.15)');
      ctx.fillStyle = targetGrad;
      ctx.fillRect(TARGET_X, y, TARGET_W, TRACK_H);
      ctx.strokeStyle = '#f2b632';
      ctx.lineWidth = 2;
      ctx.strokeRect(TARGET_X, y, TARGET_W, TRACK_H);

      // Cetvel çizgileri.
      ctx.strokeStyle = 'rgba(159,179,189,0.35)';
      ctx.lineWidth = 1;
      for (let x = padding; x <= W - padding; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + TRACK_H);
        ctx.lineTo(x, y + TRACK_H + 6);
        ctx.stroke();
      }
    }

    function drawIndicator() {
      const y = TRACK_Y;
      ctx.save();
      ctx.translate(g.indicatorX, y);
      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
      glow.addColorStop(0, 'rgba(255,221,107,0.9)');
      glow.addColorStop(1, 'rgba(255,221,107,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -TRACK_H / 2 - 8);
      ctx.lineTo(0, TRACK_H / 2 + 8);
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      drawBackground();
      drawTrack();
      drawIndicator();
      if (phaseRef.current !== 'playing') {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    function loop() {
      update();
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = () => {
    if (phaseRef.current !== 'playing') return;
    const g = gameRef.current;
    const isHit = g.indicatorX >= TARGET_X && g.indicatorX <= TARGET_X + TARGET_W;
    if (isHit) {
      g.streakNow += 1;
      setStreak(g.streakNow);
      setFlash('hit');
      blip(880 + g.streakNow * 60);
      g.speed = Math.min(MAX_SPEED, g.speed * SPEED_STEP);
      if (g.streakNow >= TARGET_STREAK) {
        blip(1200);
        handleComplete();
      }
    } else {
      g.streakNow = 0;
      setStreak(0);
      g.speed = BASE_SPEED;
      setFlash('miss');
      blip(160, 'sawtooth');
    }
    setTimeout(() => setFlash(null), 220);
  };

  const retryAfterError = () => {
    resetRound(null);
    setPhase('playing');
  };

  return (
    <div className="fsg-backdrop" onClick={onClose}>
      <div className="fsg-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="fsg-hud">
          <div className="fsg-title">🎚️ Bant Senkronu</div>
          <div className="fsg-score">
            {Array.from({ length: TARGET_STREAK }, (_, i) => (
              <div key={i} className={`fmg-gold-icon ${i < streak ? 'filled' : ''}`} />
            ))}
          </div>
          <div className="fmg-timer">{timeLeft}s</div>
          <button className="fsg-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <div className={`fmg-canvas-wrap ${flash ? `fmg-flash-${flash}` : ''}`}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="fsg-canvas"
            onPointerDown={onPointerDown}
          />
        </div>

        {roundMsg && <p className="fmg-round-msg">{roundMsg}</p>}

        <p className="fsg-hint">
          Gösterge <b>altın bölgedeyken ekrana dokun</b>. Üst üste {TARGET_STREAK} isabet ile görevi
          tamamla — ıska sayaç sıfırlar.
        </p>

        {(phase === 'submitting' || phase === 'success' || phase === 'error') && (
          <div className="fsg-overlay">
            <div className="fsg-card">
              {phase === 'submitting' && (
                <>
                  <div className="fsg-emoji">⏳</div>
                  <h2>İşleniyor…</h2>
                  <p>Üretim kaydediliyor.</p>
                </>
              )}
              {phase === 'success' && (
                <>
                  <div className="fsg-emoji">💰</div>
                  <h2>{resultData?.isSelfEmployed ? 'Üretim Tamamlandı!' : 'Maaşını Hak Ettin!'}</h2>
                  <p>
                    Üst üste {TARGET_STREAK} isabet
                    {resultData?.isSelfEmployed
                      ? ` — ${(resultData.qty ?? 0).toLocaleString('tr-TR')} adet ürün stoğuna eklendi.`
                      : resultData?.salary != null
                        ? ` — +${resultData.salary.toLocaleString('tr-TR')} altın kazandın.`
                        : '.'}
                  </p>
                  <button onClick={onClose}>Kapat</button>
                </>
              )}
              {phase === 'error' && (
                <>
                  <div className="fsg-emoji">⚠️</div>
                  <h2>Bir Sorun Oldu</h2>
                  <p>{errorMsg}</p>
                  <button onClick={retryAfterError}>Tekrar Dene</button>
                  <button className="fsg-secondary" onClick={onClose}>
                    Kapat
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
