// =============================================================================
// v162 — KORNA SESLERİ (WebAudio ile üretilir, ses dosyası yok → indirme yükü sıfır)
// Şehirde 📯 düğmesi (City/sound.js) ve Modifiye stüdyosundaki "▶ Dinle" aynı kodu kullanır.
// Türler: functions/vehicleMods.js MOD_OPTIONS.horn ile aynı anahtarlar.
// =============================================================================

// tek nota: osilatör(ler) → (filtre) → zarf
function note(ctx, dest, { t, dur, freqs, type = 'square', vol = 0.22, attack = 0.02, release = 0.08, slide = null, lp = null, detune = 0 }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    f.Q.value = 1.2;
    g.connect(f);
    out = f;
  }
  out.connect(dest);
  freqs.forEach((fr, i) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(fr, t);
    if (slide) slide(o.frequency, fr, t, dur);
    if (detune) o.detune.value = (i % 2 ? 1 : -1) * detune;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  });
}

export function playHorn(ctx, dest, type = 'standart', gain = 1) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  const v = (x) => x * gain;
  switch (type) {
    case 'tiz': // bip bip
      note(ctx, dest, { t, dur: 0.14, freqs: [880, 1108], vol: v(0.16) });
      note(ctx, dest, { t: t + 0.2, dur: 0.16, freqs: [880, 1108], vol: v(0.16) });
      break;
    case 'kalin': // lüks sedan: kalın akor
      note(ctx, dest, { t, dur: 0.7, freqs: [196, 247, 294], type: 'sawtooth', vol: v(0.16), lp: 1400 });
      break;
    case 'vintage': // ahuuga: yükselen + inen
      note(ctx, dest, {
        t,
        dur: 0.75,
        freqs: [260],
        type: 'square',
        vol: v(0.2),
        lp: 1600,
        slide: (p, fr, t0, d) => {
          p.setValueAtTime(fr * 0.7, t0);
          p.exponentialRampToValueAtTime(fr * 1.5, t0 + d * 0.35);
          p.exponentialRampToValueAtTime(fr * 1.1, t0 + d);
        },
      });
      break;
    case 'melodi': // kısa nağme (özgün)
      [523, 659, 784, 659, 1047].forEach((fr, i) => note(ctx, dest, { t: t + i * 0.13, dur: 0.12, freqs: [fr], type: 'triangle', vol: v(0.22), attack: 0.01, release: 0.04 }));
      break;
    case 'ordek': // vak vak
      [0, 0.24].forEach((dt) =>
        note(ctx, dest, {
          t: t + dt,
          dur: 0.18,
          freqs: [620],
          type: 'square',
          vol: v(0.18),
          lp: 1300,
          slide: (p, fr, t0, d) => p.exponentialRampToValueAtTime(fr * 0.55, t0 + d),
        })
      );
      break;
    case 'tir': // havalı tır düdüğü
      note(ctx, dest, { t, dur: 1.15, freqs: [185, 233, 277], type: 'sawtooth', vol: v(0.17), attack: 0.05, release: 0.2, lp: 1900, detune: 8 });
      break;
    case 'gemi': // gemi düdüğü (çok kalın, uzun)
      note(ctx, dest, { t, dur: 1.5, freqs: [98, 147], type: 'sawtooth', vol: v(0.22), attack: 0.12, release: 0.35, lp: 700, detune: 6 });
      break;
    case 'standart':
    default: // fabrika kornası (eski ses — aynen)
      note(ctx, dest, { t, dur: 0.48, freqs: [392, 494], type: 'square', vol: v(0.25), attack: 0.02, release: 0.43 });
  }
}

// Modifiye stüdyosunda önizleme (kendi küçük ses bağlamı; ilk dokunuşta açılır)
let previewCtx = null;
export function previewHorn(type) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!previewCtx) previewCtx = new AC();
    previewCtx.resume?.();
    playHorn(previewCtx, previewCtx.destination, type);
  } catch {
    /* ses kapalı / desteklenmiyor */
  }
}
