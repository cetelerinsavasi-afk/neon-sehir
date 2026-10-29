// =============================================================================
// stateTreasury.js — v108 DEVLET (Belediye) KASASI
// -----------------------------------------------------------------------------
// Seçim / belediye sisteminden ÖNCE altyapı: oyundaki tüm kamu gelir ve
// giderleri tek bir "devlet kasası" defterinde toplanır. Kasa şimdilik
// EKSİYE inebilir (hiçbir gider kasa bakiyesine bakmaz) — amaç gelir/gider
// dengesini ölçmek (admin › Belediye binası › 📊 Belediye Raporu).
//
// GELİRLER (in)                              GİDERLER (out)
//   vergi_*      — tüm vergiler (tax.js)        maas_polis      — polis rütbe maaşları
//   vergi_oyun   — oyunun kendi mekânları        maas_istihbarat — istihbarat rütbe maaşları
//   soygun_ceza  — soygunda yakalananların      maas_imam       — imam maaşı
//                  cezaları (şüphe + polis)     soygun_odeme    — başarılı soygunlarda
//   kacak_ceza   — parkta yasaklı maddeyle                         suçlulara ödenen para
//                  yakalanma cezaları           ist_operasyon   — istihbarat operasyon ücretleri
//   soygun_kurtarma — (ESKİ, v123'ten beri       soygun_polis_payi — v123: polis
//                  yazılmıyor; eski günlerin                      ekibi yakaladığında
//                  kayıtları için etiket duruyor)                 polislere ödenen %25
//                                                                 pay (cezanın komisyonu)
//   v123 düzeltmesi: polis ekibi yakaladığında devlet suçlulara hiç ödeme yapmaz,
//   ayrı bir "kurtarılan para" nakdi yoktur → defter: +ceza (in) − polis payı (out).
//   ör. banka 500.000, 2 polis, 1 suçlu → +500.000 soygun_ceza, −125.000 polis payı = net +375.000
//   vergi_maas   — v123: futbolcu / menajer / fabrika işçisi maaşları (%10)
//   vergi_piyango — v123: piyango kazançları (%10)
//   vergi_gazino  — v124: oyuncu gazinolarının piyango payı (%10; oyunun gazinosu vergi_oyun)
//   vergi_gazinoCekim — v124 Faz 6: oyuncu gazinosu makine kasasından çekimde %10
//   gazino_*   — v126: oyunun gazinosunun kârı (slot · piyango · rulet · 10 Numara),
//                gece 00:00'da yeni güne yazılır (functions/gameCasinoVault.js)
//   ist_*      — istihbaratın kazandığı her şey (savaş, bahis, rüşvet, çökertme…)
//
// YAZMA: gün + parça (shard) belgelerine artırma — stateLedger/{gün}_s{0..N}.
// Aynı belgeye çok oyuncu aynı anda yazmasın diye 16 parça; okuma tarafı
// parçaları toplar. Hiçbir yazma OKUMA gerektirmez (işlemlere çakışma eklemez).
// Gün kapanışı (closeStateDays, gece 00:00 işinde): biten günlerin parçaları
// stateDays/{gün} özetine ve stateTreasury/main.balance'a toplanır (bir kez).
// =============================================================================

export const STATE_SHARDS = 16;

export const STATE_IN = {
  vergi_isletme: 'Vergi · İşletmeler (güncelleme öncesi, türe ayrılmamış)',
  vergi_ikinciEl: 'Vergi · 2. el / vitrin satışları',
  vergi_fabrika: 'Vergi · Fabrika üretimi',
  vergi_yayin: 'Vergi · Yayın bağışları',
  vergi_sanatci: 'Vergi · Şarkı desteği',
  vergi_ofis: 'Vergi · Ofis gelirleri',
  vergi_maas: 'Vergi · Maaşlar (güncelleme öncesi birleşik kayıt: işçi + futbolcu + menajer)',
  vergi_piyango: 'Vergi · Piyango kazançları',
  vergi_gazino: 'Vergi · Gazino piyango payı', // v124
  vergi_gazinoCekim: 'Vergi · Gazino kasasından çekim', // v124 Faz 6
  vergi_makine: 'Vergi · Fabrika makinesi alımı', // v125 · v126: %5
  vergi_oyun: 'Vergi · Oyunun kendi mekânları',
  // v126 — oyunun gazinosunun kârı (tamamı devlete; vergi değil, devletin kendi kârı)
  gazino_slot: 'Oyunun gazinosu · Slot kârı',
  gazino_piyango: 'Oyunun gazinosu · Piyango bilet kârı (bilet başına 10)',
  gazino_rulet: 'Oyunun gazinosu · Rulet kârı (günlük net, artıdaysa)',
  gazino_onNumara: 'Oyunun gazinosu · 10 Numara kârı (günlük net, artıdaysa)',
  soygun_ceza: 'Soygun cezaları (yakalanan suçlular)',
  kacak_ceza: 'Yasaklı madde cezaları (park)',
  soygun_kurtarma: 'Polisin kurtardığı paranın devlet payı (%75) (eski, artık yazılmıyor)',
  ist_savas: 'Polis Teşkilatı · ticaret yolu savaşı zaferi',
  ist_bahis: 'Polis Teşkilatı · Bahisli savaş kazancı',
  ist_operasyon: 'Polis Teşkilatı · Tır operasyonu tahsilatı',
  ist_rusvet: 'Polis Teşkilatı · Çetelerin ödediği rüşvet',
  ist_cokertme: 'Polis Teşkilatı · Çökertilen çetenin kasası',
  ist_iade: 'Polis Teşkilatı · İade / kalan dağıtım',
  ist_kasa_devri: 'İstihbarat kasasının devri (tek seferlik)',
  rusvet_sahipsiz: 'Karakol rüşvetleri (dağıtılamayan pay / o gece polis yoktu)',
  // v127 — Belediye: maaş vergisi işe göre, işletme vergisi türe göre ayrı kalem
  vergi_maasIsci: 'Vergi · Fabrika işçisi maaşları',
  vergi_maasFutbolcu: 'Vergi · Futbolcu maaşları',
  vergi_maasMenajer: 'Vergi · Menajer maaşları',
  vergi_isl_silahci: 'Vergi · İşletme · Silahçı',
  vergi_isl_modifiye: 'Vergi · İşletme · Modifiye',
  vergi_isl_spor: 'Vergi · İşletme · Spor Salonu',
  vergi_isl_cafe: 'Vergi · İşletme · Kafe',
  vergi_isl_bar: 'Vergi · İşletme · Bar',
  vergi_isl_internet: 'Vergi · İşletme · İnternet Kafe',
  vergi_isl_sinema: 'Vergi · İşletme · Sinema',
  vergi_isl_studyo: 'Vergi · İşletme · Stüdyo',
  vergi_isl_mescit: 'Vergi · İşletme · Mescit bağışları',
  vergi_isl_galeri: 'Vergi · İşletme · Galeri',
  vergi_isl_gazino: 'Vergi · İşletme · Kumarhane',
  vergi_sifirSilah: 'Vergi · Sıfır silah satış kârı', // v130
  vergi_sifirAraba: 'Vergi · Sıfır araba satış kârı', // v130
  bagis: 'Belediyeye bağışlar',
  adaylik: 'Belediye başkanlığı adaylık ücretleri', // v136
  borc_acik: 'Kasa açığının borca çevrilmesi (tek seferlik)',
  diger: 'Diğer gelirler',
};
export const STATE_OUT = {
  maas_polis: 'Polis maaşları',
  maas_istihbarat: 'İstihbarat maaşları (kullanılmıyor — v109 tek teşkilat)',
  maas_imam: 'İmam maaşı',
  soygun_odeme: 'Soygun giderleri (suçlulara ödenen)',
  soygun_polis_payi: 'Polis payı (durdurulan soygunlar)',
  ist_operasyon: 'Polis Teşkilatı operasyon giderleri',
  maas_belediye: 'Belediye kadrosu maaşları', // v127
  borc_maas: 'Maaş borcu ödemeleri', // v127
  borc_diger: 'Diğer borç ödemeleri (soygun borçları)', // v127
  diger: 'Diğer giderler',
};
// v127 — kasa: her canlı gider (out) belediye/kasa.outCum'u da artırır (functions/belediyeKasa.js)
export const KASA_DOC = 'belediye/kasa';

// İstanbul günü (sabit UTC+3) — functions/gang/time.js ile aynı sonuç
export function stateDayKey(ms = Date.now()) {
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
}

const cleanCat = (kind, cat) => {
  const table = kind === 'out' ? STATE_OUT : STATE_IN;
  return Object.prototype.hasOwnProperty.call(table, cat) ? cat : 'diger';
};

// Tek yazma noktası. writer: transaction ya da batch (set ile yazar).
//   db: Firestore (ya da test sahtesi) · FieldValue · base: kök yol öneki
//   (canlı: '' → stateLedger/…; test dünyası: 'gangWorlds/test/' → izole)
// amount ≤ 0 ise hiçbir şey yazmaz. Dönüş: yazılan tutar.
export function stateWrite(writer, db, FieldValue, { kind = 'in', cat, amount, atMs = Date.now(), dayKey = null, base = '', shard = null, stat = null, noKasa = false }) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (!amt || !Number.isFinite(amt)) {
    if (stat) statWrite(writer, db, FieldValue, { atMs, dayKey, base, shard, stat });
    return 0;
  }
  const k = kind === 'out' ? 'out' : 'in';
  const c = cleanCat(k, cat);
  const day = dayKey || stateDayKey(atMs);
  const s = shard == null ? Math.floor(Math.random() * STATE_SHARDS) : Math.abs(Number(shard) || 0) % STATE_SHARDS;
  const ref = db.collection(`${base}stateLedger`).doc(`${day}_s${s}`);
  const patch = {
    dayKey: day,
    [k]: { [c]: FieldValue.increment(amt) },
    [`${k}Total`]: FieldValue.increment(amt),
    [`${k}Count`]: FieldValue.increment(1),
    updatedAtMs: atMs,
  };
  const st = statPatch(FieldValue, stat);
  if (st) patch.stat = st;
  writer.set(ref, patch, { merge: true });
  // v127: canlı defterdeki her gider kasa sayacına da yazılır (kasa denetimi —
  // functions/belediyeKasa.js). Denetimli ödeme yapan çağıran kendi kasa
  // yazımında birleştirir (noKasa).
  if (k === 'out' && !base && !noKasa) writer.set(db.doc(KASA_DOC), { outCum: FieldValue.increment(amt), updatedAtMs: atMs }, { merge: true });
  return amt;
}

// v127 — analiz sayaçları (vergi olmayan ciro / adet): aynı gün parçasına `stat`
function statPatch(FieldValue, stat) {
  if (!stat || typeof stat !== 'object') return null;
  const out = {};
  for (const [key, n] of Object.entries(stat)) {
    const v = Math.round(Number(n) || 0);
    if (v && /^[A-Za-z0-9_]{1,60}$/.test(key)) out[key] = FieldValue.increment(v);
  }
  return Object.keys(out).length ? out : null;
}
export function statWrite(writer, db, FieldValue, { atMs = Date.now(), dayKey = null, base = '', shard = null, stat }) {
  const st = statPatch(FieldValue, stat);
  if (!st) return 0;
  const day = dayKey || stateDayKey(atMs);
  const s = shard == null ? Math.floor(Math.random() * STATE_SHARDS) : Math.abs(Number(shard) || 0) % STATE_SHARDS;
  writer.set(db.collection(`${base}stateLedger`).doc(`${day}_s${s}`), { dayKey: day, stat: st, updatedAtMs: atMs }, { merge: true });
  return 1;
}

// Doğrudan (işlem dışı) yazma — en sonda, hata ana işi bozmaz.
export async function stateAdd(db, FieldValue, entry) {
  const batch = db.batch();
  const n = stateWrite(batch, db, FieldValue, entry);
  if (n) await batch.commit();
  return n;
}

// Parça belgelerini gün gün topla
export function foldDocs(docs) {
  const days = {};
  for (const d of docs) {
    const v = typeof d.data === 'function' ? d.data() : d;
    const day = v.dayKey;
    if (!day) continue;
    const t = (days[day] ||= { dayKey: day, in: {}, out: {}, inTotal: 0, outTotal: 0, stat: {} });
    for (const [c, n] of Object.entries(v.in || {})) t.in[c] = (t.in[c] || 0) + Number(n || 0);
    for (const [c, n] of Object.entries(v.out || {})) t.out[c] = (t.out[c] || 0) + Number(n || 0);
    for (const [c, n] of Object.entries(v.stat || {})) t.stat[c] = (t.stat[c] || 0) + Number(n || 0);
    t.inTotal += Number(v.inTotal || 0);
    t.outTotal += Number(v.outTotal || 0);
  }
  return days;
}

function addInto(acc, day) {
  for (const [c, n] of Object.entries(day.in || {})) acc.in[c] = (acc.in[c] || 0) + Number(n || 0);
  for (const [c, n] of Object.entries(day.out || {})) acc.out[c] = (acc.out[c] || 0) + Number(n || 0);
  acc.inTotal += Number(day.inTotal || 0);
  acc.outTotal += Number(day.outTotal || 0);
  return acc;
}
const emptyAcc = () => ({ in: {}, out: {}, inTotal: 0, outTotal: 0 });

// Biten günleri kapat: stateDays/{gün} özeti + stateTreasury/main (bakiye ve
// tüm zamanların kalem toplamları). İdempotent: main.closedThrough.
export async function closeStateDays(db, FieldValue, { todayKey, base = '' } = {}) {
  const mainRef = db.doc(`${base}stateTreasury/main`);
  const main = (await mainRef.get()).data() || {};
  const after = main.closedThrough || '';
  // sadece kapanmamış günler okunur (aynı alanda aralık sorgusu → ek dizin gerekmez)
  let q = db.collection(`${base}stateLedger`).where('dayKey', '<', todayKey);
  if (after) q = q.where('dayKey', '>', after);
  const snap = await q.get();
  const days = foldDocs(snap.docs.filter((d) => (d.data().dayKey || '') > after));
  const keys = Object.keys(days).sort();
  if (!keys.length) return { closed: 0 };
  return db.runTransaction(async (tx) => {
    const cur = (await tx.get(mainRef)).data() || {};
    if ((cur.closedThrough || '') !== after) return { closed: 0, raced: true };
    const totals = { in: { ...(cur.totals?.in || {}) }, out: { ...(cur.totals?.out || {}) }, inTotal: Number(cur.totals?.inTotal || 0), outTotal: Number(cur.totals?.outTotal || 0) };
    let balance = Number(cur.balance || 0);
    for (const k of keys) {
      const d = days[k];
      addInto(totals, d);
      balance += d.inTotal - d.outTotal;
      tx.set(db.doc(`${base}stateDays/${k}`), { ...d, net: d.inTotal - d.outTotal, balanceAfter: balance, closedAtMs: Date.now() });
    }
    tx.set(mainRef, { balance, totals, closedThrough: keys[keys.length - 1], updatedAtMs: Date.now(), firstDayKey: cur.firstDayKey || keys[0] }, { merge: true });
    return { closed: keys.length, balance };
  });
}

// Admin raporu: bakiye (kapanmış günler + bugün dahil açık günler), bugün,
// dün, son 7 / 30 gün ve tüm zamanların kalem kalem gelir/gideri, son 14 günün
// günlük neti. Sadece sunucu (callable) çağırır.
export async function readStateReport(db, { todayKey, base = '' } = {}) {
  const addDaysKey = (k, n) => stateDayKey(Date.parse(`${k}T12:00:00+03:00`) + n * 86_400_000);
  const from30 = addDaysKey(todayKey, -29);
  const [mainSnap, openSnap, closedSnap] = await Promise.all([
    db.doc(`${base}stateTreasury/main`).get(),
    db.collection(`${base}stateLedger`).where('dayKey', '>=', from30).get(),
    db.collection(`${base}stateDays`).where('dayKey', '>=', from30).get(),
  ]);
  const main = mainSnap.data() || {};
  const closedThrough = main.closedThrough || '';
  // Son 30 gün: kapanmış günler stateDays'ten, açık olanlar parçalardan
  const byDay = {};
  closedSnap.docs.forEach((d) => (byDay[d.data().dayKey] = d.data()));
  const live = foldDocs(openSnap.docs);
  for (const [k, d] of Object.entries(live)) if (k > closedThrough || !byDay[k]) byDay[k] = d;
  // bakiye: kapanmış bakiye + kapanmamış günlerin neti (30 günden eskisi kapanmamışsa onlar da)
  let balance = Number(main.balance || 0);
  const allTime = { in: { ...(main.totals?.in || {}) }, out: { ...(main.totals?.out || {}) }, inTotal: Number(main.totals?.inTotal || 0), outTotal: Number(main.totals?.outTotal || 0) };
  let olderOpen = {};
  if (closedThrough < from30) {
    let oq = db.collection(`${base}stateLedger`).where('dayKey', '<', from30);
    if (closedThrough) oq = oq.where('dayKey', '>', closedThrough);
    const older = await oq.get();
    olderOpen = foldDocs(older.docs.filter((d) => (d.data().dayKey || '') > closedThrough));
  }
  for (const d of [...Object.values(olderOpen), ...Object.entries(live).filter(([k]) => k > closedThrough).map(([, d]) => d)]) {
    balance += d.inTotal - d.outTotal;
    addInto(allTime, d);
  }
  const range = (n) => {
    const acc = emptyAcc();
    for (let i = 0; i < n; i++) {
      const d = byDay[addDaysKey(todayKey, -i)];
      if (d) addInto(acc, d);
    }
    return acc;
  };
  const yesterday = byDay[addDaysKey(todayKey, -1)];
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const k = addDaysKey(todayKey, -i);
    const d = byDay[k];
    daily.push({ dayKey: k, inTotal: Number(d?.inTotal || 0), outTotal: Number(d?.outTotal || 0) });
  }
  return {
    todayKey,
    balance,
    firstDayKey: main.firstDayKey || Object.keys(byDay).sort()[0] || todayKey,
    today: byDay[todayKey] ? addInto(emptyAcc(), byDay[todayKey]) : emptyAcc(),
    yesterday: yesterday ? addInto(emptyAcc(), yesterday) : emptyAcc(),
    last7: range(7),
    last30: range(30),
    allTime,
    daily,
    labels: { in: STATE_IN, out: STATE_OUT },
  };
}
