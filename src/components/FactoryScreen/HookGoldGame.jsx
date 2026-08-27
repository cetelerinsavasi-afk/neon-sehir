import { useCallback, useEffect, useRef, useState } from 'react';
import './FactoryShiftGame.css';
import './FactoryMiniGames.css';

// HookGoldGame — Kanca ile Altın Yakalama. Yeni istek: "fabrikada üretim
// yapıldığında 3 farklı mini oyundan biri rastgele karşına çıksın" —
// FactoryShiftGame (koli yakalama) ile AYNI dış arayüzü (onComplete/onClose
// prop'ları, submitting/success/error faz akışı) paylaşan İKİNCİ mini oyun.
// Ekranın üstünde sağa-sola otomatik gidip gelen bir kanca vagonu var;
// oyuncu ekrana her bastığında kanca o anki konumundan aşağı iner, bir
// altına denk gelirse onu yakalayıp yukarı çeker. KULLANICI REVİZESİ:
// "bi sürü altın var ve biz 3 tane kaptığımız zaman oyun bitiyor ve aynı
// zamanda biz her altın kaptığımızda yenisi var oluyor. 5 adet altın
// olsun ve 5ini de topladığımızda oyun bitsin" — artık sahada SABİT
// GOLD_COUNT (5) adet altın var, biri yakalandığında YERİNE YENİSİ
// DOĞMUYOR (bkz. update()'teki 'retracting' dalı — artık spawnGolds ile
// top-up YOK, sadece filter), oyun TÜM altınlar (TARGET_CATCHES = 5)
// toplanınca bitiyor. Basit bir tur süresi (ROUND_TIME_LIMIT) var — süre
// dolarsa tur sıfırlanır (KALICI bir başarısızlık YOK, tıpkı
// FactoryShiftGame'de olduğu gibi — işçi/patron gerçek üretimden asla
// kalıcı olarak mahrum bırakılmaz, sadece tekrar denemesi istenir).
const W = 640;
const H = 480;
const RAIL_Y = 54;
const HOOK_MAX_LEN = H - RAIL_Y - 56;
const HOOK_SPEED = 8.5;
const GOLD_COUNT = 5;
const TARGET_CATCHES = GOLD_COUNT;
const ROUND_TIME_LIMIT = 18; // saniye
const GOLD_R = 15;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// spawnGolds — SADECE bir turun BAŞINDA (ilk kurulum/resetRound/
// retryAfterError) çağrılır, tam GOLD_COUNT adet altın üretir. Artık
// oyun SIRASINDA (bir altın yakalandığında) ÇAĞRILMIYOR — kullanıcı
// revizesi: sahadaki altın sayısı sabit kalmalı, biri toplandığında
// yenisi doğmamalı.
function spawnGolds() {
  const golds = [];
  while (golds.length < GOLD_COUNT) {
    golds.push({
      id: Math.random().toString(36).slice(2),
      x: rand(50, W - 50),
      y: rand(RAIL_Y + 110, H - 60),
      r: GOLD_R,
      caught: false,
      bob: Math.random() * Math.PI * 2,
    });
  }
  return golds;
}

export default function HookGoldGame({ onComplete, onClose }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);

  const [catches, setCatches] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT);
  const [phase, setPhase] = useState('playing'); // playing | submitting | success | error
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [roundMsg, setRoundMsg] = useState('');

  const phaseRef = useRef('playing');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const gameRef = useRef({
    trolleyX: W / 2,
    trolleyDir: 1,
    trolleySpeed: 3,
    hook: { state: 'idle', len: 0, x: W / 2, carrying: null },
    golds: spawnGolds(),
    catchesNow: 0,
    t: 0,
  });

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
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      o.stop(ctx.currentTime + 0.3);
    } catch {
      // Ses opsiyonel — bazı tarayıcılarda AudioContext kısıtlı olabilir.
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

  const resetRound = useCallback(() => {
    const g = gameRef.current;
    g.golds = spawnGolds();
    g.hook = { state: 'idle', len: 0, x: g.trolleyX, carrying: null };
    g.catchesNow = 0;
    setCatches(0);
    setTimeLeft(ROUND_TIME_LIMIT);
    setRoundMsg('Süre doldu, tekrar deniyorsun!');
    setTimeout(() => setRoundMsg(''), 1600);
  }, []);

  // Süre sayacı — sadece 'playing' fazındayken çalışır.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          resetRound();
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

    function update() {
      if (phaseRef.current !== 'playing') return;
      g.t += 1;

      if (g.hook.state === 'idle') {
        g.trolleyX += g.trolleyDir * g.trolleySpeed;
        if (g.trolleyX < 50) {
          g.trolleyX = 50;
          g.trolleyDir = 1;
        }
        if (g.trolleyX > W - 50) {
          g.trolleyX = W - 50;
          g.trolleyDir = -1;
        }
        g.hook.x = g.trolleyX;
        g.hook.len = 0;
      } else if (g.hook.state === 'dropping') {
        g.hook.len += HOOK_SPEED;
        const hookY = RAIL_Y + g.hook.len;
        for (const gold of g.golds) {
          if (gold.caught) continue;
          const dx = gold.x - g.hook.x;
          const dy = gold.y - hookY;
          if (Math.sqrt(dx * dx + dy * dy) < gold.r + 11) {
            gold.caught = true;
            g.hook.carrying = gold;
            g.hook.state = 'retracting';
            blip(760);
            break;
          }
        }
        if (g.hook.len >= HOOK_MAX_LEN) {
          g.hook.state = 'retracting';
        }
      } else if (g.hook.state === 'retracting') {
        g.hook.len -= HOOK_SPEED;
        if (g.hook.len < 0) g.hook.len = 0;
        if (g.hook.carrying) {
          g.hook.carrying.x = g.hook.x;
          g.hook.carrying.y = RAIL_Y + g.hook.len;
        }
        if (g.hook.len <= 0) {
          g.hook.state = 'idle';
          if (g.hook.carrying) {
            g.catchesNow += 1;
            setCatches(g.catchesNow);
            // Kullanıcı revizesi: yakalanan altın sahadan SADECE kaldırılır,
            // yerine yenisi doğmaz — sahadaki altın sayısı sabit azalır.
            g.golds = g.golds.filter((gd) => gd.id !== g.hook.carrying.id);
            g.hook.carrying = null;
            if (g.catchesNow >= TARGET_CATCHES) {
              blip(1040);
              handleComplete();
            } else {
              blip(880);
            }
          }
        }
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

    function drawRail() {
      ctx.fillStyle = '#3a4b55';
      ctx.fillRect(0, RAIL_Y - 14, W, 14);
      ctx.strokeStyle = '#54707d';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, RAIL_Y - 14, W, 14);
      for (let x = 10; x < W; x += 26) {
        ctx.fillStyle = ((x / 26) | 0) % 2 ? '#f2b632' : '#1c2830';
        ctx.fillRect(x, RAIL_Y - 12, 12, 4);
      }
    }

    function drawTrolley() {
      const x = g.hook.x;
      ctx.save();
      ctx.translate(x, RAIL_Y);
      ctx.fillStyle = '#8a6a3f';
      ctx.fillRect(-18, -6, 36, 14);
      ctx.strokeStyle = '#3a2814';
      ctx.lineWidth = 2;
      ctx.strokeRect(-18, -6, 36, 14);
      ctx.restore();
    }

    function drawRope() {
      const hookY = RAIL_Y + g.hook.len;
      ctx.strokeStyle = '#cbb28a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.hook.x, RAIL_Y + 8);
      ctx.lineTo(g.hook.x, hookY);
      ctx.stroke();
    }

    function drawHook() {
      const hookY = RAIL_Y + g.hook.len;
      ctx.save();
      ctx.translate(g.hook.x, hookY);
      ctx.strokeStyle = '#dfe6ea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 4, 9, Math.PI * 0.15, Math.PI * 1.35);
      ctx.stroke();
      ctx.fillStyle = '#9fb3bd';
      ctx.beginPath();
      ctx.arc(0, -2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawGold(gold) {
      const bobY = gold.y + Math.sin(g.t * 0.06 + gold.bob) * (gold.caught ? 0 : 3);
      ctx.save();
      ctx.translate(gold.x, gold.caught ? gold.y : bobY);
      const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, gold.r);
      grad.addColorStop(0, '#fff2c2');
      grad.addColorStop(0.5, '#f2b632');
      grad.addColorStop(1, '#a97a12');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, gold.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5308';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(122,83,8,0.55)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
      ctx.restore();
    }

    function draw() {
      drawBackground();
      drawRail();
      g.golds.forEach((gold) => drawGold(gold));
      drawRope();
      drawTrolley();
      drawHook();
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
    if (g.hook.state === 'idle') {
      g.hook.state = 'dropping';
    }
  };

  const retryAfterError = () => {
    const g = gameRef.current;
    g.golds = spawnGolds();
    g.hook = { state: 'idle', len: 0, x: g.trolleyX, carrying: null };
    g.catchesNow = 0;
    setCatches(0);
    setTimeLeft(ROUND_TIME_LIMIT);
    setPhase('playing');
  };

  return (
    <div className="fsg-backdrop" onClick={onClose}>
      <div className="fsg-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="fsg-hud">
          <div className="fsg-title">🪝 Altın Avı</div>
          <div className="fsg-score">
            {Array.from({ length: TARGET_CATCHES }, (_, i) => (
              <div key={i} className={`fmg-gold-icon ${i < catches ? 'filled' : ''}`} />
            ))}
          </div>
          <div className="fmg-timer">{timeLeft}s</div>
          <button className="fsg-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="fsg-canvas"
          onPointerDown={onPointerDown}
        />

        {roundMsg && <p className="fmg-round-msg">{roundMsg}</p>}

        <p className="fsg-hint">
          <b>Ekrana dokun</b> — kancayı indir, altına denk getir. {TARGET_CATCHES} altın yakala.
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
                    {TARGET_CATCHES}/{TARGET_CATCHES} altın yakalandı
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
