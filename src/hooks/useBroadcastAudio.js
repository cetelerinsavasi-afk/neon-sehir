import { useEffect, useMemo, useRef } from 'react';

// useBroadcastAudio.js — Röportaj videosu (madde 1) VE TV kanalları (madde 3)
// için PAYLAŞILAN ses motoru. Tıpkı FactoryShiftGame.jsx / HookGoldGame.jsx /
// TempoSyncGame.jsx'teki desende olduğu gibi: DOSYASIZ, Web Audio API ile
// anlık üretilen sesler, her şey try/catch içinde ("ses opsiyonel, bazı
// tarayıcılarda AudioContext kısıtlı olabilir" — AYNI gerekçe). Yeni bir ses
// varlık hattı/kütüphane YOK — sadece osilatör + gürültü buffer'ı (ikisi de
// Web Audio API'nin kendi ilkel araçları).
//
// Tasarım kararı: sesler VARSAYILAN OLARAK KAPALI (muted=true) başlar —
// akışta aynı anda birden fazla röportaj/TV kartı olabileceği için hepsi
// otomatik seslendirilirse kakofoniye yol açar (tıpkı normal video
// akışlarındaki "sessiz otomatik oynatma, dokunarak aç" deseni gibi). Bu
// aynı zamanda Camii için istenen "isteğe bağlı kapatılabilmeli" isteğini de
// karşılıyor. Tarayıcıların "kullanıcı etkileşimi olmadan ses çalma" kısıtı
// da böylece hiç sorun olmuyor — AudioContext sadece kullanıcı "sesi aç"a
// bastığında (gerçek bir tıklama olayı içinde) oluşturuluyor/resume ediliyor.

function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// AMBIENCE_PRESETS — her mekan için: sürekli çalan filtrelenmiş gürültü
// (rüzgar/trafik/hışırtı/uğultu) + arada bir tetiklenen kısa bir "olay"
// sesi (kuş cikcikleri, korna, telsiz bip'i, tık, ding). Camii'de KASITLI
// olarak müzik/efekt YOK — sadece çok hafif bir iç mekan yankısı (madde 2b).
const AMBIENCE_PRESETS = {
  park: {
    filter: { type: 'lowpass', frequency: 700, Q: 0.5 },
    noiseGain: 0.05,
    event: {
      minMs: 3500,
      maxMs: 8000,
      play: (ctx, dest) => {
        // Seyrek kuş "cik" sesi — iki hızlı yüksek perdeli blip.
        [0, 90].forEach((delay) => {
          scheduleBlip(ctx, dest, {
            delayMs: delay,
            freq: 2200 + Math.random() * 600,
            type: 'sine',
            durMs: 45,
            gain: 0.05,
          });
        });
      },
    },
  },
  sehir: {
    filter: { type: 'lowpass', frequency: 420, Q: 0.6 },
    noiseGain: 0.09,
    event: {
      minMs: 6000,
      maxMs: 14000,
      play: (ctx, dest) => {
        // "Tüt tüt" korna — iki nota, kısa square/sawtooth blip.
        scheduleBlip(ctx, dest, { delayMs: 0, freq: 380, type: 'square', durMs: 130, gain: 0.06 });
        scheduleBlip(ctx, dest, { delayMs: 170, freq: 380, type: 'square', durMs: 130, gain: 0.06 });
      },
    },
  },
  karakol: {
    filter: { type: 'bandpass', frequency: 2200, Q: 0.7 },
    noiseGain: 0.045,
    event: {
      minMs: 9000,
      maxMs: 19000,
      play: (ctx, dest) => {
        // Telsiz "bip"i — çok seyrek, kısa ve tiz.
        scheduleBlip(ctx, dest, { delayMs: 0, freq: 1400, type: 'sine', durMs: 90, gain: 0.05 });
      },
    },
  },
  camii: {
    // Saygılı/minimal: sadece çok hafif iç mekan yankısı hissi, olay sesi YOK.
    filter: { type: 'lowpass', frequency: 320, Q: 0.3 },
    noiseGain: 0.015,
    event: null,
  },
  banka: {
    filter: { type: 'lowpass', frequency: 500, Q: 0.4 },
    noiseGain: 0.04,
    event: {
      minMs: 5000,
      maxMs: 12000,
      play: (ctx, dest) => {
        // Çok seyrek klavye tık sesi.
        scheduleBlip(ctx, dest, { delayMs: 0, freq: 900, type: 'square', durMs: 18, gain: 0.035 });
      },
    },
  },
  gazino: {
    filter: { type: 'bandpass', frequency: 1100, Q: 0.5 },
    noiseGain: 0.07,
    event: {
      minMs: 6000,
      maxMs: 15000,
      play: (ctx, dest) => {
        // Slot makinesi "ding"i — sine + üst harmonik.
        scheduleBlip(ctx, dest, { delayMs: 0, freq: 1500, type: 'sine', durMs: 260, gain: 0.05 });
        scheduleBlip(ctx, dest, { delayMs: 0, freq: 2250, type: 'sine', durMs: 200, gain: 0.025 });
      },
    },
  },
};

function scheduleBlip(ctx, dest, { delayMs = 0, freq = 440, type = 'sine', durMs = 60, gain = 0.06 }) {
  const startAt = ctx.currentTime + delayMs / 1000;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + durMs / 1000);
  o.connect(g);
  g.connect(dest);
  o.start(startAt);
  o.stop(startAt + durMs / 1000 + 0.02);
}

// useBroadcastAudio — `muted` false olduğu sürece: (1) mekana göre sürekli
// ambiyans döngüsü çalar, (2) dönen `triggerMumble()` fonksiyonu her
// çağrıldığında kısa bir "insan mırıltısı" blip'i üretir (bkz.
// useTalkingBroadcast'in onMouthToggle callback'i — konuşma animasyonuyla
// AYNI zamanlamayı kullanır, madde 2a).
export function useBroadcastAudio(locationId, { muted = true } = {}) {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null); // { noiseSource, filter, gain, eventTimer }
  const preset = useMemo(() => AMBIENCE_PRESETS[locationId] || null, [locationId]);

  const ensureContext = () => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
      return ctxRef.current;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (muted || !preset) {
      // Susturulduysa (ya da mekan için ambiyans tanımlı değilse) çalan
      // her şeyi durdur.
      stopAmbience();
      return undefined;
    }
    const ctx = ensureContext();
    if (!ctx) return undefined;
    try {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = makeNoiseBuffer(ctx, 2);
      noiseSource.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = preset.filter.type;
      filter.frequency.value = preset.filter.frequency;
      filter.Q.value = preset.filter.Q;
      const gain = ctx.createGain();
      gain.gain.value = preset.noiseGain;
      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noiseSource.start();

      let eventTimer = null;
      if (preset.event) {
        const scheduleNext = () => {
          const delay = preset.event.minMs + Math.random() * (preset.event.maxMs - preset.event.minMs);
          eventTimer = setTimeout(() => {
            try {
              preset.event.play(ctx, ctx.destination);
            } catch {
              // Ses opsiyonel.
            }
            scheduleNext();
          }, delay);
        };
        scheduleNext();
      }

      nodesRef.current = { noiseSource, filter, gain, eventTimer };
    } catch {
      // Ses opsiyonel — bazı tarayıcılarda AudioContext kısıtlı olabilir.
    }

    return () => stopAmbience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, preset]);

  function stopAmbience() {
    const nodes = nodesRef.current;
    if (!nodes) return;
    try {
      clearTimeout(nodes.eventTimer);
      nodes.noiseSource.stop();
      nodes.noiseSource.disconnect();
      nodes.filter.disconnect();
      nodes.gain.disconnect();
    } catch {
      // zaten durmuş olabilir.
    }
    nodesRef.current = null;
  }

  useEffect(() => () => {
    stopAmbience();
    try {
      ctxRef.current?.close();
    } catch {
      // yoksay.
    }
  }, []);

  // triggerMumble — "bıdıbıdı" konuşma mırıltısı: kısa (15-30ms), rastgele
  // hafif perde değişimli square/triangle ton (300-650Hz), madde 2a.
  const triggerMumble = () => {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      const freq = 300 + Math.random() * 350;
      const dur = 15 + Math.random() * 15;
      scheduleBlip(ctx, ctx.destination, {
        freq,
        type: Math.random() > 0.5 ? 'square' : 'triangle',
        durMs: dur,
        gain: 0.035,
      });
    } catch {
      // Ses opsiyonel.
    }
  };

  return { triggerMumble, ensureAudioStarted: ensureContext };
}
