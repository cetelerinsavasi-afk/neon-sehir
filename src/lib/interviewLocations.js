// interviewLocations.js — RÖPORTAJ (madde 1) mekan listesi. Bilerek
// PostAttachment.jsx'teki INTERIOR_BACKGROUNDS'tan AYRI tutuldu (o,
// "fotoğraf" özelliğine ait ve farklı bir mekan kümesi kullanıyor); burada
// kullanıcının istediği 6 röportaj mekanı var.
//
// KULLANICI REVİZESİ: mekanların ARKA PLAN ÇİZİMİ artık burada değil —
// oyunun üstten/izometrik "dünya" sahnelerini (drawBankSceneBackground vb.)
// bir fotoğraf kutusuyla kırpan eski yaklaşım "sanki o mekanda
// geziyormuşuz gibi" durduğu için kaldırıldı. Yeni, kameraya dönük
// "stüdyo arka planı" çizimleri artık lib/broadcastBackdrops.js'te (bkz.
// oradaki dosya başı yorumu) — bu dosyada sadece mekan id/etiket/emoji
// listesi kalıyor.
export const INTERVIEW_LOCATIONS = [
  { id: 'park', label: 'Park', emoji: '🌳' },
  { id: 'karakol', label: 'Karakol', emoji: '👮' },
  { id: 'camii', label: 'Camii', emoji: '🕌' },
  { id: 'banka', label: 'Banka', emoji: '🏦' },
  { id: 'sehir', label: 'Şehir', emoji: '🏙️' },
  { id: 'gazino', label: 'Casino', emoji: '🎰' },
];

export const INTERVIEW_LOCATION_LABELS = Object.fromEntries(
  INTERVIEW_LOCATIONS.map((l) => [l.id, l.label])
);
