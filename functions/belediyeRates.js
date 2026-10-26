// =============================================================================
// belediyeRates.js — v127 BELEDİYE: oyundaki TÜM vergi oranları ve kamu maaşları
// -----------------------------------------------------------------------------
// Saf modül (Firestore yok) — sunucu (functions/tax.js, belediye.js) ve istemci
// (Belediye paneli, vergi ipuçları) aynı tanımları ve aynı çözümlemeyi kullanır.
//
// KURAL (kullanıcı isteği):
//   • Her kalemi bir bakanlık yönetir (Yönetim kadrosu maaşlarını SADECE başkan).
//   • Bir gün içinde her kalem, o günün geçerli değerinden en fazla 1 adım (±step)
//     oynatılabilir; gün içinde istenildiği kadar geri alınabilir/değiştirilebilir.
//   • Değişiklik ANINDA yürürlüğe girmez: 00:00'dan sonra (yeni gün) geçerli olur
//     ve o gün boyunca sabit kalır. Gece 00:00'da tahsil edilen ama biten güne ait
//     vergiler/maaşlar (fabrika vergisi, piyango, gece maaşları) BİTEN günün
//     oranıyla hesaplanır.
//
// Belgeler (functions/belediye.js):
//   belediye/rates   — { byDay: { 'YYYY-MM-DD': { <id>: değer } } }  (herkes okur)
//                      Bir anahtar o günden itibaren (yeni bir anahtara kadar) geçerli
//                      tam oran setidir.
//   belediye/pending — { next: { <id>: değer }, nextDay, by: { <id>: {name, atMs} } }
//                      (sadece sunucu; yöneticiler panel çağrısıyla görür)
// =============================================================================

export const MINISTRIES = {
  sanayi: { id: 'sanayi', label: 'Sanayi Bakanlığı', short: 'Sanayi', icon: '🏭', seat: 'san' },
  ticaret: { id: 'ticaret', label: 'Ticaret Bakanlığı', short: 'Ticaret', icon: '🏪', seat: 'tic' },
  guvenlik: { id: 'guvenlik', label: 'Teşkilat Bakanlığı', short: 'Teşkilat', icon: '🚓', seat: 'guv' }, // v127: adı Teşkilat (kimlik 'guvenlik' aynı)
  kultur: { id: 'kultur', label: 'Kültür ve Spor Bakanlığı', short: 'Kültür ve Spor', icon: '🎭', seat: 'kul' },
  yonetim: { id: 'yonetim', label: 'Belediye Yönetimi', short: 'Yönetim', icon: '🏛️', seat: null },
};
export const MINISTRY_IDS = ['sanayi', 'ticaret', 'guvenlik', 'kultur'];

const K = 1000;
// unit: '%' (yüzde, tam sayı) · 'gold' (altın)
// min / max: (p) => sayı — p: aynı gün içinde önerilen TAM set (bağımlı sınırlar için)
const pct = (id, label, def = 10, lo = 1, hi = 20) => ({ id, label, unit: '%', def, step: 1, min: () => lo, max: () => hi });

export const RATE_GROUPS = [
  {
    m: 'yonetim',
    id: 'kadro',
    title: 'Yönetim Kadrosu Maaşları',
    unit: 'gold',
    items: [
      { id: 'bsk', label: 'Belediye Başkanı', unit: 'gold', def: 50 * K, step: K, min: (p) => p.byrd + K, max: () => 100 * K },
      { id: 'byrd', label: 'Belediye Başkan Yardımcısı', unit: 'gold', def: 40 * K, step: K, min: (p) => p.bakan + K, max: (p) => p.bsk - K },
      { id: 'bakan', label: 'Bakanlar', unit: 'gold', def: 30 * K, step: K, min: () => 20 * K, max: (p) => p.byrd - K },
    ],
  },
  {
    m: 'sanayi',
    id: 'fabrika',
    title: 'Fabrika Brüt Kazanç Vergileri',
    unit: '%',
    items: [
      { id: 'f1', label: '0 – 99.999 brüt kazanç', unit: '%', def: 1, step: 1, min: () => 1, max: (p) => p.f2 - 1 },
      { id: 'f2', label: '100.000 – 999.999 brüt kazanç', unit: '%', def: 10, step: 1, min: (p) => p.f1 + 1, max: (p) => p.f3 - 1 },
      { id: 'f3', label: '1.000.000 – 9.999.999 brüt kazanç', unit: '%', def: 20, step: 1, min: (p) => p.f2 + 1, max: (p) => p.f4 - 1 },
      { id: 'f4', label: '10.000.000+ brüt kazanç', unit: '%', def: 40, step: 1, min: (p) => p.f3 + 1, max: () => 50 },
    ],
  },
  {
    m: 'sanayi',
    id: 'makine',
    title: 'Makine Alım Vergileri',
    unit: '%',
    items: [pct('mkKripto', 'Kripto (Mining) Makinesi', 5, 1, 10), pct('mkTamir', 'Tamir Malzemesi Makinesi', 5, 1, 10), pct('mkAraba', 'Araba Geliştirme Makinesi', 5, 1, 10), pct('mkSilah', 'Silah Geliştirme Makinesi', 5, 1, 10)],
  },
  { m: 'sanayi', id: 'isci', title: 'İşçi Maaş Vergisi', unit: '%', items: [pct('fisci', 'Fabrika İşçisi Maaş Vergisi')] },
  {
    m: 'ticaret',
    id: 'isletme',
    title: 'İşletme Vergileri',
    unit: '%',
    items: [
      pct('isSilahci', 'Silahçı'),
      pct('isModifiye', 'Modifiye'),
      pct('isKumar', 'Kumarhane (gazino)'),
      pct('isSpor', 'Spor Salonu'),
      pct('isKafe', 'Kafe'),
      pct('isBar', 'Bar'),
      pct('isInternet', 'İnternet Kafe'),
      pct('isOfis', 'Ofis Kazançları'),
    ],
  },
  { m: 'ticaret', id: 'piyango', title: 'Piyango Vergisi', unit: '%', items: [pct('piyango', 'Piyango Kazancı')] },
  // v132: 2. el satış vergisi kaldırıldı (araç / silah / malzeme 2. el satışları vergisiz)
  {
    m: 'ticaret',
    id: 'sifir',
    title: 'Sıfır Satış Kâr Vergileri',
    unit: '%',
    // v130: silahçı / galeri stoktan satış — sadece KÂRDAN (satış − alış) vergi
    // v132: en az %1'e inebilir
    items: [pct('sfAraba', 'Sıfır Araba Satış Kâr Vergisi', 10, 1, 20), pct('sfSilah', 'Sıfır Silah Satış Kâr Vergisi', 10, 1, 20)],
  },
  {
    m: 'guvenlik',
    id: 'polis',
    title: 'Polis Maaşları',
    unit: 'gold',
    items: [
      { id: 'polGenel', label: 'Emniyet Genel Müdürü', unit: 'gold', def: 25 * K, step: K, min: (p) => p.polAmir + K, max: () => 50 * K },
      { id: 'polAmir', label: 'Emniyet Amiri', unit: 'gold', def: 20 * K, step: K, min: (p) => p.polBaskom + K, max: (p) => p.polGenel - K },
      { id: 'polBaskom', label: 'Başkomiser', unit: 'gold', def: 15 * K, step: K, min: (p) => p.polKomiser + K, max: (p) => p.polAmir - K },
      { id: 'polKomiser', label: 'Komiser', unit: 'gold', def: 10 * K, step: K, min: (p) => p.polMemur + K, max: (p) => p.polBaskom - K },
      { id: 'polMemur', label: 'Polis Memuru', unit: 'gold', def: 5 * K, step: K, min: () => K, max: (p) => p.polKomiser - K },
    ],
  },
  {
    m: 'guvenlik',
    id: 'soygunpay',
    title: 'Polislerin Soygunlardan Aldığı Pay',
    unit: '%',
    items: [{ id: 'soygunPay', label: 'Polis Ödülü (durdurulan soygun)', unit: '%', def: 25, step: 5, min: () => 0, max: () => 50 }],
  },
  { m: 'kultur', id: 'sosyal', title: 'Sosyal Medya Vergisi', unit: '%', items: [pct('sosyal', 'Yayın ve Şarkı Gelir Vergisi')] },
  { m: 'kultur', id: 'spor', title: 'Futbolcu ve Menajer Maaş Vergisi', unit: '%', items: [pct('futbolcu', 'Futbolcu'), pct('menajer', 'Menajer')] },
  {
    m: 'kultur',
    id: 'imam',
    title: 'İmam Maaşı',
    unit: 'gold',
    items: [{ id: 'imam', label: 'İmamlık', unit: 'gold', def: 10 * K, step: K, min: () => 5 * K, max: () => 20 * K }],
  },
];

export const RATE_ITEMS = RATE_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, m: g.m, group: g.id, groupTitle: g.title })));
export const RATE_BY_ID = Object.fromEntries(RATE_ITEMS.map((it) => [it.id, it]));
export const RATE_IDS = RATE_ITEMS.map((it) => it.id);
export const DEFAULT_RATES = Object.freeze(Object.fromEntries(RATE_ITEMS.map((it) => [it.id, it.def])));

// İşletme türü → oran anahtarı (functions/businessCatalogData.js BIZ_TYPES)
export const BIZ_RATE_KEY = {
  silahci: 'isSilahci',
  modifiye: 'isModifiye',
  gazino: 'isKumar',
  spor: 'isSpor',
  cafe: 'isKafe',
  bar: 'isBar',
  internet: 'isInternet',
  ofis: 'isOfis',
  // v127: sinema / stüdyo / mescit oyundan kalktı, hepsi "ofis" altında birleşti —
  // eski kayıtlarda kalan türler de Ofis oranını kullanır
  sinema: 'isOfis',
  studyo: 'isOfis',
  mescit: 'isOfis',
};
// Fabrika makinesi türü → oran anahtarı
export const MACHINE_RATE_KEY = { mining: 'mkKripto', tamirMalzemesi: 'mkTamir', arabaGelistirme: 'mkAraba', silahUpgrade: 'mkSilah' };
// Polis rütbesi (kodda eski İstihbarat kimlikleri) → oran anahtarı
export const POLICE_RATE_KEY = { baskan: 'polGenel', sef: 'polAmir', uzman: 'polBaskom', ajan: 'polKomiser', muhbir: 'polMemur' };
// Belediye koltuğu → maaş anahtarı
export const SEAT_SALARY_KEY = { bsk: 'bsk', yrd1: 'byrd', yrd2: 'byrd', san: 'bakan', tic: 'bakan', guv: 'bakan', kul: 'bakan' };

// İstanbul günü (sabit UTC+3) — stateDayKey ile aynı
export const rateDayKey = (ms = Date.now()) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
export const addDayKey = (k, n) => rateDayKey(Date.parse(`${k}T12:00:00+03:00`) + n * 86_400_000);

function clean(set) {
  const out = { ...DEFAULT_RATES };
  if (set && typeof set === 'object') {
    for (const id of RATE_IDS) {
      const v = Number(set[id]);
      if (Number.isFinite(v)) out[id] = v;
    }
  }
  return out;
}

// O gün geçerli tam oran seti. ratesDoc: belediye/rates; pending: belediye/pending
// (pending.nextDay ≤ dayKey ise o set de geçerlidir — gece devri yapılmadan önce
// bile doğru sonuç verir).
export function resolveRates(ratesDoc, dayKey, pending = null) {
  const entries = Object.entries(ratesDoc?.byDay || {});
  if (pending?.next && pending?.nextDay) entries.push([pending.nextDay, pending.next]);
  let best = null;
  for (const [k, v] of entries) if (k <= dayKey && (!best || k > best[0])) best = [k, v];
  return clean(best?.[1]);
}

const fracOf = (rates, id) => Math.max(0, Number(rates?.[id] ?? DEFAULT_RATES[id]) || 0) / 100;
export const rateFrac = fracOf;
export const bizRateKey = (type) => BIZ_RATE_KEY[type] || null;
export const bizRateFrac = (rates, type) => (BIZ_RATE_KEY[type] ? fracOf(rates, BIZ_RATE_KEY[type]) : 0.1);
export const machineRateFrac = (rates, type) => fracOf(rates, MACHINE_RATE_KEY[type] || 'mkTamir');
// 2. el: item türü (weapon / vehicle / diğer)
export const resaleRateKey = (kind) => (kind === 'weapon' || kind === 'silah' ? 'ikSilah' : kind === 'vehicle' || kind === 'araba' ? 'ikAraba' : 'ikMalzeme');
// v132: 2. el satışlar vergisiz (eski kayıtlarda kalan oran yok sayılır)
// eslint-disable-next-line no-unused-vars
export const resaleRateFrac = (rates, kind) => 0;
// v130: sıfır (stoktan) satış kâr vergisi — kind 'weapon' | 'vehicle'
export const newSaleRateKey = (kind) => (kind === 'vehicle' || kind === 'araba' ? 'sfAraba' : 'sfSilah');
export const newSaleRateFrac = (rates, kind) => fracOf(rates, newSaleRateKey(kind));
export const FACTORY_BRACKET_FROM = [0, 100_000, 1_000_000, 10_000_000];
export function factoryRateFrac(rates, gross) {
  const g = Math.max(0, Number(gross) || 0);
  const ids = ['f1', 'f2', 'f3', 'f4'];
  let id = 'f1';
  FACTORY_BRACKET_FROM.forEach((from, i) => {
    if (g >= from) id = ids[i];
  });
  return fracOf(rates, id);
}
export const policeSalary = (rates, rank) => Math.max(0, Math.round(Number(rates?.[POLICE_RATE_KEY[rank] || 'polMemur']) || 0));
export const seatSalary = (rates, seat) => Math.max(0, Math.round(Number(rates?.[SEAT_SALARY_KEY[seat]]) || 0));

// Bir değişikliğin geçerliliği. cur: bugünün geçerli seti · next: önerilen tam set.
// Dönüş: null (geçerli) ya da hata metni.
export function validateNext(cur, next) {
  const c = clean(cur);
  const n = clean(next);
  for (const it of RATE_ITEMS) {
    const v = n[it.id];
    if (!Number.isInteger(v)) return `${it.label}: geçersiz değer.`;
    const d = v - c[it.id];
    if (Math.abs(d) > it.step || (d !== 0 && Math.abs(d) !== it.step)) return `${it.label}: bir günde en fazla ${fmtRate(it.step, it.unit)} oynatılabilir.`;
    if (v < it.min(n) || v > it.max(n)) return `${it.label}: ${fmtRate(it.min(n), it.unit)} – ${fmtRate(it.max(n), it.unit)} aralığında olmalı.`;
  }
  return null;
}

// Bir kalem için bugün seçilebilecek aralık (istemcinin −/+ düğmeleri)
export function boundsOf(cur, next, id) {
  const it = RATE_BY_ID[id];
  const c = clean(cur);
  const n = clean(next);
  return [Math.max(it.min(n), c[id] - it.step), Math.min(it.max(n), c[id] + it.step)];
}

// İki gün arasındaki farklar (rapor + Sixtagram duyurusu)
export function rateChanges(prev, cur) {
  const p = clean(prev);
  const c = clean(cur);
  return RATE_ITEMS.filter((it) => p[it.id] !== c[it.id]).map((it) => ({ id: it.id, label: it.label, m: it.m, group: it.groupTitle, unit: it.unit, from: p[it.id], to: c[it.id] }));
}

// "İyi" yön: maaş artışı oyuncu için iyi (yeşil), vergi artışı kötü (kırmızı)
// v127: belediye kadrosunun (başkan / yardımcı / bakan) maaş artışı kasa için kötü → kırmızı
export const KADRO_SALARY_IDS = ['bsk', 'byrd', 'bakan'];
export const isGoodChange = (unit, id, delta) => (KADRO_SALARY_IDS.includes(id) ? delta < 0 : unit === 'gold' || id === 'soygunPay' ? delta > 0 : delta < 0);

export const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
export function fmtRate(v, unit) {
  return unit === '%' ? `%${v}` : `${fmtNum(v)} altın`;
}

// Hangi bakanlık hangi kalemleri yönetir — panel yetkisi
export const ratesOfMinistry = (m) => RATE_ITEMS.filter((it) => it.m === m).map((it) => it.id);

// =============================================================================
// Devlet defteri kategorisi → bakanlık (Toplu Rapor / bakanlık defteri)
// =============================================================================
export function ministryOfCat(kind, cat) {
  if (kind === 'in') {
    if (/^vergi_(fabrika|makine|maasIsci)/.test(cat)) return 'sanayi';
    if (/^vergi_(yayin|sanatci|maasFutbolcu|maasMenajer)/.test(cat)) return 'kultur';
    // güncelleme öncesi birleşik maaş vergisi (işçi + futbolcu + menajer ayrılamaz) → genel
    if (cat === 'vergi_maas') return 'yonetim';
    if (/^(vergi_|gazino_)/.test(cat)) return 'ticaret';
    if (/^(soygun_|kacak_|ist_|rusvet_)/.test(cat)) return 'guvenlik';
    return 'yonetim';
  }
  if (/^(maas_polis|maas_istihbarat|soygun_|ist_)/.test(cat)) return 'guvenlik';
  if (cat === 'maas_imam') return 'kultur';
  return 'yonetim';
}
