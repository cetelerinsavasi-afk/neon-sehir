// =============================================================================
// v167 — AÇILIŞ SIRASI (önem sırasına göre yükleme)
//
// Oyun açılınca her şey aynı anda başlıyordu: şehir kurulurken + kurulduğu an onlarca Firestore
// dinleyicisi, bildirimler, telefon / görev / yayın düğmeleri, diğer oyuncular… Telefonda ilk
// saniyelerde kasma buradan geliyordu. Artık iş aşamalara bölünür:
//
//   0  açılış     → oturum, oyuncu belgesi, şehir + kendi avatarın (başka hiçbir şey)
//   1  dünya      → diğer oyuncular, altın / şüphe, görevler (şehir hazır olduktan ~0,7 sn sonra)
//   2  ayrıntılar → telefon / ChatsApp, bildirimler, canlı yayın, seçim, sosyal + çete dinleyicileri
//   3  arka plan  → ekranların önceden indirilmesi, satın alma geri yükleme vb.
//
// Bir sonraki aşamaya SABİT sürede değil, kareler akıcıyken geçilir (son karelerin süresi ölçülür);
// yavaş telefonda iş yayılır, hızlı telefonda her şey 2-3 sn'de gelir. Her aşamanın bir üst sınırı
// vardır (takılı kalınmaz). Şehir hiç açılmazsa (ör. başka ekran) aşamalar zamanla yine ilerler.
// =============================================================================
import { useSyncExternalStore } from 'react';

let stage = 0;
const subs = new Set();
let cityReadyAt = 0;
let started = false;

function setStage(n) {
  if (n <= stage) return;
  stage = n;
  try {
    performance.mark?.(`ns-boot-${n}`);
  } catch {
    /* yoksay */
  }
  subs.forEach((f) => f());
}

export const getBootStage = () => stage;
export function subscribeBoot(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
// Aşama n'e ulaşıldı mı? (ulaşınca bir kez yeniden çizer)
export function useBootStage(n) {
  return useSyncExternalStore(
    subscribeBoot,
    () => stage >= n,
    () => true
  );
}
// Aşama n'e ulaşınca fn bir kez çalışır (zaten ulaşıldıysa hemen). Dönen işlev iptal eder.
export function whenBootStage(n, fn) {
  if (stage >= n) {
    fn();
    return () => {};
  }
  let off = null;
  off = subscribeBoot(() => {
    if (stage < n) return;
    off?.();
    off = null;
    fn();
  });
  return () => {
    off?.();
    off = null;
  };
}

// --- kare akıcılığı ölçümü ---------------------------------------------------------------
const deltas = [];
let lastT = 0;
let rafOn = false;
function sample(t) {
  if (lastT) {
    deltas.push(t - lastT);
    if (deltas.length > 12) deltas.shift();
  }
  lastT = t;
  if (stage < 3) requestAnimationFrame(sample);
  else rafOn = false;
}
function smooth() {
  if (typeof document !== 'undefined' && document.hidden) return true; // arka planda bekletme
  if (deltas.length < 8) return false;
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const worst = sorted[sorted.length - 1];
  // telefonda şehir dururken 30 kare/sn'ye iner (33 ms) — bu "akıcı" sayılır
  return median < 40 && worst < 90;
}
// en az `min` ms bekle; sonra kareler akıcı olunca (en geç `max` ms'de) aşamaya geç
function advance(n, min, max, then) {
  const t0 = performance.now();
  const tick = () => {
    if (stage >= n) return then?.();
    const el = performance.now() - t0;
    if (el >= max || (el >= min && smooth())) {
      setStage(n);
      then?.();
      return;
    }
    setTimeout(tick, 120);
  };
  setTimeout(tick, Math.min(min, 120));
}

function run() {
  if (started) return;
  started = true;
  if (typeof requestAnimationFrame === 'function' && !rafOn) {
    rafOn = true;
    requestAnimationFrame(sample);
  }
  advance(1, 700, 2500, () => advance(2, 2200, 5000, () => advance(3, 2500, 7000)));
}

// Şehir ilk kez çizildiğinde (CityScreen › onReady)
export function markCityReady() {
  if (cityReadyAt) return;
  cityReadyAt = performance.now();
  run();
}

// Yedek: şehir hiç hazır olmazsa (başka ekran, grafik hatası, misafirin 2D haritası) aşamalar yine ilerler
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (!started) run();
  }, 9000);
}
