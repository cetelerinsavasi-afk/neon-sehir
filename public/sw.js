// Neon Şehir — minimal service worker. PWA "ana ekrana ekle" davranışı ve
// Android uygulaması (TWA) için aktif bir service worker + fetch handler
// bulunması gerekir. Oyun gerçek zamanlı Firestore verisine dayandığı için
// içerik ÖNBELLEKLENMEZ (bayat veri riski) — istekler olduğu gibi ağa gider.
//
// Tek istisna (Play yayını hazırlığı): internet yokken sayfa gezinmelerinde
// Chrome'un hata ekranı yerine küçük bir "Bağlantı yok" sayfası gösterilir.
// Önbellekte yalnızca bu sayfa tutulur (ikonu sayfanın içine gömülü).
const OFFLINE_CACHE = 'ns-offline-v1';
// v162 HIZ — derlenmiş oyun dosyaları (/assets/…, adlarında içerik özeti var → içerik değişince
// adı da değişir, eski adla asla farklı içerik gelmez) cihazda saklanır: ikinci açılıştan itibaren
// ağ beklenmeden anında yüklenir. Oyun VERİSİ (Firestore vb.) bundan etkilenmez, hep canlıdır.
// index.html önbelleğe ALINMAZ → güncellemeler eskisi gibi hemen gelir.
const ASSET_CACHE = 'ns-assets-v1';
const ASSET_MAX = 400; // en fazla bu kadar dosya tutulur (eski sürümlerin dosyaları zamanla atılır)
// Cloudflare .html uzantısını yönlendirir (/offline.html → 307 /offline); yönlendirilmiş
// yanıt gezinmeye verilemediği için yönlendirmesiz adres kullanılır.
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => (k.startsWith('ns-offline-') && k !== OFFLINE_CACHE) || (k.startsWith('ns-assets-') && k !== ASSET_CACHE))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
    return;
  }
  const req = event.request;
  let url = null;
  try {
    url = new URL(req.url);
  } catch {
    /* yoksay */
  }
  if (req.method === 'GET' && url && url.origin === self.location.origin && url.pathname.startsWith('/assets/') && !req.headers.has('range')) {
    event.respondWith(assetFirst(req));
    return;
  }
  event.respondWith(fetch(req));
});

// Önce cihazdaki kopya; yoksa ağdan alınır ve saklanır. Ağ hatasında da varsa kopya verilir.
async function assetFirst(req) {
  let cache = null;
  try {
    cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
  } catch {
    /* depolama kapalı → doğrudan ağ */
  }
  const res = await fetch(req);
  if (cache && res && res.ok && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    cache
      .put(req, copy)
      .then(() => trimAssets(cache))
      .catch(() => {});
  }
  return res;
}

let trimming = false;
async function trimAssets(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const extra = keys.length - ASSET_MAX;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]); // en eski eklenenler önce
  } catch {
    /* yoksay */
  } finally {
    trimming = false;
  }
}
