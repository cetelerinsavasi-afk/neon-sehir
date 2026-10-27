// Presence "bayat mı" kontrolü için sunucu saatine yakın bir "şimdi".
// Cihaz saati ileri/geri olan oyuncu (saati elle ayarlanmış telefon) Date.now() ile
// herkesi bayat sayıp mekânda kimseyi göremiyordu. Kendi nabız kaydım listede
// varsa referans, kayıtlardaki en yeni sunucu zamanıdır; yoksa (son ölçülen kaymayla) cihaz saati.
// Aynı ölçümden cihaz saatinin kayması da tutulur (serverNow — ör. mekân sohbetinin
// 1 saatlik görünürlüğü cihaz saati yanlış olsa da doğru çalışsın).
const SKEW_MIN_MS = 2 * 60 * 1000; // nabız en fazla ~30 sn eski; bunun altındaki fark kayma sayılmaz
let skewMs = 0;
export const serverNow = () => Date.now() - skewMs;

export function presenceNow(snap, uid) {
  let ref = 0;
  let mine = 0;
  snap.forEach((d) => {
    const ms = d.data().updatedAt?.toMillis?.() || 0;
    if (ms > ref) ref = ms;
    if (d.id === uid) mine = ms;
  });
  // kendi kaydım yok ya da yazımı henüz sunucuya ulaşmadı → son ölçülen kayma ile
  if (!mine) return serverNow();
  const diff = Date.now() - mine;
  skewMs = Math.abs(diff) > SKEW_MIN_MS ? diff : 0;
  return ref;
}
