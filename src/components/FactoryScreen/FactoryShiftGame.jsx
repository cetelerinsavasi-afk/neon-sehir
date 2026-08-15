import { useCallback, useEffect, useRef, useState } from 'react';
import './FactoryShiftGame.css';

// FactoryShiftGame — yeni istek: "fabrika işçileri için yeni özellik,
// basit bi oyun görevi ekleyeceğiz, oyuncu fabrikaya girdiğinde 'üretim
// yap' butonu yerine bu oyunla karşılaşacak ve bu mini oyunu
// tamamladığında üretimi yapmış sayılıp maaşını alabilecek... düşen
// kutulardan 10 adet yakalayan işçi maaşını alabilecek." Kullanıcının
// verdiği HTML/CSS/JS prototipi (kanvas tabanlı "kasa yakalama" oyunu)
// BİREBİR aynı oyun mantığıyla React bileşenine taşındı — sadece
// tamamlanınca gerçek sunucu çağrısını (produceAtFactory, `onComplete`
// prop'u üzerinden WorkerView'dan geçiriliyor) tetikleyecek şekilde
// genişletildi: oyun bitince ANINDA "ödendi" gösterilmiyor, gerçek
// sunucu cevabı beklenip (submitting) ona göre başarı/hata gösteriliyor.
const W = 640;
const H = 480;
const CHUTE_Y = 46;
const PLATFORM_Y = 420;
const PLATFORM_W = 96;
const PLATFORM_H = 20;
const MARGIN_X = 40;
const TARGET_SCORE = 10;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default function FactoryShiftGame({ onComplete, onClose }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);

  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState('playing'); // playing | submitting | success | error
  // resultData — hem işçi maaşı (`{salary}`) hem de sahibin kendi
  // makinesinde çalışması (`{isSelfEmployed, qty}`) durumunu kapsar (yeni
  // istek: "fabrika sahipleri de kendisi bi makinede görevliyse bu kutu
  // oyununu oynasın") — WorkerView VE OwnerView aynı bileşeni kullanıyor.
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Oyun durumu — render tetiklemeden her karede güncellenir (canvas
  // oyunlarında standart desen, bkz. FlappyBirdScreen.jsx).
  const gameRef = useRef({
    platformX: W / 2 - PLATFORM_W / 2,
    targetX: W / 2 - PLATFORM_W / 2,
    keyLeft: false,
    keyRight: false,
    box: null,
    dragging: false,
    scoreNow: 0,
  });
  const phaseRef = useRef('playing');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const blip = useCallback((freq) => {
    try {
      audioCtxRef.current = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.stop(ctx.currentTime + 0.35);
    } catch {
      // Ses opsiyonel — bazı tarayıcılarda AudioContext kısıtlı olabilir.
    }
  }, []);

  const spawnBox = useCallback(() => {
    const g = gameRef.current;
    // Yeni istek: "kutular çok yavaş düşüyor hızlandıralım" — başlangıç
    // hızı ve artış oranı ~1.7x büyütüldü (eskisi: 2.6 başlangıç, +0.35/
    // yakalama, 6.5 tavan).
    const speed = Math.min(4.5 + g.scoreNow * 0.6, 11);
    g.box = { x: rand(MARGIN_X + 20, W - MARGIN_X - 20), y: CHUTE_Y, r: 22, speed };
  }, []);

  const clampPlatform = (x) => Math.max(MARGIN_X, Math.min(W - MARGIN_X - PLATFORM_W, x));

  const canvasXFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) * (W / rect.width);
  };

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const g = gameRef.current;
    spawnBox();

    function update() {
      if (phaseRef.current !== 'playing') return;
      if (g.keyLeft) g.targetX = clampPlatform(g.targetX - 7);
      if (g.keyRight) g.targetX = clampPlatform(g.targetX + 7);
      g.platformX += (g.targetX - g.platformX) * 0.28;

      if (g.box) {
        g.box.y += g.box.speed;
        const platformTop = PLATFORM_Y;
        if (g.box.y + g.box.r >= platformTop && g.box.y - g.box.r <= platformTop + PLATFORM_H) {
          if (g.box.x > g.platformX - g.box.r * 0.3 && g.box.x < g.platformX + PLATFORM_W + g.box.r * 0.3) {
            g.box = null;
            g.scoreNow += 1;
            setScore(g.scoreNow);
            blip(660);
            if (g.scoreNow >= TARGET_SCORE) {
              blip(880);
              handleComplete();
            } else {
              setTimeout(spawnBox, 500);
            }
          }
        }
        if (g.box && g.box.y - g.box.r > H) {
          g.box = null;
          setTimeout(spawnBox, 400);
        }
      }
    }

    function drawBackground() {
      ctx.fillStyle = '#111a20';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = i % 2 ? '#18232b' : '#1e2c35';
        ctx.fillRect(0, i * 80, W, 80);
      }
      ctx.globalAlpha = 1;
      const grad = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 420);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    function drawChute() {
      ctx.fillStyle = '#3a4b55';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 60, 10);
      ctx.lineTo(W / 2 + 60, 10);
      ctx.lineTo(W / 2 + 26, CHUTE_Y);
      ctx.lineTo(W / 2 - 26, CHUTE_Y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#54707d';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let x = W / 2 - 55; x < W / 2 + 55; x += 16) {
        ctx.fillStyle = ((x / 16) | 0) % 2 ? '#f2b632' : '#1c2830';
        ctx.fillRect(x, 10, 6, 6);
      }
    }

    function drawBox(b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      const s = b.r * 1.6;
      const grad = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      grad.addColorStop(0, '#e0a563');
      grad.addColorStop(0.5, '#c98a3f');
      grad.addColorStop(1, '#8a5a24');
      ctx.fillStyle = grad;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = '#5c3c17';
      ctx.lineWidth = 2;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.beginPath();
      ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2);
      ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2);
      ctx.strokeStyle = 'rgba(92,60,23,0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    function drawPlatform() {
      const x = g.platformX;
      const y = PLATFORM_Y;
      ctx.fillStyle = '#8a6a3f';
      ctx.fillRect(x, y, PLATFORM_W, PLATFORM_H);
      ctx.fillStyle = '#5c4527';
      ctx.fillRect(x, y, PLATFORM_W, 5);
      ctx.strokeStyle = '#3a2814';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, PLATFORM_W, PLATFORM_H);
      ctx.fillStyle = '#2a2015';
      ctx.beginPath(); ctx.arc(x + 14, y + PLATFORM_H + 6, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + PLATFORM_W - 14, y + PLATFORM_H + 6, 7, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(x + PLATFORM_W / 2, y);
      ctx.fillStyle = '#c9622f';
      ctx.fillRect(-8, -24, 16, 20);
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath(); ctx.arc(0, -30, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2b632';
      ctx.beginPath(); ctx.arc(0, -32, 8.5, Math.PI, 0); ctx.fill();
      const glow = ctx.createRadialGradient(0, -32, 1, 0, -32, 14);
      glow.addColorStop(0, 'rgba(255,221,107,0.9)');
      glow.addColorStop(1, 'rgba(255,221,107,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, -32, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2c2';
      ctx.beginPath(); ctx.arc(0, -32, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawFloor() {
      ctx.fillStyle = '#161f24';
      ctx.fillRect(0, 452, W, H - 452);
      ctx.strokeStyle = '#2a363d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 452);
      ctx.lineTo(W, 452);
      ctx.stroke();
    }

    function draw() {
      drawBackground();
      drawFloor();
      drawChute();
      if (g.box) drawBox(g.box);
      drawPlatform();
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

  const onPointerDown = (e) => {
    const g = gameRef.current;
    g.dragging = true;
    g.targetX = clampPlatform(canvasXFromEvent(e) - PLATFORM_W / 2);
  };
  const onPointerMove = (e) => {
    const g = gameRef.current;
    if (!g.dragging) return;
    g.targetX = clampPlatform(canvasXFromEvent(e) - PLATFORM_W / 2);
  };
  const onPointerUp = () => { gameRef.current.dragging = false; };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current.keyLeft = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') gameRef.current.keyRight = true;
    };
    const onKeyUp = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current.keyLeft = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') gameRef.current.keyRight = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const retryAfterError = () => {
    const g = gameRef.current;
    g.scoreNow = 0;
    g.box = null;
    setScore(0);
    setPhase('playing');
    spawnBox();
  };

  return (
    <div className="fsg-backdrop" onClick={onClose}>
      <div className="fsg-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="fsg-hud">
          <div className="fsg-title">📦 Vardiya Görevi</div>
          <div className="fsg-score">
            {Array.from({ length: TARGET_SCORE }, (_, i) => (
              <div key={i} className={`fsg-crate-icon ${i < score ? 'filled' : ''}`} />
            ))}
          </div>
          <button className="fsg-close" onClick={onClose} aria-label="Kapat">✕</button>
        </div>

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="fsg-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
        />

        <p className="fsg-hint">
          <b>Sürükle</b> ya da <b>← →</b> — platformu kasanın altına getir. 10 kasa yakala, maaşını al.
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
                    10/10 kasa yakalandı
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
                  <button className="fsg-secondary" onClick={onClose}>Kapat</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
