import { useEffect, useRef } from 'react';

// Baca konumları (YENİ genişletilmiş kare haritanın yüzdesi, 1000x1000
// görselde ölçüldü: iki yüksek bacanın tepesi). Tüm konumlar HARİTAYA
// göre (%) olduğu için, harita sağa/sola kaydırılınca (ya da zoom
// yapılınca) duman bacalarla birlikte hareket eder, konumunu kaybetmez.
const CHIMNEYS = [
  { xPct: 48.6, yPct: 27.5 },
  { xPct: 51.7, yPct: 29 },
];

// Harita eskiden 0.558 en/boy oranlıydı, şimdi kare: yatay yüzde birimleri
// 1.79 kat daha geniş bir alana denk geliyor. Duman salınımı ve yağmur
// yoğunluğu eski görünümle aynı kalsın diye bu oranla ölçekleniyor.
const OLD_ASPECT = 0.558;
const RAIN_COUNT = Math.round(18 / OLD_ASPECT);

/**
 * MapAmbience — haritanın donuk/statik hissini kırmak için çok hafif bir
 * yağmur efekti + fabrika bacalarından yükselen duman. CSS keyframe DEĞİL,
 * canvas + requestAnimationFrame kullanılıyor (statik/donuk görünmesin
 * diye). `pointer-events: none` ile tıklama/bölge tespitine hiç
 * karışmaz — elementFromPoint bu canvas'ı atlayıp altındaki gerçek
 * elementi bulur.
 */
// paused: harita tam ekran bir mekân/telefon altında kaldığında çizim durur (v77 performans)
export default function MapAmbience({ paused = false }) {
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const rainRef = useRef([]);
  const smokeRef = useRef([]);
  const nextSpawnRef = useRef(CHIMNEYS.map(() => 0));
  const nextFlickerRef = useRef(0);
  const flickerRef = useRef(null); // { chimneyIdx, startedAt, duration, peak }
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    // Yağmur damlalarını başlat.
    rainRef.current = Array.from({ length: RAIN_COUNT }, () => ({
      x: Math.random() * 1, // 0-1 arası oransal konum
      y: Math.random() * 1,
      len: 10 + Math.random() * 14,
      speed: 0.00035 + Math.random() * 0.00035,
      drift: 0.00006 + Math.random() * 0.00006,
      alpha: 0.06 + Math.random() * 0.09,
    }));

    let lastTime = performance.now();

    let alive = true;
    const draw = (now) => {
      if (!alive) return;
      // harita bir mekânın/telefonun altında kaldıysa çizme (yarım saniyede bir kontrol)
      if (pausedRef.current || document.hidden) {
        lastTime = now;
        rafRef.current = setTimeout(() => requestAnimationFrame(draw), 500);
        return;
      }
      const dt = Math.min(100, now - lastTime);
      lastTime = now;
      ctx.clearRect(0, 0, width, height);

      // --- Yağmur ---
      ctx.strokeStyle = 'rgba(200,220,255,1)';
      ctx.lineCap = 'round';
      rainRef.current.forEach((drop) => {
        drop.y += drop.speed * dt;
        drop.x += drop.drift * dt;
        if (drop.y > 1.05) {
          drop.y = -0.05;
          drop.x = Math.random();
        }
        const px = drop.x * width;
        const py = drop.y * height;
        ctx.globalAlpha = drop.alpha;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - drop.len * 0.18, py + drop.len);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // --- Fabrika dumanı: periyodik olarak her bacadan yeni "duman
      // topu" üret ---
      CHIMNEYS.forEach((c, i) => {
        if (now >= nextSpawnRef.current[i]) {
          smokeRef.current.push({
            chimneyIdx: i,
            x: c.xPct,
            bornAt: now,
            life: 3200 + Math.random() * 1800,
            driftAmp: 4 + Math.random() * 4,
            driftFreq: 0.0009 + Math.random() * 0.0006,
            phase: Math.random() * Math.PI * 2,
            maxRadius: 7 + Math.random() * 5,
          });
          nextSpawnRef.current[i] = now + 500 + Math.random() * 400;
        }
      });

      smokeRef.current = smokeRef.current.filter((p) => now - p.bornAt < p.life);

      smokeRef.current.forEach((p) => {
        const t = (now - p.bornAt) / p.life; // 0 → 1
        const c = CHIMNEYS[p.chimneyIdx];
        const riseY = c.yPct - t * 12; // yukarı doğru yüksel (harita %'si)
        const driftX = p.x + Math.sin(now * p.driftFreq + p.phase) * p.driftAmp * OLD_ASPECT * t;
        const px = (driftX / 100) * width;
        const py = (riseY / 100) * height;
        const radius = 2 + p.maxRadius * t;
        // opacity: 0 → ~0.5 → 0
        const opacity = t < 0.25 ? (t / 0.25) * 0.5 : t > 0.7 ? ((1 - t) / 0.3) * 0.5 : 0.5;

        // v77 performans: canvas blur filtresi (mobilde çok pahalı) yerine
        // yumuşak kenarlı radyal gradyan — görünüm aynı, maliyet çok düşük
        ctx.globalAlpha = Math.max(0, opacity);
        const rr = radius + 3;
        const sg = ctx.createRadialGradient(px, py, 0, px, py, rr);
        sg.addColorStop(0, 'rgba(150,150,155,1)');
        sg.addColorStop(0.55, 'rgba(150,150,155,0.6)');
        sg.addColorStop(1, 'rgba(150,150,155,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // --- Ara sıra bir bacada kısa, düşük opaklıklı "tabela ışığı"
      // titremesi (tüm ekranı kaplayan büyük bir flaş DEĞİL, sadece o
      // binanın üzerinde küçük bir ışık halesi) ---
      if (!flickerRef.current && now >= nextFlickerRef.current) {
        const idx = Math.floor(Math.random() * CHIMNEYS.length);
        flickerRef.current = {
          chimneyIdx: idx,
          startedAt: now,
          duration: 500 + Math.random() * 400,
          peak: 0.12 + Math.random() * 0.1,
        };
      }
      if (flickerRef.current) {
        const f = flickerRef.current;
        const ft = (now - f.startedAt) / f.duration;
        if (ft >= 1) {
          flickerRef.current = null;
          nextFlickerRef.current = now + 3000 + Math.random() * 5000;
        } else {
          const c = CHIMNEYS[f.chimneyIdx];
          const px = (c.xPct / 100) * width;
          const py = (c.yPct / 100) * height;
          // hızlı titreşim: sinüs ile birkaç kez parlayıp sönsün
          const flicker = Math.abs(Math.sin(ft * Math.PI * 6));
          const alpha = f.peak * flicker * (1 - Math.abs(ft - 0.5) * 1.2);
          ctx.save();
          ctx.globalAlpha = Math.max(0, alpha);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, 30);
          grad.addColorStop(0, 'rgba(255,240,200,1)');
          grad.addColorStop(1, 'rgba(255,240,200,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, 30, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
