// Neon Şehir — minimal service worker. PWA "ana ekrana ekle" davranışı ve
// Android uygulaması (TWA) için aktif bir service worker + fetch handler
// bulunması gerekir. Oyun gerçek zamanlı Firestore verisine dayandığı için
// içerik ÖNBELLEKLENMEZ (bayat veri riski) — istekler olduğu gibi ağa gider.
//
// Tek istisna (Play yayını hazırlığı): internet yokken sayfa gezinmelerinde
// Chrome'un hata ekranı yerine küçük bir "Bağlantı yok" sayfası gösterilir.
// Önbellekte yalnızca bu sayfa tutulur (ikonu sayfanın içine gömülü).
const OFFLINE_CACHE = 'ns-offline-v1';
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ns-offline-') && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
    return;
  }
  event.respondWith(fetch(event.request));
});
