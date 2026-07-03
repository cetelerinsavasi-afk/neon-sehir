// Neon Şehir — minimal service worker. PWA "ana ekrana ekle" davranışının
// (özellikle Android/Chrome) tetiklenebilmesi için aktif bir service
// worker + fetch handler bulunması şart. Şimdilik özel bir önbellekleme
// stratejisi uygulamıyoruz, sadece pass-through yapıyoruz — oyun zaten
// gerçek zamanlı Firestore verisine dayandığı için agresif önbellekleme
// bayat veri gösterme riski taşır.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
