// =============================================================================
// v77 — Vergi altyapısı · v127: TÜM ORANLARI BELEDİYE BELİRLER
//
//   Oranlar artık sabit değil: functions/belediyeRates.js (tanımlar, varsayılanlar,
//   günlük çözümleme). Belediye bir oranı değiştirirse 00:00'dan sonra (yeni gün)
//   geçerli olur ve o gün boyunca sabit kalır. Gece 00:00'da tahsil edilen ama
//   biten güne ait vergiler (fabrika vergisi, piyango) BİTEN günün oranıyla.
//
//   · İşletme gelirleri: türüne göre (Silahçı, Modifiye, Kafe, Bar, İnternet,
//     Spor, Ofis, Sinema, Stüdyo, Mescit, Kumarhane) — varsayılan %10.
//   · 2. el / vitrin satışları: araba · silah · malzeme/makine — varsayılan %1.
//   · Fabrikalar (kademeli): günlük BRÜT üretim kazancına göre 4 dilim
//     (varsayılan %1 / %10 / %20 / %40). Oran o günün brüt gelirinin TAMAMINA.
//   · Makine alımı: makine türüne göre (varsayılan %5).
//   · Maaş vergileri: fabrika işçisi · futbolcu · menajer (varsayılan %10).
//   · Piyango kazancı (varsayılan %10).
//
// SUNUCU: functions/index.js her çağrının başında `loadRates(db)` ile günün
// setini önbelleğe alır (örnek başına günde ~2 okuma). Fonksiyonlar son
// parametre olarak açık bir oran seti (`rates`) de alabilir (istemci / test).
//
// v108: Toplanan TÜM vergiler devlet (belediye) kasasına gelir yazılır
// (functions/stateTreasury.js — kaynak başına ayrı kalem). Her ödeyen için
// günlük kayıt da sürer: taxLedger/{gün}_{uid}. Tek yazma noktası burası.
// =============================================================================
import { midnightDayKey } from './businessCatalogData.js';
import { stateWrite, statWrite } from './stateTreasury.js';
import { resolveRates, rateDayKey, bizRateFrac, resaleRateFrac, factoryRateFrac, machineRateFrac, rateFrac, DEFAULT_RATES, FACTORY_BRACKET_FROM } from './belediyeRates.js';

// ---------------------------------------------------------------------------
// Oran önbelleği (sunucu). Bir günün oranları o gün içinde DEĞİŞMEZ (gün içi
// değişiklikler yarına yazılır) → gün başına bir okuma yeterli.
// ---------------------------------------------------------------------------
let CACHE = { day: null, doc: null, pending: null };
let LOADING = null;
export async function loadRates(db, { force = false } = {}) {
  const day = rateDayKey();
  if (!force && CACHE.day === day && CACHE.doc) return CACHE;
  if (LOADING && !force) return LOADING;
  LOADING = (async () => {
    const [r, p] = await Promise.all([db.doc('belediye/rates').get(), db.doc('belediye/pending').get()]);
    CACHE = { day, doc: r.data() || {}, pending: p.data() || null };
    return CACHE;
  })();
  try {
    return await LOADING;
  } finally {
    LOADING = null;
  }
}
// Test / belediye.js: önbelleği doğrudan ayarla
export function setRatesCache(doc = {}, pending = null, day = rateDayKey()) {
  CACHE = { day, doc: doc || {}, pending: pending || null };
}
// O günün tam oran seti (önbellek yoksa varsayılanlar)
export function ratesFor(dayKey = rateDayKey()) {
  return resolveRates(CACHE.doc, dayKey, CACHE.pending);
}
export const currentRates = () => ratesFor();

// Varsayılanlar (geriye uyum — yeni kod oranı ratesFor/fonksiyonlardan alır)
export const BIZ_TAX_RATE = DEFAULT_RATES.isKafe / 100;
export const RESALE_TAX_RATE = DEFAULT_RATES.ikAraba / 100;
export const SALARY_TAX_RATE = DEFAULT_RATES.fisci / 100;
export const LOTTERY_TAX_RATE = DEFAULT_RATES.piyango / 100;
export const MACHINE_TAX_RATE = DEFAULT_RATES.mkTamir / 100;
export const FACTORY_TAX_RATE = 0.1; // eski sabit oran (geriye uyum)
export const FACTORY_TAX_BRACKETS = FACTORY_BRACKET_FROM.map((from, i) => ({ from, rate: DEFAULT_RATES[`f${i + 1}`] / 100 }));

export const taxOf = (amount, rate) => Math.max(0, Math.round((Number(amount) || 0) * rate));

// İşletme geliri (türüne göre)
export const bizTaxRate = (type, rates = ratesFor()) => bizRateFrac(rates, type);
export const bizTax = (amount, type, rates = ratesFor()) => taxOf(amount, bizRateFrac(rates, type));
// 2. el / vitrin: kind = 'weapon' | 'vehicle' | diğer (malzeme / makine)
export const resaleTaxRate = (kind, rates = ratesFor()) => resaleRateFrac(rates, kind);
export const resaleTax = (amount, kind = 'vehicle', rates = ratesFor()) => taxOf(amount, resaleRateFrac(rates, kind));
// Fabrika (kademeli) — dayKey: kazancın ait olduğu gün (gece tahsilatında biten gün)
export function factoryTaxRate(grossIncome, rates = ratesFor()) {
  return factoryRateFrac(rates, grossIncome);
}
export const factoryTax = (amount, rates = ratesFor()) => taxOf(amount, factoryRateFrac(rates, amount));
// Makine alımı (türüne göre) — istemci de aynı formülü kullanır
export const machineTaxRate = (type, rates = ratesFor()) => machineRateFrac(rates, type);
export const machineTax = (price, type, rates = ratesFor()) => Math.max(0, Math.round((Number(price) || 0) * machineRateFrac(rates, type)));
export const withMachineTax = (price, type, rates = ratesFor()) => Math.max(0, Math.round(Number(price) || 0)) + machineTax(price, type, rates);
// Sosyal medya (yayın bağışı + şarkı desteği)
export const socialTaxRate = (rates = ratesFor()) => rateFrac(rates, 'sosyal');
export const socialTax = (amount, rates = ratesFor()) => taxOf(amount, rateFrac(rates, 'sosyal'));

// v123: brüt → { tax, net } (net + tax = brüt; yuvarlama vergiden yana değil)
//   job: 'isci' (fabrika işçisi) · 'futbolcu' · 'menajer'
const SALARY_RATE_ID = { isci: 'fisci', fabrika: 'fisci', futbolcu: 'futbolcu', menajer: 'menajer' };
export function splitSalaryTax(gross, job = 'isci', rates = ratesFor()) {
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const tax = Math.min(g, Math.floor(g * rateFrac(rates, SALARY_RATE_ID[job] || 'fisci')));
  return { gross: g, tax, net: g - tax };
}
export const salaryTaxRate = (job = 'isci', rates = ratesFor()) => rateFrac(rates, SALARY_RATE_ID[job] || 'fisci');
export function splitLotteryTax(gross, rates = ratesFor()) {
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const tax = Math.min(g, Math.floor(g * rateFrac(rates, 'piyango')));
  return { gross: g, tax, net: g - tax };
}
export const lotteryTaxRate = (rates = ratesFor()) => rateFrac(rates, 'piyango');
// Kumarhane (oyuncu gazinosu: piyango payı + makine kasasından çekim)
export const casinoTaxRate = (rates = ratesFor()) => bizRateFrac(rates, 'gazino');
// Yüzde metni (SMS / ipucu)
export const pctText = (frac) => `%${Math.round(Number(frac || 0) * 1000) / 10}`;

// Kaynak anahtarları (rapor/ileride belediye ekranı için)
export const TAX_SOURCES = {
  isletme: 'İşletme geliri',
  ikinciEl: '2. el / vitrin satışı',
  fabrika: 'Fabrika üretimi (kademeli)',
  yayin: 'Yayın bağışı',
  sanatci: 'Şarkı desteği', // v93
  ofis: 'Ofis geliri — ücretli mobilyalar', // v100
  maas: 'Maaş — futbolcu / menajer / fabrika işçisi', // v123
  piyango: 'Piyango kazancı', // v123
  gazino: 'Gazino piyango payı', // v124
  gazinoCekim: 'Gazino kasasından çekim', // v124 Faz 6 — oyuncu gazinosu makine kasası
  makine: 'Fabrika makinesi alımı', // v125
};

// v127: devlet defterinde kalem — maaş vergisi işe göre, işletme vergisi türe göre
function stateCatOf(source, uid, ref, bizType) {
  if (uid === '__game__') return 'vergi_oyun';
  if (source === 'maas') return ref === 'futbolcu' ? 'vergi_maasFutbolcu' : ref === 'menajer' ? 'vergi_maasMenajer' : 'vergi_maasIsci';
  if (source === 'isletme' && bizType) return `vergi_isl_${bizType}`;
  return `vergi_${source}`;
}

// Vergi kaydı. YAZMA (transaction ya da batch). amount ≤ 0 ise yazmaz.
//   writer: tx ya da batch · uid: ödeyen (oyunun mekânları için '__game__')
//   bizType: işletme türü (v127 — defterde tür başına kalem)
//   stat: { anahtar: artış } — v127 belediye analizi sayaçları (aynı parça belgesine)
export function taxLedgerWrite(writer, db, FieldValue, { amount, source, uid, atMs = Date.now(), dayKey, ref, bizType, stat }) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (!amt || !uid) return 0;
  const day = dayKey || midnightDayKey(atMs);
  const src = TAX_SOURCES[source] ? source : 'isletme';
  const patch = {
    dayKey: day,
    uid,
    total: FieldValue.increment(amt),
    bySource: { [src]: FieldValue.increment(amt) },
    count: FieldValue.increment(1),
    updatedAtMs: atMs,
  };
  if (ref) patch.refs = { [String(ref).slice(0, 80)]: FieldValue.increment(amt) };
  writer.set(db.collection('taxLedger').doc(`${day}_${uid}`), patch, { merge: true });
  // v108 — devlet kasasına gelir (oyunun kendi mekânları ayrı kalemde)
  stateWrite(writer, db, FieldValue, { kind: 'in', cat: stateCatOf(src, uid, ref, bizType), amount: amt, atMs, dayKey: day, stat });
  return amt;
}

// Vergisi olmayan ama analizde sayılan hareketler (ör. ciro) — YAZMA
export function taxStatWrite(writer, db, FieldValue, { atMs = Date.now(), dayKey, stat }) {
  return statWrite(writer, db, FieldValue, { dayKey: dayKey || midnightDayKey(atMs), atMs, stat });
}

export { rateDayKey };
