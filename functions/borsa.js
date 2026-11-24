// =============================================================================
// v176 — NEON BORSA: seyyar satıcı + şirket hisseleri (sunucu + istemci ortak saf kurallar)
// v189 — SINIRSIZ HİSSE + PARÇA ALIM (bkz. docs/v189-borsa.md)
// -----------------------------------------------------------------------------
// KURALLAR
//   • 6 mekân (seyyar satıcı) + 4 şirket. v189: hisse sayısı SINIRSIZ, hisseler küsuratlı.
//     İçeride tam sayı birim: 1 hisse = 1.000.000 birim (U). Ekranda "10", "10,5", "0,03".
//   • Fiyat (eski eğrinin sürekli hali). S = satılmış toplam hisse:
//       anlık fiyat               1000 × (S + 0,5)
//       S'den x hisse ALMAK       500 × x × (2S + x + 1)
//       S'den x hisse SATMAK      500 × x × (2S − x + 1)
//     Tam 1 hisse: alış (n+1)×1000, satış n×1000 — v188 ile birebir aynı. Hesaplar BigInt ile.
//   • Komisyon %1: alışta eklenir (yukarı), satışta kesilir; tüm yuvarlamalar sistemin lehine.
//   • Alım birimi (anlık fiyata göre): <10.000 → 1 hisse · 10.000–99.999 → 0,1 · ... (her 10 katta
//     bir basamak küçülür). Büyük buton = 10 × birim.
//   • v193 ALIM SINIRI (kişi başı, mekân başı): toplam satılmış hisse 100'e kadar en çok 10 hisse; sonra
//     satılmış hissenin 10'da 1'i. Kendi alımın da toplamı artırır: h + x ≤ (S + x) / 10 → x ≤ (S − 10h) / 9
//     (200 satılmışken boştan ~22). Satış her zaman serbest. Hisse sınırın üstündeyse (başkaları sattıysa)
//     alım yapılamaz, satış yapılır. Günlük sınır yok.
//   • Al-satta vergi yok. Hisse satış parası borca gitmez.
//   • Günlük gelir hak kazanmış hisselere bölünür. GECE TEMETTÜ AVI ENGELİ: iki dağıtım arasında
//     alınan hisse bir sonraki dağıtımı ATLAR (o günü tam elde tutmamış). O payı diğer (hak
//     kazanmış) hissedarlar paylaşır; mekânda hak kazanmış hisse yoksa gelir belediyeye gider.
//     Satışta önce o dönem alınan birimler düşülür.
//   • Gelir sınırsız birikir; küsurat kaybolmaz (Q ölçeğinde saklanır). Toplarken vergi + borç payı.
//   • v189: 20 gün OYUNA GİRMEYEN (users/{uid}/private/meta.lastSeenAtMs) oyuncunun hisseleri gece
//     satılır, biriken geliri vergi + borç payı düşülüp yatırılır, SMS gider (24 saat önceki uyarı
//     SMS'i kalktı).
//   • Hesap silinince hisseleri havuza döner.
//
// FIRESTORE
//   borsa/piyasa — TEK belge (v: 2). co.<mekân> = {
//       u   satılmış toplam birim (S × U)
//       h   hissedar sayısı
//       A   hak kazanmış BİRİM başına birikmiş gelir × Q (BigInt, metin)
//       bt  bu dönemde (son dağıtımdan sonra) alınıp hâlâ elde tutulan birim — dağıtımdan pay almaz
//       btd bt'nin dönemi (distDay)
//       aH  son ACC_HIST_LEN dağıtımın sonrası: [{ d: distDay, a: A }, ...]
//       inc[10] dağıtılan günlük gelir · ps[10] hisse başına günlük gelir · ch[168] saatlik 1000×S }
//   users/{uid}.borsa.<mekân> (v: 2) = {
//       u birim · a son hesaplaşmadaki A · pq hesaplaşmış biriken gelir × Q (metin)
//       b bu dönem alınan (pay almayacak) birim · bd onların dönemi · ba alımdaki A (yedek)
//       c alış maliyeti · r/g piyasa kâr/zararı (v185) }
//     ESKİ biçim (v alanı yok: n tam hisse, a/p/c) okunurken çevrilir, ilk işlemde yeni biçim yazılır
//     (TEMBEL GEÇİŞ — toplu yazma yok). Piyasa belgesi ilk yazımda (işlem ya da saatlik iş) v:2 olur.
//   + borsaSon (son borsa işlemi, ms; saniyede 1 istek sınırı ve 20 gün taraması için).
// =============================================================================

export const BORSA_UNITS = 1_000_000; // 1 hisse = U birim
const UB = 1_000_000n;
export const BORSA_Q = 10n ** 18n; // gelir ölçeği: altın × Q / birim
const LEGACY_ACC_TO_A = 10n ** 9n; // v188 acc (binde bir altın / hisse) → A (altın × Q / birim)
export const BORSA_PRICE_STEP = 1000; // eski BORSA_UNIT: 1 basamak = 1.000 altın
// v193: kişi başı sınır = en az 10 hisse, toplam satılmış hissenin 10'da 1'i (bkz. capOf / buyRoom)
export const BORSA_CAP_MIN = 10 * BORSA_UNITS;
export const capOf = (coU) => Math.max(BORSA_CAP_MIN, Math.floor(Math.max(0, Math.floor(Number(coU) || 0)) / 10));
// bu kadar birim daha alınabilir (aldıkça toplam da artar): max(10 − h, (S − 10h) / 9), en az 0
// Sınıra kadar alırken miktar 0,01 hisseye yuvarlanır (elde 28,806693 gibi uzun küsuratlar oluşmasın).
export const BORSA_ROOM_GRAIN = BORSA_UNITS / 100;
export function buyRoom(holdU, coU) {
  const h = Math.max(0, Math.floor(Number(holdU) || 0));
  const S = Math.max(0, Math.floor(Number(coU) || 0));
  const r = Math.max(0, BORSA_CAP_MIN - h, Math.floor((S - 10 * h) / 9));
  return Math.floor(r / BORSA_ROOM_GRAIN) * BORSA_ROOM_GRAIN;
}
export const BORSA_COMMISSION_PCT = 1n;
export const BORSA_IDLE_DAYS = 20;
export const BORSA_RATE_MS = 1000; // oyuncu başına saniyede en fazla 1 borsa isteği
export const BORSA_ACC_HIST_LEN = 40; // dağıtım sonrası A geçmişi (dönem içi alımların hak kazanma noktası)
export const BORSA_CHART_LEN = 24 * 7; // saatlik nokta, 7 gün
export const BORSA_INC_LEN = 10; // son 10 günün geliri
export const BORSA_DOC = 'borsa/piyasa';
export const BORSA_TAX_RATE_ID = 'hisse';
export const BORSA_MARKET_V = 2;
import { VENUE_SHARE_TYPES, VENUE_CO_ID, VENUE_CO_SK, VENUE_CO_NAME } from './v196Shared.js';
export const BORSA_HOLD_V = 2;
export const BORSA_RTDB_PATH = 'borsaFiyat'; // v189: canlı fiyat yayını { <mekân>: u }

// Mekânlar (kimlik = vendorData VENDORS[..].venue) · sk: buyFromVendor istatistik kodu
export const BORSA_COS = [
  { id: 'kokorecci', vendor: 'seyyar_satici_1', sk: 'kk', name: 'Kokoreçci' },
  { id: 'simitci', vendor: 'seyyar_satici_2', sk: 'sm', name: 'Simitçi' },
  { id: 'donerci', vendor: 'seyyar_satici_3', sk: 'dn', name: 'Balık Ekmekçi' },
  { id: 'kofteci', vendor: 'seyyar_satici_4', sk: 'kf', name: 'Köfteci' },
  { id: 'midyeci', vendor: 'seyyar_satici_5', sk: 'md', name: 'Midyeci' },
  { id: 'dondurmaci', vendor: 'seyyar_satici_6', sk: 'dd', name: 'Dondurmacı' },
  // v177 — şirketler: gelir = o gün satılan yeni ticari araç + şoför gelirlerinin %10'u (v201: %50 masraf + şirket vergisi düşülür)
  { id: 'hastane', sk: 'hn', name: 'Hastane', kind: 'sirket' },
  { id: 'nakliye', sk: 'nk', name: 'Nakliye', kind: 'sirket' },
  { id: 'terminal', sk: 'tm', name: 'Terminal', kind: 'sirket' },
  { id: 'taksi', sk: 'tk', name: 'Taksi Durağı', kind: 'sirket' },
  // v196 — oyunun mekânları: gelir = brüt − %50 masraf − belediye vergisi (business.recordGameIncomeTx).
  // v201: toplarken hisse gelir vergisi her hissede (mekân dahil) kesilir.
  ...VENUE_SHARE_TYPES.map((t) => ({ id: VENUE_CO_ID[t], sk: VENUE_CO_SK[t], name: VENUE_CO_NAME[t], kind: 'mekan', venueType: t })),
];
// v201: hisse geliri TOPLANIRKEN her hissede (mekân, seyyar satıcı, şirket) hisse gelir vergisi kesilir.
// (v196'da mekân hisseleri vergisizdi; artık her gelir önce %50 masraf + kendi vergisi, toplarken hisse vergisi.)
export const isTaxFreeCo = () => false;
export function collectTaxFrac(by, taxFrac) {
  let total = 0;
  for (const v of Object.values(by || {})) total += Math.max(0, Number(v) || 0);
  return total > 0 ? Math.max(0, Number(taxFrac) || 0) : 0;
}
export const BORSA_CO_IDS = BORSA_COS.map((c) => c.id);
export const BORSA_CO_BY_ID = Object.fromEntries(BORSA_COS.map((c) => [c.id, c]));
export const borsaCoOfVendor = (vendorId) => BORSA_COS.find((c) => c.vendor === vendorId) || null;
export const isBorsaCo = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BORSA_CO_BY_ID, id);
// v200 — SEYYAR SATICI GELİRİ: oyunun mekânları gibi %50 masraf + belediyenin seyyar satıcı vergisi
// (Ticaret, varsayılan %10), kalan kâr hissedarlara (hs_<kod>). Hisse gelir vergisi toplarken ayrıca kesilir.
export function vendorIncomeSplit(amount, taxFrac) {
  const gross = Math.max(0, Math.round(Number(amount) || 0));
  const expense = Math.round(gross * 0.5);
  const tax = Math.min(gross - expense, Math.round(gross * Math.max(0, Math.min(0.5, Number(taxFrac) || 0))));
  return { gross, expense, tax, share: gross - expense - tax };
}
export const VENDOR_TAX_RATE_ID = 'seyyar';
// v201 — ŞİRKETLER (Hastane, Nakliye, Terminal, Taksi Durağı): gelir = yeni ticari araç satışının TAMAMI + şoför
// gelirlerinin %10'u; aynı kural: %50 masraf + belediyenin şirket vergisi (Ticaret), kalan hissedarlara.
export const COMPANY_TAX_RATE_ID = 'sirket';
export const companyIncomeSplit = vendorIncomeSplit;
// buyFromVendor'un devlet defteri parçasına eklediği gelir sayacı
export const borsaIncomeStatKey = (sk) => `hs_${sk}`;
// v177: şirket kimliğinden gelir sayacı (fleet.js)
export const borsaCompanyStatKey = (coId) => (BORSA_CO_BY_ID[coId] ? borsaIncomeStatKey(BORSA_CO_BY_ID[coId].sk) : null);

// ---- sayı yardımcıları --------------------------------------------------------
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const int = (v) => Math.max(0, Math.floor(num(v)));
// Negatif olmayan BigInt (metin / sayı / BigInt); bozuksa 0
export function big(v) {
  if (typeof v === 'bigint') return v < 0n ? 0n : v;
  if (typeof v === 'string' && /^\d{1,60}$/.test(v)) return BigInt(v);
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return BigInt(Math.floor(v));
  return 0n;
}
const ceilDiv = (a, b) => (a <= 0n ? 0n : (a + b - 1n) / b);
const bmax0 = (x) => (x < 0n ? 0n : x);
// BigInt → güvenli tam sayı (oyunda altın/birim her zaman güvenli aralıkta; değilse hata)
export function toSafe(b) {
  const n = Number(b);
  if (!Number.isSafeInteger(n)) throw new RangeError('borsa: tutar güvenli aralığın dışında');
  return n;
}

// ---- hisse gösterimi ----------------------------------------------------------
// birim → "10", "10,5", "0,03", "1.250,25" (gereksiz sıfırlar olmadan)
export function fmtShares(units) {
  const u = int(units);
  const whole = Math.floor(u / BORSA_UNITS);
  const frac = String(u % BORSA_UNITS)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${whole.toLocaleString('tr-TR')}${frac ? `,${frac}` : ''}`;
}
export const sharesOf = (units) => int(units) / BORSA_UNITS;
// v193: kısa gösterim (kutulara sığsın): 10 ve üstü 1 küsurat, altı 2 küsurat, aşağı yuvarlanır, sıfırlar atılır
// 28,806693 → "28,8" · 14,31741 → "14,3" · 0,0372 → "0,03" · 0,004 → "0,004" (çok küçükse 3 hane)
export function fmtSharesShort(units) {
  const v = int(units) / BORSA_UNITS;
  const d = v >= 10 ? 1 : v >= 0.01 || v === 0 ? 2 : 3;
  const k = 10 ** d;
  const t = Math.floor(v * k + 1e-9) / k;
  return t.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

// ---- fiyatlar (S = satılmış toplam BİRİM, x = birim) ------------------------------------
// S'den x birim almanın / satmanın temel tutarı (komisyonsuz). Alış yukarı, satış aşağı yuvarlanır.
export function buyBaseU(S, x) {
  const s = big(S);
  const X = big(x);
  if (X <= 0n) return 0n;
  return ceilDiv(500n * X * (2n * s + X + UB), UB * UB);
}
export function sellBaseU(S, x) {
  const s = big(S);
  const X = big(x);
  if (X <= 0n || X > s) return 0n;
  return (500n * X * (2n * s - X + UB)) / (UB * UB);
}
const fee = (base) => ceilDiv(base * BORSA_COMMISSION_PCT, 100n);
// { base, kom, total } — alış (komisyon eklenir)
export function buyQuote(S, x) {
  const base = buyBaseU(S, x);
  const kom = fee(base);
  return { base: toSafe(base), kom: toSafe(kom), total: toSafe(base + kom) };
}
// { base, kom, net } — satış (komisyon kesilir)
export function sellQuote(S, x) {
  const base = sellBaseU(S, x);
  const kom = fee(base);
  return { base: toSafe(base), kom: toSafe(kom), net: toSafe(base - kom) };
}
// Anlık fiyat 1000 × (S + 0,5) — tam sayı kısmı (alım birimi ve gösterim için)
export const priceNow = (S) => Math.floor(int(S) / 1000) + 500;
// Grafik / piyasa değeri: 1000 × S (tam hissede eski satış fiyatıyla aynı)
export const chartPrice = (S) => Math.floor(int(S) / 1000);
// Alım birimi (birim): fiyat < 10.000 → 1 hisse; her 10 katta bir basamak küçülür (en az 1 birim)
export function stepUnits(S) {
  const p = priceNow(S);
  let lim = 10_000;
  let step = BORSA_UNITS;
  while (p >= lim && step > 1) {
    lim *= 10;
    step /= 10;
  }
  return step;
}

// v188 ile uyumlu tam hisse kısayolları (n = satılmış tam hisse)
export const buyCost = (n) => buyQuote(int(n) * BORSA_UNITS, BORSA_UNITS).total;
export const sellGet = (n) => (int(n) <= 0 ? 0 : sellQuote(int(n) * BORSA_UNITS, BORSA_UNITS).net);
export const sellBase = (n) => int(n) * BORSA_PRICE_STEP;

// ---- piyasa ve pay durumu (eski / yeni biçim) ---------------------------------------
const isV2Market = (market) => Number(market?.v) >= BORSA_MARKET_V;
export function coState(market, id) {
  const c = market?.co?.[id] || {};
  const v2 = isV2Market(market);
  const arr = (a, len) => (Array.isArray(a) ? a.map(int).slice(-len) : []);
  return {
    u: v2 ? int(c.u) : int(c.n) * BORSA_UNITS,
    h: int(c.h),
    A: v2 ? big(c.A) : big(int(c.acc)) * LEGACY_ACC_TO_A,
    bt: v2 ? int(c.bt) : 0,
    btd: v2 ? (c.btd ?? null) : (market?.distDay ?? null),
    // Firestore iç içe dizi kabul etmez → [{ d, a }]
    aH: v2 && Array.isArray(c.aH) ? c.aH.filter((e) => e && typeof e.d === 'string').map((e) => [e.d, big(e.a)]) : [],
    inc: arr(c.inc, BORSA_INC_LEN),
    // v182: 1 hissenin günlük kazancı (son 10 gün; hak kazanmış hisse yoksa tek hisse hepsini alırdı)
    ps: arr(c.ps, BORSA_INC_LEN),
    ch: arr(c.ch, BORSA_CHART_LEN),
  };
}
// Piyasa belgesine yazılacak hali (Firestore'da BigInt yok → metin)
export function coDoc(co) {
  return { u: co.u, h: co.h, A: co.A.toString(), bt: co.bt, btd: co.btd ?? null, aH: co.aH.map(([d, a]) => ({ d, a: a.toString() })), inc: co.inc, ps: co.ps, ch: co.ch };
}
// Eski (v1) piyasa belgesini tek seferde yeni biçime çeviren yama (n/acc silinir)
export function marketMigrationPatch(market, FieldValue) {
  const patch = { v: BORSA_MARKET_V, co: {} };
  for (const id of BORSA_CO_IDS) patch.co[id] = { ...coDoc(coState(market, id)), n: FieldValue.delete(), acc: FieldValue.delete() };
  return patch;
}

export function holdState(player, id) {
  const h = player?.borsa?.[id] || {};
  const v2 = Number(h.v) >= BORSA_HOLD_V;
  const out = v2
    ? { u: int(h.u), a: big(h.a), pq: big(h.pq), b: int(h.b), bd: h.bd ?? null, ba: h.ba != null ? big(h.ba) : null, c: int(h.c) }
    : // TEMBEL GEÇİŞ: eski n tam hisse → n × U birim; a (binde bir altın/hisse) → A ölçeği; p altın → × Q
      { u: int(h.n) * BORSA_UNITS, a: big(int(h.a)) * LEGACY_ACC_TO_A, pq: big(int(h.p)) * BORSA_Q, b: 0, bd: null, ba: null, c: int(h.c) };
  if (out.b > out.u) out.b = out.u;
  // v185: r = son işlemimden sonraki piyasa fiyatı (1 hisse), g = o zamana kadar biriken piyasa kâr/zararı
  if (h.r != null) out.r = int(h.r);
  if (h.g != null) out.g = Math.trunc(num(h.g));
  return out;
}
export function holdDoc(h) {
  const d = { v: BORSA_HOLD_V, u: h.u, a: h.a.toString(), pq: h.pq.toString(), c: h.c };
  if (h.b > 0) {
    d.b = h.b;
    d.bd = h.bd;
    if (h.ba != null) d.ba = h.ba.toString();
  }
  if (h.r != null) d.r = h.r;
  if (h.g != null) d.g = h.g;
  return d;
}

// ---- gelir (hak kazanma) ---------------------------------------------------------------
// Dönemi bitmiş (bd < şimdiki dağıtım) alımların hak kazandığı A: bd'den sonraki ilk dağıtımın sonrası.
// Geçmiş kırpılmışsa ve o dağıtım artık listede yoksa (≥ ACC_HIST_LEN dağıtım boyunca işlem yapılmamış)
// alımdaki A (ba) kullanılır: oyuncu en fazla atlaması gereken o tek günün payını alır, gelir KAYBOLMAZ.
export function accAfter(co, bd, fallback) {
  const h = co.aH;
  if (!h.length) return fallback;
  if (h[0][0] > bd && h.length >= BORSA_ACC_HIST_LEN) return fallback;
  for (const [d, a] of h) if (d > bd) return a;
  return fallback;
}
const periodOpen = (hold, distDay) => hold.b > 0 && hold.bd === distDay;
// Biriken gelir × Q (henüz toplanmamış, vergisiz)
export function pendingQ(hold, co, distDay) {
  const elig = BigInt(Math.max(0, hold.u - hold.b));
  let q = hold.pq + elig * bmax0(co.A - hold.a);
  if (hold.b > 0 && !periodOpen(hold, distDay)) {
    const from = accAfter(co, hold.bd, hold.ba ?? hold.a);
    q += BigInt(hold.b) * bmax0(co.A - from);
  }
  return q;
}
export const pendingOf = (hold, co, distDay) => toSafe(pendingQ(hold, co, distDay) / BORSA_Q);
// Hesaplaşma: biriken gelir pq'ye geçer, a güncel A olur; dönemi biten alımlar artık hak kazanmıştır
export function settle(hold, co, distDay) {
  const out = { ...hold, pq: pendingQ(hold, co, distDay), a: co.A };
  if (out.b > 0 && !periodOpen(hold, distDay)) {
    out.b = 0;
    out.bd = null;
    out.ba = null;
  }
  return out;
}
export function pendingAll(player, market) {
  const by = {};
  let total = 0;
  const dd = market?.distDay ?? null;
  for (const id of BORSA_CO_IDS) {
    const v = pendingOf(holdState(player, id), coState(market, id), dd);
    if (v > 0) {
      by[id] = v;
      total += v;
    }
  }
  return { by, total };
}

// ---- piyasa kâr/zararı (v185) -------------------------------------------------------
// Değer fiyatı: 1000 × S (hisse başı). Kendi alış-satışım değeri oynatmaz, sadece piyasa hareketi.
const valueOf = (coU) => int(coU) / 1000;
const refOf = (hold) => (hold.r != null ? hold.r : hold.u > 0 ? hold.c / sharesOf(hold.u) : 0);
export function marketGain(hold, coU) {
  if (!hold || int(hold.u) <= 0) return 0;
  return Math.round(Math.trunc(num(hold.g)) + sharesOf(hold.u) * (valueOf(coU) - refOf(hold)));
}
export function rebase(hold, coU, nextU, nextCoU) {
  if (nextU <= 0) {
    const { r: _r, g: _g, ...rest } = hold;
    return { ...rest, u: 0 };
  }
  let g = marketGain(hold, coU);
  if (hold.u > 0 && nextU < hold.u) g = Math.round((g * nextU) / hold.u); // satılan payın kâr/zararı gider
  return { ...hold, u: nextU, r: Math.floor(valueOf(nextCoU)), g };
}
export function marketGainAll(player, market) {
  let gain = 0;
  let base = 0;
  for (const id of BORSA_CO_IDS) {
    const h = holdState(player, id);
    if (h.u <= 0) continue;
    gain += marketGain(h, coState(market, id).u);
    base += sharesOf(h.u) * refOf(h) - Math.trunc(num(h.g));
  }
  return { gain, pct: base > 0 ? (gain / base) * 100 : null };
}

// Toplama: vergi (o günün oranı) + borç varsa vergiden sonra kalanın yarısı borca
export function splitCollect(gross, taxFrac, debt) {
  const g = int(gross);
  const tax = Math.min(g, Math.round(g * Math.max(0, num(taxFrac))));
  const net = g - tax;
  const d = int(debt);
  const toDebt = d > 0 ? Math.min(d, Math.floor(net / 2)) : 0;
  return { gross: g, tax, net, toDebt, pay: net - toDebt };
}
// 24 saat önceye göre % değişim (ch: saat başı noktalar; cur: şimdiki değer)
export function change24h(ch, cur) {
  const pts = Array.isArray(ch) ? ch : [];
  if (pts.length < 25) return null;
  const prev = num(pts[pts.length - 25]);
  if (prev <= 0) return cur > 0 ? null : 0;
  return ((num(cur) - prev) / prev) * 100;
}
export const avgIncome = (inc) => (inc?.length ? inc.reduce((a, b) => a + num(b), 0) / inc.length : 0);
// v189: hisse başına son 10 günlük ortalama gelir (liste ve sıralama)
export const avgPerShare = (co) => avgIncome(co?.ps);
export function sortCos(market) {
  return [...BORSA_COS].sort((a, b) => avgPerShare(coState(market, b.id)) - avgPerShare(coState(market, a.id)) || a.name.localeCompare(b.name, 'tr'));
}
// Elindeki birimlerin hepsini satarsan eline geçecek (komisyon düşülmüş)
export const sellAllValue = (holdU, coU) => (int(holdU) > 0 ? sellQuote(coU, Math.min(int(holdU), int(coU))).net : 0);

// ---- butonlar (detay ekranı) -------------------------------------------------------
// Alım: birim kadar; alım sınırına (buyRoom) az kaldıysa sınıra kadar. Satış: birim kadar; elinde daha
// azsa elindekinin hepsi. x: 0 → buton pasif.
export function buyAmount(holdU, step, coU = Infinity) {
  return Math.max(0, Math.min(int(step), coU === Infinity ? int(step) : buyRoom(holdU, coU)));
}
export const sellAmount = (holdU, step) => Math.min(int(step), int(holdU));
export function tradeButtons(coU, holdU) {
  const step = stepUnits(coU);
  const out = {};
  for (const [k, s] of [
    ['small', step],
    ['big', step * 10],
  ]) {
    const bx = buyAmount(holdU, s, coU);
    const sx = sellAmount(holdU, s);
    out[k] = {
      buy: { x: bx, ...(bx > 0 ? buyQuote(coU, bx) : { base: 0, kom: 0, total: 0 }) },
      sell: { x: sx, ...(sx > 0 ? sellQuote(coU, sx) : { base: 0, kom: 0, net: 0 }) },
    };
  }
  return { step, ...out };
}

// v189: canlı fiyat (RTDB borsaFiyat: { <mekân>: u }) piyasa belgesinin üstüne yazılır. Eski (v1) belge
// de yeni biçime çevrilerek döner (ekran tek biçimle çalışır). live yoksa belge aynen (çevrilmiş) döner.
export function withLive(market, live) {
  if (!market && !live) return market;
  const out = { ...(market || {}), v: BORSA_MARKET_V, co: {} };
  for (const id of BORSA_CO_IDS) {
    const d = coDoc(coState(market, id));
    const lu = live?.[id];
    if (Number.isSafeInteger(lu) && lu >= 0) d.u = lu;
    out.co[id] = d;
  }
  return out;
}

// 20 gün kuralı (v189): son borsa işlemi ve son oyuna giriş, ikisi de 20 günden eskiyse satılır
export const idleCutoff = (t) => t - BORSA_IDLE_DAYS * 86_400_000;
export function idleStep(user, lastSeenMs, t) {
  const son = Number(user?.borsaSon);
  if (!Number.isFinite(son) || son <= 0) return null;
  const last = Math.max(son, Number(lastSeenMs) || 0);
  return last < idleCutoff(t) ? 'sell' : null;
}

// Hesap silme / tasfiye: oyuncunun tüm birimleri havuza döner (piyasa yaması, işlem içinde kullanılır)
export function releaseMarket(user, market) {
  const dd = market?.distDay ?? null;
  const out = {};
  let units = 0;
  for (const id of BORSA_CO_IDS) {
    const h = holdState(user, id);
    if (!h.u) continue;
    const co = coState(market, id);
    const fromB = periodOpen(h, dd) && co.btd === dd ? Math.min(h.b, co.bt) : 0;
    out[id] = { ...co, u: Math.max(0, co.u - h.u), h: Math.max(0, co.h - 1), bt: co.bt - fromB };
    units += h.u;
  }
  return { cos: out, units };
}

// =============================================================================
// Sunucu
// =============================================================================
// deps: { db, FieldValue, HttpsError, goldTag, stateWrite, taxFrac: () => oran (0..1),
//         dayKey(ms), addDayKey(k, n), now, rtdb?: async () => admin RTDB (canlı fiyat yayını) }
export function createBorsa({ db, FieldValue, HttpsError, goldTag, stateWrite, taxFrac, dayKey, addDayKey, now = () => Date.now(), log = console, rtdb = null }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const marketRef = () => db.doc(BORSA_DOC);
  const userRef = (uid) => db.collection('users').doc(uid);
  const metaRef = (uid) => db.doc(`users/${uid}/private/meta`);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const hasAny = (player, over = {}) =>
    BORSA_CO_IDS.some((id) => {
      const h = over[id] || holdState(player, id);
      return h.u > 0 || h.pq >= BORSA_Q;
    });
  // Piyasa yazımı: eski biçimse önce tüm belge çevrilir (tek seferlik), sonra değişen mekânlar
  const marketWrite = (tx, market, cos, extra = {}) => {
    const patch = isV2Market(market) ? { co: {} } : marketMigrationPatch(market, FieldValue);
    for (const [id, co] of Object.entries(cos)) patch.co[id] = { ...(patch.co[id] || {}), ...coDoc(co) };
    tx.set(marketRef(), { ...patch, ...extra }, { merge: true });
  };
  const holdWrite = (u, id, h) => {
    u[`borsa.${id}`] = h.u > 0 || h.pq >= BORSA_Q ? holdDoc(h) : FieldValue.delete(); // hissesiz < 1 altın küsurat tutulmaz
  };
  // v189: her işlemden sonra canlı fiyat (S) RTDB'ye; hata işlemi bozmaz
  async function publish(map) {
    if (!rtdb || !map || !Object.keys(map).length) return;
    try {
      const r = await rtdb();
      await r.ref(BORSA_RTDB_PATH).update(map);
    } catch (err) {
      log.error?.('borsa fiyat yayını', err?.message || err);
    }
  }
  const unitsArg = (v, def) => {
    if (v == null) return def;
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n <= 0) fail('invalid-argument', 'Geçersiz miktar.');
    return n;
  };
  const rateCheck = (user, t) => {
    const son = Number(user?.borsaSon) || 0;
    if (son && t >= son && t - son < BORSA_RATE_MS) fail('resource-exhausted', 'Çok hızlı — saniyede en fazla 1 borsa işlemi.');
  };
  const price = (fn) => {
    try {
      return fn();
    } catch {
      return fail('failed-precondition', 'Tutar çok büyük.');
    }
  };

  // ---- Al / Sat ---------------------------------------------------------------
  // data: { op: 'al'|'sat', co, x? (birim; yoksa 1 hisse — eski istemci), all? (sat: elindekinin
  //         hepsi), expect? (ekranda yazan tutar: alışta bundan pahalıysa, satışta bundan azsa yapılmaz) }
  async function trade(uid, data) {
    const id = data?.co;
    const op = data?.op;
    if (!isBorsaCo(id)) fail('invalid-argument', 'Geçersiz mekân.');
    if (op !== 'al' && op !== 'sat') fail('invalid-argument', 'Geçersiz işlem.');
    const want = data?.all ? null : unitsArg(data?.x, BORSA_UNITS);
    const t = now();
    const res = await db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      rateCheck(user, t);
      const market = mSnap.data() || {};
      const dd = market.distDay ?? null;
      const co = coState(market, id);
      const was = holdState(user, id);
      let hold = settle(was, co, dd);
      const u = { borsaSon: t };
      if (user.borsaUyari) u.borsaUyari = FieldValue.delete(); // v185 alanı artık kullanılmıyor
      const next = { ...co };
      let x;
      let paid;
      if (op === 'al') {
        const room = buyRoom(hold.u, co.u); // v193
        if (room <= 0) fail('failed-precondition', 'Alım sınırı');
        x = Math.min(want, room);
        const q = price(() => buyQuote(co.u, x));
        if (data?.expect != null && q.total > Number(data.expect)) fail('aborted', `price-changed:${q.total}`);
        if ((user.gold || 0) < q.total) fail('failed-precondition', 'Yetersiz altın.');
        paid = q.total;
        u.gold = FieldValue.increment(-q.total);
        u.goldTag = goldTag('borsa', { borsaKom: -q.kom });
        const nb = periodOpen(hold, dd) ? hold.b + x : x; // bu dönem alınanlar bir sonraki dağıtımı atlar
        hold = { ...rebase(hold, co.u, hold.u + x, co.u + x), c: hold.c + q.base, b: nb, bd: dd, ba: co.A };
        next.u = co.u + x;
        next.h = co.h + (was.u === 0 ? 1 : 0);
        next.bt = (co.btd === dd ? co.bt : 0) + x;
        next.btd = dd;
      } else {
        if (hold.u <= 0) fail('failed-precondition', 'Bu mekânda hissen yok.');
        x = Math.min(want ?? hold.u, hold.u, co.u);
        const q = price(() => sellQuote(co.u, x));
        if (data?.expect != null && q.net < Number(data.expect)) fail('aborted', `price-changed:${q.net}`);
        paid = q.net;
        const costPart = Number((BigInt(hold.c) * BigInt(x)) / BigInt(hold.u)); // satılan payın maliyeti
        u.gold = FieldValue.increment(q.net);
        u.goldTag = goldTag('borsa', { borsaKz: q.base - costPart, borsaKom: -q.kom });
        // satışta önce bu dönem alınan (pay almayacak) birimler düşülür
        const fromB = periodOpen(hold, dd) ? Math.min(hold.b, x) : 0;
        const left = hold.u - x;
        hold = { ...rebase(hold, co.u, left, co.u - x), c: left > 0 ? hold.c - costPart : 0, b: hold.b - fromB };
        if (hold.b <= 0) Object.assign(hold, { b: 0, bd: null, ba: null });
        next.u = co.u - x;
        next.h = Math.max(0, co.h - (left === 0 ? 1 : 0));
        next.bt = co.btd === dd ? Math.max(0, co.bt - fromB) : 0;
        next.btd = dd;
      }
      holdWrite(u, id, hold);
      if (!hasAny(user, { [id]: hold })) u.borsaSon = FieldValue.delete();
      tx.update(userRef(uid), u);
      marketWrite(tx, market, { [id]: next }, { updatedAtMs: t });
      return { ok: true, op, co: id, x, price: paid, u: hold.u, coU: next.u };
    });
    await publish({ [id]: res.coU });
    return res;
  }

  // ---- Hisselerim › Hepsini sat (tüm mekânlar, onaylı) -------------------------
  // Biriken gelir silinmez (sonra toplanır). expect: ekranda gösterilen toplam; değiştiyse satış olmaz.
  async function sellAll(uid, data) {
    const t = now();
    const res = await db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      rateCheck(user, t);
      const market = mSnap.data() || {};
      const dd = market.distDay ?? null;
      const u = {};
      const cos = {};
      let total = 0;
      let kz = 0;
      let kom = 0;
      let units = 0;
      const after = {};
      for (const id of BORSA_CO_IDS) {
        const co = coState(market, id);
        const hold = settle(holdState(user, id), co, dd);
        if (hold.u <= 0) continue;
        const x = Math.min(hold.u, co.u);
        const q = price(() => sellQuote(co.u, x));
        total += q.net;
        kz += q.base - hold.c;
        kom += q.kom;
        units += hold.u;
        const fromB = periodOpen(hold, dd) ? hold.b : 0;
        cos[id] = { ...co, u: co.u - x, h: Math.max(0, co.h - 1), bt: co.btd === dd ? Math.max(0, co.bt - fromB) : 0, btd: dd };
        const left = { ...rebase(hold, co.u, 0, 0), c: 0, b: 0, bd: null, ba: null };
        after[id] = left;
        holdWrite(u, id, left);
      }
      if (!units) fail('failed-precondition', 'Satılacak hissen yok.');
      if (data?.expect != null && Number(data.expect) !== total) fail('aborted', `price-changed:${total}`);
      u.gold = FieldValue.increment(total);
      u.goldTag = goldTag('borsa', { borsaKz: kz, borsaKom: -kom });
      u.borsaSon = hasAny(user, after) ? t : FieldValue.delete();
      if (user.borsaUyari) u.borsaUyari = FieldValue.delete();
      tx.update(userRef(uid), u);
      marketWrite(tx, market, cos, { updatedAtMs: t });
      return { ok: true, op: 'satHepsi', total, units, shares: sharesOf(units), cos: Object.fromEntries(Object.entries(cos).map(([k, c]) => [k, c.u])) };
    });
    await publish(res.cos);
    delete res.cos;
    return res;
  }

  // ---- Gelirleri topla ------------------------------------------------------
  async function collect(uid) {
    const t = now();
    const day = dayKey(t);
    return db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      rateCheck(user, t);
      const market = mSnap.data() || {};
      const dd = market.distDay ?? null;
      const by = {};
      let total = 0;
      const after = {};
      for (const id of BORSA_CO_IDS) {
        const h0 = holdState(user, id);
        if (!h0.u && !h0.pq) continue;
        const h = settle(h0, coState(market, id), dd);
        const g = toSafe(h.pq / BORSA_Q);
        if (g > 0) {
          by[id] = g;
          total += g;
        }
        after[id] = { ...h, pq: h.pq - BigInt(g) * BORSA_Q }; // küsurat kalır, kaybolmaz
      }
      if (total <= 0) fail('failed-precondition', 'Toplanacak gelir yok.');
      const r = splitCollect(total, collectTaxFrac(by, taxFrac(day)), user.debtToState); // v201: her hissede vergi
      const u = { gold: FieldValue.increment(r.pay), goldTag: goldTag('borsaGelir'), borsaSon: t };
      if (user.borsaUyari) u.borsaUyari = FieldValue.delete();
      if (r.toDebt) u.debtToState = FieldValue.increment(-r.toDebt);
      for (const [id, h] of Object.entries(after)) u[`borsa.${id}`] = h.u > 0 ? holdDoc(h) : FieldValue.delete(); // hissesiz küsurat (< 1 altın) silinir
      if (!BORSA_CO_IDS.some((id) => (after[id] || holdState(user, id)).u > 0)) u.borsaSon = FieldValue.delete();
      tx.update(userRef(uid), u);
      stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'vergi_hisse', amount: r.tax, atMs: t, dayKey: day, stat: { bs_topla_n: 1, bs_brut: r.gross } });
      return { ok: true, ...r, by };
    });
  }

  // ---- Gece: bir günün gelirini dağıt ---------------------------------------
  async function incomesOf(day) {
    const snap = await db.collection('stateLedger').where('dayKey', '==', day).get();
    const out = Object.fromEntries(BORSA_CO_IDS.map((id) => [id, 0]));
    snap.docs.forEach((d) => {
      const st = d.data()?.stat || {};
      for (const c of BORSA_COS) out[c.id] += int(st[borsaIncomeStatKey(c.sk)]);
    });
    return out;
  }
  // İlk açılış: son 10 günün eski seyyar cirosu (sy_<kod>_ciro) ortalama için tohumlanır
  async function seedIncomes(today) {
    const from = addDayKey(today, -BORSA_INC_LEN);
    const snap = await db.collection('stateDays').where('dayKey', '>=', from).get();
    const days = snap.docs
      .map((d) => d.data())
      .filter((d) => d.dayKey < today)
      .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1))
      .slice(-BORSA_INC_LEN);
    const inc = Object.fromEntries(BORSA_CO_IDS.map((id) => [id, []]));
    days.forEach((d) => BORSA_COS.forEach((c) => inc[c.id].push(int(d.stat?.[`sy_${c.sk}_ciro`]))));
    return inc;
  }

  // Saat başı (cronTick): grafik noktası + (gerekirse) biten günlerin dağıtımı + 20 gün kuralı.
  // Dağıtım kaçırılan günleri de (en çok 7) sırayla yapar; distDay ile iki kez yapılmaz.
  async function hourly() {
    const t = now();
    const today = dayKey(t);
    const yday = addDayKey(today, -1);
    const hourKey = `${today}T${String(new Date(t + 3 * 3600_000).getUTCHours()).padStart(2, '0')}`;
    const pre = (await marketRef().get()).data() || null;
    const init = !pre?.distDay;
    const seeds = init ? await seedIncomes(today).catch(() => null) : null;
    const dues = [];
    if (!init) for (let d = addDayKey(pre.distDay, 1); d <= yday && dues.length < 7; d = addDayKey(d, 1)) dues.push(d);
    if (!init && dues.length && dues[dues.length - 1] < yday) dues.push(yday); // 7 günden eski kaçırılanlar atlanır
    const incomes = {};
    for (const d of dues) incomes[d] = await incomesOf(d);
    const res = await db.runTransaction(async (tx) => {
      const mSnap = await tx.get(marketRef());
      const market = mSnap.data() || null;
      const out = { distributed: [], unowned: {}, chart: false, init: false, migrated: false, cos: {} };
      const nowInit = !market?.distDay;
      const doDist = !nowInit && dues.length > 0 && market.distDay === pre?.distDay;
      const migrate = Boolean(market) && !isV2Market(market);
      const extra = { updatedAtMs: t };
      if (nowInit) {
        // ilk kurulum: bugünün geliri yarın (00:00'dan sonra) dağıtılır
        extra.distDay = yday;
        extra.startDay = today;
        out.init = true;
      }
      const prevDD = market?.distDay ?? null;
      const newDD = doDist ? dues[dues.length - 1] : nowInit ? yday : prevDD;
      const cos = {};
      for (const c of BORSA_COS) {
        const co = coState(market, c.id);
        const nx = { ...co };
        if (nowInit) {
          if (!co.inc.length) nx.inc = (seeds?.[c.id] || []).slice(-BORSA_INC_LEN);
          nx.bt = 0;
          nx.btd = newDD;
        }
        if (doDist) {
          // hak kazanmış birim: bu dönem alınanlar hariç
          const elig = co.u - (co.btd === prevDD ? Math.min(co.bt, co.u) : 0);
          let A = co.A;
          let inc = co.inc;
          let ps = co.ps;
          for (const d of dues) {
            const gross = int(incomes[d]?.[c.id]);
            if (elig > 0) A += (BigInt(gross) * BORSA_Q) / BigInt(elig);
            else if (gross > 0) out.unowned[d] = (out.unowned[d] || 0) + gross;
            inc = [...inc, gross].slice(-BORSA_INC_LEN);
            ps = [...ps, elig > 0 ? Math.floor((gross * BORSA_UNITS) / elig) : gross].slice(-BORSA_INC_LEN);
          }
          Object.assign(nx, { A, inc, ps, bt: 0, btd: newDD, aH: [...co.aH, [newDD, A]].slice(-BORSA_ACC_HIST_LEN) });
        }
        if (market?.chHour !== hourKey) {
          nx.ch = [...co.ch, chartPrice(co.u)].slice(-BORSA_CHART_LEN);
          out.chart = true;
        }
        cos[c.id] = nx;
        out.cos[c.id] = nx.u;
      }
      if (out.chart) extra.chHour = hourKey;
      if (doDist) {
        extra.distDay = newDD;
        out.distributed = dues;
        for (const [d, amt] of Object.entries(out.unowned)) stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'seyyar_sahipsiz', amount: amt, atMs: t, dayKey: d });
      }
      if (nowInit || doDist || out.chart || migrate) {
        marketWrite(tx, market || {}, cos, extra);
        out.migrated = migrate;
      }
      return out;
    });
    await publish(res.cos); // saatte bir tam liste (RTDB'deki yayın kendini düzeltir)
    delete res.cos;
    if (res.distributed.length) {
      log.log?.(`borsa: ${res.distributed.join(', ')} geliri dağıtıldı`);
      await sweepIdle().catch((err) => log.error?.('borsa 20 gün', err));
    }
    return res;
  }

  // ---- 20 gün kuralı (v189: 20 gün oyuna girmeyen) ---------------------------------
  // Maliyet: sorgu yalnızca hissesi / biriken geliri olan (borsaSon alanı olan) ve 20 gündür
  // borsada işlem yapmayanları getirir; her aday için oyuna giriş kaydı okunur (1 okuma).
  //  • 20 gün içinde oyuna girmişse borsaSon o giriş zamanına çekilir (1 yazma) → en az ~20 gün
  //    boyunca yeniden aday olmaz.
  //  • Girmemişse hisseleri satılır (işlem içinde giriş kaydı yeniden okunur).
  async function sweepIdle() {
    const t = now();
    const cutoff = idleCutoff(t);
    const snap = await db.collection('users').where('borsaSon', '<', cutoff).orderBy('borsaSon', 'asc').limit(200).get();
    let sold = 0;
    let bumped = 0;
    for (const d of snap.docs) {
      try {
        const seen = Number((await metaRef(d.id).get()).data()?.lastSeenAtMs) || 0;
        if (seen >= cutoff) {
          await db.runTransaction(async (tx) => {
            const s = await tx.get(userRef(d.id));
            const son = Number(s.data()?.borsaSon) || 0;
            if (!son || son >= seen) return;
            const up = { borsaSon: seen };
            if (s.data()?.borsaUyari) up.borsaUyari = FieldValue.delete();
            tx.update(userRef(d.id), up);
          });
          bumped++;
        } else if (await liquidate(d.id)) sold++;
      } catch (err) {
        log.error?.(`borsa 20 gün ${d.id}`, err);
      }
    }
    if (bumped) log.log?.(`borsa: ${bumped} oyuncu oyuna girmiş (20 gün sayacı ileri alındı)`);
    return sold;
  }
  async function liquidate(uid) {
    const t = now();
    const day = dayKey(t);
    const res = await db.runTransaction(async (tx) => {
      const [uSnap, mSnap, sSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef()), tx.get(metaRef(uid))]);
      const user = uSnap.data();
      if (!user || idleStep(user, sSnap.data()?.lastSeenAtMs, t) !== 'sell') return null;
      const market = mSnap.data() || {};
      const dd = market.distDay ?? null;
      const { total, by: pendBy } = pendingAll(user, market);
      // en değerli hisseden başlayarak sat
      const order = BORSA_CO_IDS.filter((id) => holdState(user, id).u > 0).sort((a, b) => coState(market, b).u - coState(market, a).u);
      let sale = 0;
      let kom = 0;
      let kz = 0;
      const cos = {};
      for (const id of order) {
        const h = holdState(user, id);
        const co = coState(market, id);
        const x = Math.min(h.u, co.u);
        const q = price(() => sellQuote(co.u, x));
        sale += q.net;
        kom += q.kom;
        kz += q.base - h.c;
        const fromB = periodOpen(h, dd) ? h.b : 0;
        cos[id] = { ...co, u: co.u - x, h: Math.max(0, co.h - 1), bt: co.btd === dd ? Math.max(0, co.bt - fromB) : 0, btd: dd };
      }
      const r = splitCollect(total, collectTaxFrac(pendBy, taxFrac(day)), user.debtToState); // v196
      const u = { borsa: FieldValue.delete(), borsaSon: FieldValue.delete(), borsaUyari: FieldValue.delete(), gold: FieldValue.increment(sale + r.pay), goldTag: goldTag('borsa', { borsaKz: kz, borsaKom: -kom, borsaGelir: r.pay }) };
      if (r.toDebt) u.debtToState = FieldValue.increment(-r.toDebt);
      tx.update(userRef(uid), u);
      if (order.length) marketWrite(tx, market, cos, { updatedAtMs: t });
      if (r.tax) stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'vergi_hisse', amount: r.tax, atMs: t, dayKey: day });
      const parts = [];
      if (order.length) parts.push(`hisselerin ${fmt(sale)} altına satıldı`);
      if (r.gross) parts.push(`biriken gelirin ${fmt(r.gross)} altından vergi (${fmt(r.tax)})${r.toDebt ? ` ve borç payı (${fmt(r.toDebt)})` : ''} düşülüp ${fmt(r.pay)} altın olarak yatırıldı`);
      tx.set(userRef(uid).collection('messages').doc(), {
        text: `📈 Neon Borsa: 20 gündür oyuna girmediğin için ${parts.join(', ')}. Toplam ${fmt(sale + r.pay)} altın hesabına geçti.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'borsa_tasfiye',
      });
      return { cos: Object.fromEntries(Object.entries(cos).map(([k, c]) => [k, c.u])) };
    });
    if (!res) return false;
    await publish(res.cos);
    return true;
  }

  // ---- Hesap silme: hisseler havuza döner -----------------------------------
  async function releaseForDeletion(uid) {
    const res = await db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user?.borsa) return { units: 0, cos: {} };
      const market = mSnap.data() || {};
      const { cos, units } = releaseMarket(user, market);
      tx.update(userRef(uid), { borsa: FieldValue.delete(), borsaSon: FieldValue.delete() });
      if (units) marketWrite(tx, market, cos, { updatedAtMs: now() });
      return { units, cos: Object.fromEntries(Object.entries(cos).map(([k, c]) => [k, c.u])) };
    });
    await publish(res.cos);
    return sharesOf(res.units);
  }

  return { trade, sellAll, collect, hourly, sweepIdle, liquidate, releaseForDeletion, incomesOf, publish };
}
