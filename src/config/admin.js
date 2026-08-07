// Oyunculardan gizli, sadece geliştiriciye açık aksiyonlar (örn. transfer
// piyasasını elle anında yeniden kurma) için basit bir izin listesi.
// DİKKAT: buradaki UID(ler), functions/index.js içindeki ADMIN_UIDS ile
// BİREBİR AYNI olmalı — burası sadece butonun GÖRÜNÜRLÜĞÜNÜ kontrol
// eder, gerçek yetki kontrolü sunucu tarafında (requireAdmin) yapılıyor.
// Firebase Console > Authentication > Users sekmesinden kendi hesabının
// UID'sini kopyalayıp buraya ekle.
export const ADMIN_UIDS = ['REPLACE_WITH_YOUR_FIREBASE_AUTH_UID'];

export function isAdminUid(uid) {
  return Boolean(uid) && ADMIN_UIDS.includes(uid);
}
