import { useCallback, useEffect, useRef, useState } from 'react';
import { submitFlappyScore } from '../../services/gameActions';
import { useFlappyLeaderboard, useMyFlappyBest } from '../../hooks/useFlappyBird';
import './FlappyBirdScreen.css';

const WIDTH = 320;
const HEIGHT = 460;
const GROUND_HEIGHT = 36;
const BIRD_X = 66;
const BIRD_SIZE = 24;
const GRAVITY = 0.42;
const FLAP_VELOCITY = -7.4;
const MAX_FALL_SPEED = 9;
const PIPE_WIDTH = 50;
const PIPE_GAP = 128;
const BASE_PIPE_SPEED = 2.3;
const BASE_PIPE_SPACING_FRAMES = 100;

// SPEED_MODES — yeni istek: "flappy kuşta hızlı normal yavaş 3 mod olsun
// oyuncu istediği modda oyuna girebilsin". Sadece boruların akış hızı ve
// spawn sıklığı ölçeklenir (spacing, hız arttıkça borular arası GERÇEK
// mesafe aynı kalsın diye ters orantılı azaltılır) — kuşun yerçekimi/zıplama
// fiziği tüm modlarda aynı kalır, böylece "hızlı" mod sadece tempo/refleks
// zorluğunu artırır, kontrolleri değiştirmez.
const SPEED_MODES = {
  slow: { key: 'slow', label: 'Yavaş', icon: '🐢', speedMult: 0.65 },
  normal: { key: 'normal', label: 'Normal', icon: '🚶', speedMult: 1 },
  fast: { key: 'fast', label: 'Hızlı', icon: '⚡', speedMult: 1.45 },
};

function createGameState(speedKey) {
  const mode = SPEED_MODES[speedKey] || SPEED_MODES.normal;
  return {
    birdY: HEIGHT / 2,
    velocity: 0,
    rotation: 0,
    pipes: [],
    frame: 0,
    score: 0,
    alive: true,
    speedKey: mode.key,
    pipeSpeed: BASE_PIPE_SPEED * mode.speedMult,
    spacingFrames: Math.max(24, Math.round(BASE_PIPE_SPACING_FRAMES / mode.speedMult)),
    // DÜZELTME (madde 5): "flappy kuş oyunu bazen laglı oluyor, bazen çok
    // akıcı bazen çok kötü" — eskiden fizik requestAnimationFrame'in KAÇ
    // KEZ çağrıldığına göre ilerliyordu (her çağrıda sabit miktar), bu da
    // ekranın gerçek yenileme hızına (60/90/120Hz) ve tarayıcının o anki
    // performansına göre oyunun FARKLI hızlarda akmasına sebep oluyordu.
    // Artık gerçek geçen süre (dt, performance.now() ile) ölçülüp 60fps'e
    // göre normalize ediliyor (bkz. tick() içindeki `steps`) — bu üç alan
    // o normalizasyon için gerekli: lastTs bir önceki karenin zaman
    // damgası, groundOffset/spawnTimer eskiden `frame` sayacına dayanan
    // zemin kayması ve boru üretimi artık GERÇEK ZAMANA göre ilerliyor.
    lastTs: null,
    groundOffset: 0,
    spawnTimer: 0,
  };
}

function spawnPipe(pipes) {
  const minGapY = 44;
  const maxGapY = HEIGHT - GROUND_HEIGHT - PIPE_GAP - 44;
  const gapY = minGapY + Math.random() * Math.max(10, maxGapY - minGapY);
  pipes.push({ x: WIDTH + 10, gapY, passed: false });
}

function draw(ctx, g) {
  // Gökyüzü
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#6ec6ff');
  sky.addColorStop(1, '#bfe9ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Bulutlar (sabit dekoratif)
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  [[40, 60, 22], [120, 40, 16], [230, 90, 20], [280, 50, 14]].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Borular
  g.pipes.forEach((p) => {
    ctx.fillStyle = '#3ddc5a';
    ctx.strokeStyle = '#1f8a34';
    ctx.lineWidth = 3;
    // üst boru
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapY);
    ctx.strokeRect(p.x, 0, PIPE_WIDTH, p.gapY);
    // alt boru
    const bottomY = p.gapY + PIPE_GAP;
    ctx.fillRect(p.x, bottomY, PIPE_WIDTH, HEIGHT - GROUND_HEIGHT - bottomY);
    ctx.strokeRect(p.x, bottomY, PIPE_WIDTH, HEIGHT - GROUND_HEIGHT - bottomY);
    // boru ağızları
    ctx.fillStyle = '#33c04e';
    ctx.fillRect(p.x - 3, p.gapY - 18, PIPE_WIDTH + 6, 18);
    ctx.fillRect(p.x - 3, bottomY, PIPE_WIDTH + 6, 18);
    ctx.strokeRect(p.x - 3, p.gapY - 18, PIPE_WIDTH + 6, 18);
    ctx.strokeRect(p.x - 3, bottomY, PIPE_WIDTH + 6, 18);
  });

  // Zemin
  ctx.fillStyle = '#ded18f';
  ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, GROUND_HEIGHT);
  ctx.fillStyle = '#c7b96f';
  for (let x = -(g.groundOffset % 20); x < WIDTH; x += 20) {
    ctx.fillRect(x, HEIGHT - GROUND_HEIGHT, 10, 6);
  }

  // Kuş
  ctx.save();
  ctx.translate(BIRD_X, g.birdY);
  ctx.rotate(g.rotation);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#c8961f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_SIZE / 2, BIRD_SIZE / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // gaga
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(BIRD_SIZE / 2 - 4, -2);
  ctx.lineTo(BIRD_SIZE / 2 + 6, 1);
  ctx.lineTo(BIRD_SIZE / 2 - 4, 4);
  ctx.closePath();
  ctx.fill();
  // göz
  ctx.fillStyle = '#1c1a15';
  ctx.beginPath();
  ctx.arc(3, -5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function FlappyBirdScreen() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rafRef = useRef(null);
  const [phase, setPhase] = useState('start'); // start | playing | gameover
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [submitState, setSubmitState] = useState('idle'); // idle | saving | new-best | saved
  const [speedKey, setSpeedKey] = useState('normal'); // slow | normal | fast
  const { top10 } = useFlappyLeaderboard();
  const { best } = useMyFlappyBest();

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const endGame = useCallback(async (g) => {
    stopLoop();
    setFinalScore(g.score);
    setPhase('gameover');
    setSubmitState('saving');
    try {
      const res = await submitFlappyScore(g.score);
      setSubmitState(res?.data?.isNewBest ? 'new-best' : 'saved');
    } catch (err) {
      console.error('submitFlappyScore hata:', err);
      setSubmitState('saved');
    }
  }, [stopLoop]);

  const tick = useCallback((now) => {
    const canvas = canvasRef.current;
    const g = gameRef.current;
    if (!canvas || !g || !g.alive) return;
    const ctx = canvas.getContext('2d');

    // dt-normalizasyon (DÜZELTME madde 5) — bkz. createGameState'teki
    // yorum. `steps` = bu karede gerçekte geçen sürenin, 60fps'teki BİR
    // karenin (16.67ms) kaçına denk geldiği. Sabit +1 yerine bununla
    // çarpılan her hareket, ekranın gerçek yenileme hızından/performans
    // dalgalanmalarından bağımsız, HER ZAMAN aynı gerçek-saniye hızında
    // ilerler.
    if (g.lastTs == null) g.lastTs = now;
    const rawDtMs = now - g.lastTs;
    g.lastTs = now;
    // Sekme arka plana alınıp geri geldiğinde rAF saniyelerce durup tek
    // seferde devasa bir dt ile geri dönebilir — bu durumda kuşun anında
    // duvara/borulara çarpmasını (haksız ölüm) önlemek için üst sınır.
    const dtMs = Math.min(Math.max(rawDtMs, 0), 50);
    const steps = dtMs / (1000 / 60);

    g.frame += 1;
    g.velocity = Math.min(MAX_FALL_SPEED, g.velocity + GRAVITY * steps);
    g.birdY += g.velocity * steps;
    g.rotation = Math.max(-0.5, Math.min(1.3, g.velocity / 10));

    g.groundOffset += g.pipeSpeed * steps;
    g.spawnTimer += steps;
    if (g.spawnTimer >= g.spacingFrames) {
      g.spawnTimer -= g.spacingFrames;
      spawnPipe(g.pipes);
    }
    g.pipes.forEach((p) => {
      p.x -= g.pipeSpeed * steps;
    });
    g.pipes = g.pipes.filter((p) => p.x > -PIPE_WIDTH - 10);

    g.pipes.forEach((p) => {
      if (!p.passed && p.x + PIPE_WIDTH < BIRD_X - BIRD_SIZE / 2) {
        p.passed = true;
        g.score += 1;
      }
    });

    let collided = false;
    if (g.birdY - BIRD_SIZE / 2 <= 0) {
      g.birdY = BIRD_SIZE / 2;
      collided = true;
    }
    if (g.birdY + BIRD_SIZE / 2 >= HEIGHT - GROUND_HEIGHT) {
      g.birdY = HEIGHT - GROUND_HEIGHT - BIRD_SIZE / 2;
      collided = true;
    }
    g.pipes.forEach((p) => {
      const withinX = BIRD_X + BIRD_SIZE / 2 - 4 > p.x && BIRD_X - BIRD_SIZE / 2 + 4 < p.x + PIPE_WIDTH;
      if (withinX) {
        const withinGap = g.birdY - BIRD_SIZE / 2 + 3 > p.gapY && g.birdY + BIRD_SIZE / 2 - 3 < p.gapY + PIPE_GAP;
        if (!withinGap) collided = true;
      }
    });

    draw(ctx, g);
    // DÜZELTME (küçük katkı, madde 5): eskiden her karede (rAF çağrısında,
    // saniyede onlarca kez) skor DEĞİŞMESE bile setScore çağrılıyordu —
    // her seferinde gereksiz bir React re-render'a yol açıp yavaş
    // cihazlarda takılmaya (jank) katkı yapıyordu. Artık sadece skor
    // gerçekten değiştiğinde çağrılıyor.
    setScore((prev) => (prev === g.score ? prev : g.score));

    if (collided) {
      g.alive = false;
      endGame(g);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [endGame]);

  const startGame = useCallback(() => {
    gameRef.current = createGameState(speedKey);
    setScore(0);
    setSubmitState('idle');
    setPhase('playing');
  }, [speedKey]);

  const flap = useCallback(() => {
    if (phase === 'start' || phase === 'gameover') {
      startGame();
      return;
    }
    if (phase === 'playing' && gameRef.current?.alive) {
      gameRef.current.velocity = FLAP_VELOCITY;
    }
  }, [phase, startGame]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    rafRef.current = requestAnimationFrame(tick);
    return () => stopLoop();
  }, [phase, tick, stopLoop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (phase !== 'playing') {
      // Boşta / başlangıç ekranında da bir önizleme çizsin.
      draw(ctx, gameRef.current || createGameState());
    }
  }, [phase]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flap]);

  return (
    <div className="flappy-screen">
      <div className="flappy-stage" onPointerDown={flap}>
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="flappy-canvas" />

        {phase === 'playing' && <div className="flappy-live-score">{score}</div>}

        {phase === 'start' && (
          <div className="flappy-overlay">
            <div className="flappy-overlay-top">
              <div className="flappy-best-badge">
                <span className="flappy-best-label">Rekorun</span>
                <span className="flappy-best-value">🏆 {best}</span>
              </div>
              <Top10Panel top10={top10} />
            </div>
            <div className="flappy-overlay-center">
              <p className="flappy-title">FLAPPY KUŞ</p>
              <SpeedModeSelector speedKey={speedKey} onSelect={setSpeedKey} />
              <button className="flappy-start-btn" onClick={startGame}>
                ▶ Başlat
              </button>
              <p className="flappy-hint">Uçmak için ekrana dokun / boşluk tuşuna bas</p>
            </div>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="flappy-overlay flappy-overlay-gameover">
            <div className="flappy-gameover-card">
              <p className="flappy-gameover-title">OYUN BİTTİ</p>
              <p className="flappy-gameover-score">Skorun: {finalScore}</p>
              {submitState === 'saving' && <p className="flappy-muted">Kaydediliyor…</p>}
              {submitState === 'new-best' && <p className="flappy-new-best">🎉 Yeni rekorun!</p>}
              {submitState === 'saved' && (
                <p className="flappy-muted">En iyi skorun: {Math.max(best, finalScore)}</p>
              )}
              <Top10Panel top10={top10} compact />
              <SpeedModeSelector speedKey={speedKey} onSelect={setSpeedKey} compact />
              <button className="flappy-start-btn" onClick={startGame}>
                ↻ Tekrar Oyna
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// SpeedModeSelector — oyuncunun oyuna başlamadan/tekrar başlamadan önce
// hız modunu (yavaş/normal/hızlı) seçmesini sağlar. onPointerDown burada
// durdurulmalı, yoksa sahnenin genel "onPointerDown={flap}" davranışı
// mod seçimini de bir "zıplama/başlat" tıklaması gibi algılar.
function SpeedModeSelector({ speedKey, onSelect, compact }) {
  return (
    <div
      className={`flappy-speed-selector ${compact ? 'compact' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {Object.values(SPEED_MODES).map((mode) => (
        <button
          key={mode.key}
          type="button"
          className={`flappy-speed-btn ${speedKey === mode.key ? 'active' : ''}`}
          onClick={() => onSelect(mode.key)}
        >
          {mode.icon} {mode.label}
        </button>
      ))}
    </div>
  );
}

function Top10Panel({ top10, compact }) {
  return (
    <div className={`flappy-top10 ${compact ? 'compact' : ''}`}>
      <p className="flappy-top10-title">🥇 En İyi 10</p>
      {top10.length === 0 && <p className="flappy-muted flappy-small">Henüz kimse oynamadı.</p>}
      <ol className="flappy-top10-list">
        {top10.map((s, i) => (
          <li key={s.id} className={i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}>
            <span className="flappy-top10-rank">{i + 1}</span>
            <span className="flappy-top10-name">{s.displayName}</span>
            <span className="flappy-top10-score">{s.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
