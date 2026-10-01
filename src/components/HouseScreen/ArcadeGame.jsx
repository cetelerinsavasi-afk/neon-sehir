import { useEffect, useRef, useState } from 'react';
import { beep } from './houseAudio';

// =============================================================================
// ArcadeGame — atari makinesindeki "Tuğla Kırma" (kullanıcının örneğinden).
// Parmakla sürükle / ◀ ▶ butonları / ok tuşları. Ses: kare dalga bipler.
// =============================================================================
const W = 160;
const H = 192;
const ROW_COLORS = ['#c84848', '#c66c3a', '#b47a30', '#a2a232', '#48a048', '#4864c8'];
const ROW_POINTS = [7, 7, 4, 4, 1, 1];
const COLS = 12;
const BW = 12;
const BH = 6;
const BX0 = 8;
const BY0 = 32;
const TOP = 8;
const SIDE = 4;

export default function ArcadeGame({ onClose }) {
  const canvasRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, level: 1, lives: 3 });
  const [msg, setMsg] = useState({ big: 'TUĞLA KIRMA', small: 'BAŞLAMAK İÇİN DOKUN' });
  const st = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const g = cv.getContext('2d');
    const s = {
      state: 'ready', score: 0, lives: 3, level: 1, hits: 0, bricks: [], bx: 0, by: 0, vx: 0, vy: 0, speed: 1.6,
      pad: { x: (W - 20) / 2, y: 178, w: 20, h: 4 }, keys: { l: false, r: false },
    };
    st.current = s;
    const pushHud = () => setHud({ score: s.score, level: s.level, lives: s.lives });
    const buildBricks = () => {
      s.bricks = ROW_COLORS.map(() => new Array(COLS).fill(true));
    };
    const resetBall = () => {
      s.bx = s.pad.x + s.pad.w / 2 - 1.5;
      s.by = s.pad.y - 4;
      s.vx = 0;
      s.vy = 0;
      s.hits = 0;
      s.speed = 1.6 + (s.level - 1) * 0.25;
    };
    const newGame = () => {
      s.score = 0;
      s.lives = 3;
      s.level = 1;
      buildBricks();
      resetBall();
      s.state = 'ready';
      pushHud();
      setMsg({ big: 'TUĞLA KIRMA', small: 'BAŞLAMAK İÇİN DOKUN' });
    };
    s.launch = () => {
      if (s.state === 'over') {
        newGame();
        return;
      }
      if (s.state !== 'ready') return;
      s.state = 'play';
      const a = Math.random() * 0.8 - 0.4;
      s.vx = s.speed * Math.sin(a);
      s.vy = -s.speed * Math.cos(a);
      setMsg(null);
      beep(440, 0.08);
    };
    const left = () => s.bricks.reduce((n, row) => n + row.filter(Boolean).length, 0);
    const step = () => {
      if (s.keys.l) s.pad.x -= 2.6;
      if (s.keys.r) s.pad.x += 2.6;
      s.pad.x = Math.max(SIDE, Math.min(W - SIDE - s.pad.w, s.pad.x));
      if (s.state === 'ready') {
        s.bx = s.pad.x + s.pad.w / 2 - 1.5;
        s.by = s.pad.y - 4;
        return;
      }
      if (s.state !== 'play') return;
      s.bx += s.vx;
      s.by += s.vy;
      if (s.bx < SIDE) {
        s.bx = SIDE;
        s.vx = Math.abs(s.vx);
        beep(300, 0.03);
      }
      if (s.bx + 3 > W - SIDE) {
        s.bx = W - SIDE - 3;
        s.vx = -Math.abs(s.vx);
        beep(300, 0.03);
      }
      if (s.by < TOP) {
        s.by = TOP;
        s.vy = Math.abs(s.vy);
        beep(300, 0.03);
      }
      const p = s.pad;
      if (s.vy > 0 && s.by + 3 >= p.y && s.by + 3 <= p.y + p.h + s.vy + 1 && s.bx + 3 > p.x && s.bx < p.x + p.w) {
        const rel = Math.max(-1, Math.min(1, (s.bx + 1.5 - (p.x + p.w / 2)) / (p.w / 2)));
        s.vx = s.speed * rel * 0.95;
        s.vy = -Math.sqrt(Math.max(s.speed * s.speed - s.vx * s.vx, (s.speed * 0.35) ** 2));
        s.by = p.y - 3;
        beep(220, 0.05);
      }
      const col = Math.floor((s.bx + 1.5 - BX0) / BW);
      const row = Math.floor((s.by + 1.5 - BY0) / BH);
      if (row >= 0 && row < s.bricks.length && col >= 0 && col < COLS && s.bricks[row][col]) {
        s.bricks[row][col] = false;
        s.vy = -s.vy;
        s.score += ROW_POINTS[row];
        s.hits++;
        if (s.hits === 4 || s.hits === 12 || (row < 2 && s.hits > 12 && s.hits % 10 === 0)) {
          s.speed = Math.min(s.speed + 0.2, 3.2);
          const m = Math.hypot(s.vx, s.vy) || 1;
          s.vx = (s.vx / m) * s.speed;
          s.vy = (s.vy / m) * s.speed;
        }
        beep(520 + (5 - row) * 90, 0.05);
        pushHud();
        if (left() === 0) {
          s.level++;
          buildBricks();
          resetBall();
          s.state = 'ready';
          pushHud();
          setMsg({ big: `SEVİYE ${s.level}`, small: 'HAZIR MISIN? DOKUN' });
          beep(880, 0.2);
        }
      }
      if (s.by > H) {
        s.lives--;
        pushHud();
        beep(110, 0.3);
        if (s.lives <= 0) {
          s.state = 'over';
          setMsg({ big: 'OYUN BİTTİ', small: `SKOR ${s.score} · TEKRAR İÇİN DOKUN` });
        } else {
          s.state = 'ready';
          resetBall();
          setMsg({ big: '', small: 'DEVAM İÇİN DOKUN' });
        }
      }
    };
    const draw = () => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#8c8c8c';
      g.fillRect(0, 0, W, TOP);
      g.fillRect(0, 0, SIDE, H);
      g.fillRect(W - SIDE, 0, SIDE, H);
      for (let r = 0; r < s.bricks.length; r++) {
        g.fillStyle = ROW_COLORS[r];
        for (let c = 0; c < COLS; c++) if (s.bricks[r][c]) g.fillRect(BX0 + c * BW, BY0 + r * BH, BW - 1, BH - 1);
      }
      g.fillStyle = '#4864c8';
      g.fillRect(Math.round(s.pad.x), s.pad.y, s.pad.w, s.pad.h);
      if (s.state !== 'over') {
        g.fillStyle = '#e8e8e8';
        g.fillRect(Math.round(s.bx), Math.round(s.by), 3, 3);
      }
    };
    let last = 0;
    let acc = 0;
    let raf = 0;
    const frame = (t) => {
      if (!last) last = t;
      acc += Math.min(t - last, 100);
      last = t;
      while (acc >= 1000 / 60) {
        step();
        acc -= 1000 / 60;
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    const kd = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') s.keys.l = true;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') s.keys.r = true;
      else if (e.code === 'Space') {
        s.launch();
        e.preventDefault();
      }
    };
    const ku = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') s.keys.l = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') s.keys.r = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    newGame();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const movePad = (clientX) => {
    const s = st.current;
    const r = canvasRef.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    s.pad.x = Math.max(SIDE, Math.min(W - SIDE - s.pad.w, x - s.pad.w / 2));
  };
  const hold = (k, v) => () => {
    st.current.keys[k] = v;
  };

  return (
    <div className="hs-modal-bg" onClick={onClose}>
      <div className="arc-console" onClick={(e) => e.stopPropagation()}>
        <div className="arc-hud">
          <span>SKOR <b>{String(hud.score).padStart(4, '0')}</b></span>
          <span>SEVİYE <b>{hud.level}</b></span>
          <span>CAN <b>{hud.lives}</b></span>
        </div>
        <div className="arc-screen">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={(e) => {
              movePad(e.clientX);
              st.current.launch();
            }}
            onPointerMove={(e) => movePad(e.clientX)}
          />
          {msg && (
            <div className="arc-msg">
              {msg.big && <span className="arc-big">{msg.big}</span>}
              <span className="arc-blink">{msg.small}</span>
            </div>
          )}
        </div>
        <div className="arc-btns">
          <button onPointerDown={hold('l', true)} onPointerUp={hold('l', false)} onPointerLeave={hold('l', false)}>◀</button>
          <button onClick={() => st.current.launch()}>BAŞLAT</button>
          <button onPointerDown={hold('r', true)} onPointerUp={hold('r', false)} onPointerLeave={hold('r', false)}>▶</button>
        </div>
        <button className="arc-close" onClick={onClose}>Atariden kalk</button>
      </div>
    </div>
  );
}
