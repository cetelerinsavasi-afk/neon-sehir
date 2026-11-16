// v165 — geçici okuma ölçümünün açılış / raporlama kısmı (bkz. meter.js)
import { createMeter, READ_STATS_RATE, READ_STATS_END, REPORT_MS } from './meter.js';

function decide() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const ls = window.localStorage;
    if (ls?.getItem('neon.noReadStats') === '1') return false;
    if (ls?.getItem('neon.readStats') === '1') return true; // test için zorla
    if (Date.now() > READ_STATS_END) return false;
    return Math.random() < READ_STATS_RATE;
  } catch {
    return false;
  }
}

export const meter = decide() ? createMeter({ isVisible: () => document.visibilityState !== 'hidden' }) : null;

if (meter) {
  let allowed = null; // null: bayrak henüz okunmadı · true/false
  let seq = 0;
  const sid = Math.random().toString(36).slice(2, 12);
  const app = /Android/i.test(navigator.userAgent || '') ? 'android' : 'web';

  // uzaktan kapatma: dosya yoksa / bozuksa / false ise KAPALI
  fetch(`/neon-flags.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      allowed = j?.readStats === true;
    })
    .catch(() => {
      allowed = false;
    });

  let sending = false;
  const send = () => {
    if (allowed !== true || sending) return;
    const s = meter.take();
    if (!Object.keys(s.b).length) return;
    sending = true;
    seq += 1;
    const payload = { v: 165, sid, seq, ms: s.ms, vis: s.vis, rate: READ_STATS_RATE, app, b: s.b };
    Promise.all([import('firebase/functions'), import('../../firebase')])
      .then(([f, fb]) => f.httpsCallable(fb.functions, 'clientReadStats')(payload))
      .catch(() => {})
      .finally(() => {
        sending = false;
      });
  };
  setInterval(send, REPORT_MS);
  document.addEventListener('visibilitychange', () => {
    const vis = document.visibilityState !== 'hidden';
    meter.visibility(vis);
    if (!vis) send(); // arka plana alınınca birikeni gönder
  });
}
