// =============================================================================
// v147.3 — Sixtagram fotoğraf önbelleği (cihazda, IndexedDB).
// Ev / mekân / şehir fotoğrafları görsel olarak saklanmaz; her cihaz 3D sahneden
// çizer (yavaş + bellek). Bir kez çizilen kare JPEG olarak cihaza kaydedilir;
// sonraki açılışlarda 3D sahne hiç kurulmadan anında gösterilir.
// En fazla MAX kare tutulur (en eski silinir). Hata olursa sessizce çizmeye döner.
// =============================================================================
const DB = 'neon-photo-cache';
const STORE = 'p';
const MAX = 120;
let dbP = null;

function open() {
  if (dbP) return dbP;
  dbP = new Promise((resolve) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => {
        const s = rq.result.createObjectStore(STORE, { keyPath: 'k' });
        s.createIndex('at', 'at');
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbP;
}

// uzun anahtar → kısa sağlam özet (FNV-1a, iki tur)
export function photoKey(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${str.length.toString(36)}`;
}

const mem = new Map(); // aynı oturumda tekrar okumasın

export async function getCachedPhoto(key) {
  if (mem.has(key)) return mem.get(key);
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => {
        const v = rq.result;
        if (!v?.blob) return resolve(null);
        const url = URL.createObjectURL(v.blob);
        mem.set(key, url);
        resolve(url);
      };
      rq.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function dataUrlToBlob(u) {
  const [head, b64] = u.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function putCachedPhoto(key, dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
  const db = await open();
  if (!db) return;
  try {
    const blob = dataUrlToBlob(dataUrl);
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.put({ k: key, at: Date.now(), blob });
    // en eskileri sil
    const cnt = st.count();
    cnt.onsuccess = () => {
      const extra = cnt.result - MAX;
      if (extra <= 0) return;
      let n = 0;
      const cur = st.index('at').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || n >= extra) return;
        c.delete();
        n += 1;
        c.continue();
      };
    };
  } catch {
    /* önbellek isteğe bağlı */
  }
}

// Görünür olunca çiz: ekranın 500 px yakınına gelene kadar 3D sahne kurulmaz
export function whenVisible(el, cb) {
  if (!el || typeof IntersectionObserver === 'undefined') {
    cb();
    return () => {};
  }
  let done = false;
  const io = new IntersectionObserver(
    (ents) => {
      if (done || !ents.some((e) => e.isIntersecting)) return;
      done = true;
      io.disconnect();
      cb();
    },
    { rootMargin: '500px 0px' }
  );
  io.observe(el);
  return () => io.disconnect();
}

// =============================================================================
// v149 — "Sixtagram'a girince oyun yenileniyor": akıştaki ev ve şehir fotoğrafları
// ayrı kuyruklarda çiziliyordu → telefonda aynı anda iki ekran dışı 3D sahne (ev +
// tüm şehir) ve ikinci bir grafik bağlamı açık kalıyordu; bellek taşınca tarayıcı /
// uygulama sayfayı yeniden yüklüyordu (giriş ekranı). Artık:
//   • ev + şehir fotoğrafları TEK ortak kuyrukta, aynı anda tek 3D sahne,
//   • bir tür başlamadan önce diğer türün bekleyen ekran dışı motoru kapatılır.
// =============================================================================
let photoQueue = Promise.resolve();
const releasers = new Map(); // tür → ekran dışı motoru kapatan fonksiyon
export function registerPhotoReleaser(kind, fn) {
  releasers.set(kind, fn);
}
let pending = 0;
let idleTimer = 0;
const idleHooks = new Set();
// kuyruk boşalıp bir süre boş kalınca (telefonda grafik bağlamını bırakmak için)
export function onPhotoQueueIdle(fn) {
  idleHooks.add(fn);
  return () => idleHooks.delete(fn);
}
export function runPhotoJob(kind, fn) {
  pending += 1;
  clearTimeout(idleTimer);
  const done = () => {
    pending -= 1;
    if (pending > 0) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (pending > 0) return;
      // önce bekleyen ekran dışı motorlar, sonra grafik bağlamı (sıra önemli)
      releasers.forEach((rel) => {
        try {
          rel();
        } catch {
          /* yoksay */
        }
      });
      idleHooks.forEach((h) => {
        try {
          h();
        } catch {
          /* yoksay */
        }
      });
    }, 4000);
  };
  const job = (photoQueue = photoQueue
    .catch(() => {})
    .then(() => {
      releasers.forEach((rel, k) => {
        if (k === kind) return;
        try {
          rel();
        } catch {
          /* yoksay */
        }
      });
      return fn();
    }));
  job.then(done, done);
  return job;
}
export const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
