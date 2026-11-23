// =============================================================================
// Presence özeti — v188: GEÇİŞ MODU (sayım YOK)
//
// v79–v137: sunucu park/iç mekân/ev presence koleksiyonlarının tüm aktif kayıtlarını okuyup
// "kaç kişi var" sayılarını stats/presence belgesine yazıyordu. v138'den beri istemciler bu
// sayıları Realtime Database'ten (occ) alıyor; v188 istemcilerinde Firestore yedeği de yok.
//
// v188'den ESKİ istemcilerin kodunda şu kural var: stats/presence 15 dakikadan eskiyse "yok"
// sayılır ve istemci 30 sn'de bir 400 belgeye kadar okumaya geçer. Bu yüzden belge kapatılmaz,
// donmaz: iş 10 dakikada bir SADECE atMs alanını tazeler (1 yazma; hiçbir belge okunmaz).
// Eski istemciler belgeyi taze sanır, pahalı yola düşmez; gördükleri sayılar son halinde kalır.
//
// KALDIRMA: v188 yayından ~2 hafta sonra (PRESENCE_KEEPALIVE_REMOVE_AFTER) iş tamamen silinir.
// index.html önbelleğe alınmadığı için uygulamayı yeniden açan herkes yeni sürüme geçer; o
// tarihe kadar açık kalan eski oturum kalmaz. v188 istemcileri bu belgeyi hiç okumaz.
// =============================================================================
export const PRESENCE_KEEPALIVE_REMOVE_AFTER = '2026-12-08';

export function createPresenceSummary({ db, now = () => Date.now() }) {
  // Sadece canlılık: { atMs } birleştirilerek yazılır, diğer alanlar (eski sayılar) olduğu gibi kalır.
  async function run() {
    const t = now();
    await db.collection('stats').doc('presence').set({ atMs: t }, { merge: true });
    return { written: true, atMs: t };
  }
  return { run };
}
