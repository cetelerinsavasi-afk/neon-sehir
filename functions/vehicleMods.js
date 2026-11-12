// =============================================================================
// v150 — ARAÇ MODİFİYESİ (sunucu + istemci ORTAK kurallar, saf JS — three.js yok)
//
//   • Her aracın fabrika (orijinal) hali: modDefaults(id)
//   • Kayıt: vehicles/{id}.mods = sadece orijinalden FARKLI alanlar (compactMods)
//   • Fiyat: aracın galeri fiyatının yüzdesi (ör. 100.000'lik arabada boya 1.000,
//     plaka 5.000). Taban 50 altın, 10'a yuvarlanır.
//   • Satın alınan tasarım saklanmaz: ŞU ANKİ halden farklı olan HER alan ücretlidir.
//     Sarı → beyaz boya ücretli; tekrar sarıya dönmek de yine ücretli (orijinale dönmek dahil).
//   • Modifiye sadece görünümdür — hız / yarış değerlerini etkilemez.
// v151 — ticari araçlar (tır, otobüs, taksi, polis, ambulans) ve motorlar da modifiye
//   edilir; her türün kendi alanları var (modProfile). Kurallar aynı.
// =============================================================================
import { VEHICLE_CATALOG } from './catalogData.js';

const CAR = {
  1: { cab: false, seats: 4, paint: '#121214', finish: 'parlak', rim: '#e8dcc0', rimStyle: 'tel', spokes: 14, caliper: '#c8141e', exhaust: 'tek', interior: '#5a3418' },
  2: { cab: true, seats: 4, paint: '#f2a51f', finish: 'parlak', rim: '#e2e2e6', rimStyle: 'kol', spokes: 5, caliper: '#c8141e', exhaust: 'tek', interior: '#1a1a1d' },
  3: { cab: true, seats: 4, paint: '#6e1424', finish: 'parlak', rim: '#e2e2e6', rimStyle: 'kol', spokes: 6, caliper: '#c8141e', exhaust: 'tek', interior: '#1a1a1d' },
  4: { cab: true, seats: 2, paint: '#e9651c', finish: 'parlak', rim: '#e2e2e6', rimStyle: 'kol', spokes: 5, caliper: '#c8141e', exhaust: 'tek', interior: '#1a1a1d' },
  5: { cab: true, seats: 4, paint: '#1745b5', finish: 'parlak', rim: '#e2e2e6', rimStyle: 'kol', spokes: 5, caliper: '#c8141e', exhaust: 'cift', interior: '#1a1a1d' },
  6: { cab: true, seats: 2, paint: '#121215', finish: 'parlak', rim: '#e2e2e6', rimStyle: 'kol', spokes: 6, caliper: '#c8141e', exhaust: 'cift', interior: '#1a1a1d' },
  7: { cab: true, seats: 2, paint: '#b9bdc6', finish: 'metalik', rim: '#e2e2e6', rimStyle: 'kol', spokes: 10, caliper: '#c8141e', exhaust: 'cift', interior: '#1a1a1d' },
  8: { cab: true, seats: 2, paint: '#f2f2ef', finish: 'parlak', rim: '#1a1a1c', rimStyle: 'kol', spokes: 10, caliper: '#f2c400', exhaust: 'tek', interior: '#1a1a1d' },
  9: { cab: true, seats: 1, paint: '#f4f4f2', finish: 'parlak', rim: '#1b1b1d', rimStyle: 'kol', spokes: 6, caliper: '#c8141e', exhaust: 'cift', interior: '#1a1a1d' },
  10: { cab: false, seats: 2, paint: '#26339a', finish: 'parlak', rim: '#e2e2e6', rimStyle: 'kol', spokes: 5, caliper: '#c8141e', exhaust: 'cift', interior: '#1a1a1d' },
};
// v151: ticari / motor → modifiye profili
const PROFILE = { 11: 'truck', 12: 'bus', 13: 'taxi', 14: 'police', 15: 'ambulance', 21: 'moto', 22: 'moto', 23: 'moto', 24: 'moto', 25: 'moto', 26: 'moto' };
export const MOTO_KEY = { 21: 'scooter', 22: 'cross', 23: 'chopper', 24: 'sport', 25: 'bisiklet', 26: 'at' };
const MOTO_PAINT = { 21: '#e8e2d0', 22: '#f2a51f', 23: '#121214', 24: '#c8141e', 25: '#1f8fe0', 26: '#7a4a2a' };
export const modProfile = (id) => PROFILE[Number(id)] || 'car';

export const MOD_ACC_KEYS = ['spoiler', 'scoop', 'skirts', 'bullbar', 'rack', 'fog', 'neon'];
export const DEFAULT_PLATE = '34 NŞ 777';

// Seçenekler (modifiye ekranı + doğrulama)
export const MOD_OPTIONS = {
  paint: ['#121214', '#f4f4f2', '#b9bdc6', '#5b6270', '#c8141e', '#6e1424', '#e9651c', '#f6c400', '#3ad07a', '#0f5a3a', '#19a0d8', '#1745b5', '#16307a', '#8b5cf6', '#ff2e8c', '#19e8ff', '#6b4423', '#c9a26b', '#e8c26a', '#2f3a2a', '#ffb1c8', '#a0e7e5', '#3c1f5c'],
  rim: ['#e2e2e6', '#1a1a1c', '#5b6270', '#c9a227', '#c8141e', '#19e8ff', '#ff2e8c', '#f4f4f2', '#3a5fa8', '#3ad07a', '#e9651c'],
  tire: ['#121212', '#f2f2f2', '#c8141e', '#1e5bff', '#ff2e8c', '#d7ff1e', '#ff9900', '#8b5cf6'],
  caliper: ['#c8141e', '#f2c400', '#1e5bff', '#3ad07a', '#ff2e8c', '#1a1a1c', '#e9651c', '#f4f4f2'],
  interior: ['#1a1a1d', '#5a3418', '#a8323e', '#e8e2d0', '#1745b5', '#ff2e8c', '#3a5f3a', '#c9a26b'],
  neonColor: ['#ff2e8c', '#19e8ff', '#ffd23f', '#3ad07a', '#8b5cf6', '#ffffff', '#ff1010', '#ff9900'],
  helmet: ['#111318', '#f4f4f2', '#c8141e', '#f6c400', '#19e8ff', '#ff2e8c', '#3ad07a', '#8b5cf6'],
  helmetVisor: ['#19e8ff', '#ff2e8c', '#ffd23f', '#111318', '#c9a227', '#3ad07a'],
  jacket: ['#1f2533', '#121214', '#6b4423', '#c8141e', '#f4f4f2', '#1745b5', '#3a5f3a'],
  finish: [['parlak', 'Parlak'], ['metalik', 'Metalik'], ['mat', 'Mat'], ['sedef', 'Sedef'], ['krom', 'Krom']],
  livery: [['sivil', 'Yok'], ['yaris', '🏁 Yarış şeridi']],
  rimStyle: [['kol', 'Kollu'], ['kalin', 'Kalın kol'], ['agac', 'Ağ (BBS)'], ['disk', 'Disk'], ['tel', 'Tel (klasik)']],
  exhaust: [['tek', 'Tek'], ['cift', 'Çift'], ['dort', 'Dörtlü']],
  tint: [['seffaf', 'Şeffaf', 'İçerisi görünür'], ['hafif', 'Hafif film', 'Yarı görünür'], ['koyu', 'Koyu film', 'Görünmez']],
  roofCab: [['kapali', '🚘 Kapalı', 'Şeffaf camlı'], ['acik', '☀️ Üstü açık', 'Cabrio'], ['rollbar', '🛡️ Açık + roll-bar', 'Sportif']],
  roofOpen: [['acik', '☀️ Açık', 'Orijinal'], ['rollbar', '🛡️ Roll-bar', 'Sportif']],
  acc: [['spoiler', 'Spoiler', '🪽'], ['scoop', 'Kaput hava girişi', '🌬️'], ['skirts', 'Marşpiyel + lip', '▁'], ['bullbar', 'Ön koruma', '🛡️'], ['rack', 'Bagaj rafı', '🧳'], ['fog', 'Sis farı', '💡'], ['neon', 'Neon alt ışık', '🌈']],
  // v151 — ticari / motor
  taxiType: [['sari', '🚕 Sarı Taksi', 'Klasik'], ['turkuaz', '🚕 Turkuaz Taksi', 'Geniş, konforlu'], ['vip', '🚕 Siyah VIP', 'Şık']],
  polType: [['polis', '🚓 Polis Otosu', 'Lamba bar + POLİS yazısı'], ['sivil', '🚓 Sivil Polis', 'Koyu renk, gizli çakar'], ['pickup', '🚓 Polis Pickup', 'Arazi devriyesi']],
  ambType: [['van', '🚑 Ambulans (Panelvan)', 'Sedyeli'], ['car', '🚑 Acil Müdahale Aracı', 'Küçük ve çevik']],
  variant: [['otobus', '🚌 Şehir Otobüsü', '28 koltuk'], ['minibus', '🚐 Minibüs (Dolmuş)', '12 koltuk'], ['okul', '🚌 Okul Servisi', '20 koltuk'], ['turistik', '🚌 Turistik Açık Otobüs', '30 koltuk']],
  trailer: [['konteyner', 'Konteyner'], ['tenteli', 'Tenteli'], ['frigo', 'Frigorifik'], ['tanker', 'Tanker'], ['sal', 'Sal (Kereste)'], ['oto', 'Oto Taşıyıcı']],
};
export const TAXI_TYPES = {
  sari: { paint: '#f6c400', sign: '#f6c400', text: 'TAKSİ' },
  turkuaz: { paint: '#17b3a8', sign: '#17b3a8', text: 'TAKSİ' },
  vip: { paint: '#121214', sign: '#e8c26a', text: 'VIP TAKSİ' },
};
export const TRAILER_COLOR = { konteyner: '#1e6fb8', tenteli: '#2f8f4a', frigo: '#f4f4f2', tanker: '#d8dade', sal: '#3a3f4a', oto: '#3a3f4a' };
// türe göre takılabilen parçalar
const ACC_BY_PROFILE = {
  car: MOD_OPTIONS.acc,
  taxi: [['spoiler', 'Spoiler', '🪽'], ['skirts', 'Marşpiyel + lip', '▁'], ['fog', 'Sis farı', '💡'], ['neon', 'Neon alt ışık', '🌈']],
  police: [['bullbar', 'Ön koruma (itme demiri)', '🛡️'], ['fog', 'Sis farı', '💡'], ['spoiler', 'Spoiler', '🪽']],
  ambulance: [],
  bus: [['rack', 'Tavan bagajı', '🧳'], ['ladder', 'Arka merdiven', '🪜'], ['bikes', 'Bisiklet taşıyıcı', '🚲'], ['bullbar', 'Ön koruma', '🛡️'], ['beacon', 'Tepe lambası', '🟠'], ['neon', 'Neon alt ışık', '🌈']],
  truck: [['spoiler', 'Tavan spoyleri', '🪽'], ['sunvisor', 'Güneşlik', '🕶️'], ['horns', 'Krom korna', '📯'], ['stacks', 'Egzoz bacası', '🏭'], ['bullbar', 'Ön koruma', '🛡️'], ['lightbar', 'LED bar', '💡'], ['fog', 'Sis farı', '🔦'], ['beacon', 'Tepe lambası', '🟠'], ['neon', 'Neon alt ışık', '🌈']],
  moto: [['neon', 'Neon alt ışık', '🌈']],
};
export const accOptions = (id) => ACC_BY_PROFILE[modProfile(id)] || [];
const accKeys = (id) => accOptions(id).map((o) => o[0]);

const ENUMS = {
  finish: MOD_OPTIONS.finish.map((o) => o[0]),
  livery: MOD_OPTIONS.livery.map((o) => o[0]),
  rimStyle: MOD_OPTIONS.rimStyle.map((o) => o[0]),
  exhaust: MOD_OPTIONS.exhaust.map((o) => o[0]),
  tint: MOD_OPTIONS.tint.map((o) => o[0]),
  taxiType: MOD_OPTIONS.taxiType.map((o) => o[0]),
  polType: MOD_OPTIONS.polType.map((o) => o[0]),
  ambType: MOD_OPTIONS.ambType.map((o) => o[0]),
  variant: MOD_OPTIONS.variant.map((o) => o[0]),
  trailer: MOD_OPTIONS.trailer.map((o) => o[0]),
};
const HEX_KEYS = ['paint', 'rim', 'tire', 'caliper', 'interior', 'neonColor', 'accent', 'trailerColor', 'helmet', 'helmetVisor', 'jacket'];
export const MOD_RANGES = { spokes: [3, 16, 1], wheelScale: [0.9, 1.18, 0.02], ride: [-0.1, 0.3, 0.02] };

export const isCarId = (id) => Boolean(CAR[Number(id)]);
export const isModId = (id) => Boolean(CAR[Number(id)] || PROFILE[Number(id)]);
export const carHasCab = (id) => Boolean(CAR[Number(id)]?.cab);
export const roofOptions = (id) => (carHasCab(id) ? MOD_OPTIONS.roofCab : MOD_OPTIONS.roofOpen);

const wheelsOf = (c) => ({ rimStyle: c.rimStyle, spokes: c.spokes, rim: c.rim, tire: '#121212', caliper: c.caliper, letter: false, deep: false, wheelScale: 1, ride: 0 });
const accOff = (id, on = {}) => Object.fromEntries(accKeys(id).map((k) => [k, Boolean(on[k])]));

// Fabrika hali (sadece modifiye edilebilen alanlar)
export function modDefaults(id) {
  const n = Number(id);
  const prof = modProfile(n);
  if (prof === 'taxi') {
    const c = CAR[5];
    return { taxiType: 'sari', finish: 'parlak', tint: 'seffaf', interior: c.interior, ...wheelsOf(c), exhaust: c.exhaust, acc: accOff(n), neonColor: '#ff2e8c', plate: '34 T 0155' };
  }
  if (prof === 'police') {
    const c = CAR[5];
    return { polType: 'polis', ...wheelsOf(c), acc: accOff(n), plate: '34 A 1550' };
  }
  if (prof === 'ambulance') return { ambType: 'van', rim: '#c9ccd2', tire: '#121212', plate: '34 SB 112' };
  if (prof === 'bus') {
    return { variant: 'otobus', paint: '#19a0d8', accent: '#f4f4f2', finish: 'parlak', sign: '34 NŞ  LİMAN - MERKEZ', rim: '#c9ccd2', tire: '#121212', acc: accOff(n), neonColor: '#19e8ff', plate: '34 NŞ 155' };
  }
  if (prof === 'truck') {
    return { trailer: 'konteyner', trailerColor: TRAILER_COLOR.konteyner, company: 'NEON LOJİSTİK', paint: '#c8141e', finish: 'metalik', rim: '#c9ccd2', tire: '#121212', acc: accOff(n, { spoiler: true, sunvisor: true, horns: true, fog: true }), neonColor: '#19e8ff', plate: '34 TIR 34' };
  }
  if (prof === 'moto') {
    // sürücü oyuncunun kendi avatarı (kask / mont modifiyesi yok)
    return { paint: MOTO_PAINT[n] || '#c8141e', finish: 'parlak', acc: accOff(n), neonColor: '#ff2e8c', plate: '34 MT 34' };
  }
  const c = CAR[n] || CAR[1];
  return {
    paint: c.paint,
    finish: c.finish,
    livery: 'sivil',
    sideNo: '',
    roof: c.cab ? 'kapali' : 'acik',
    tint: 'seffaf',
    interior: c.interior,
    ...wheelsOf(c),
    exhaust: c.exhaust,
    acc: accOff(n),
    neonColor: '#ff2e8c',
    plate: DEFAULT_PLATE,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const clampStep = (v, [lo, hi, step]) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const k = Math.round((Math.min(hi, Math.max(lo, n)) - lo) / step);
  return Math.round((lo + k * step) * 1000) / 1000;
};
const upTr = (v) => String(v ?? '').toLocaleUpperCase('tr-TR');
export function cleanPlate(v, fallback = DEFAULT_PLATE) {
  const s = upTr(v)
    .replace(/[^0-9A-ZÇĞİÖŞÜ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 11)
    .trim();
  return s || fallback;
}
export const cleanSideNo = (v) => upTr(v).replace(/[^0-9A-Z]/g, '').slice(0, 3);
// otobüs güzergâh tabelası / tır firma adı
export const cleanSign = (v, max = 22) =>
  upTr(v)
    .replace(/[^0-9A-ZÇĞİÖŞÜ .\-&]/g, '')
    .replace(/\s{3,}/g, '  ')
    .slice(0, max);

// Gelen (kayıtlı ya da istenen) modifiyeyi fabrika haline uygular; geçersiz alanlar yok sayılır
export function sanitizeMods(id, input) {
  const out = modDefaults(id);
  const m = input && typeof input === 'object' ? input : {};
  for (const k of HEX_KEYS) if (k in out && HEX.test(String(m[k] || ''))) out[k] = String(m[k]).toLowerCase();
  for (const k of Object.keys(ENUMS)) if (k in out && ENUMS[k].includes(m[k])) out[k] = m[k];
  if ('roof' in out && roofOptions(id).some((o) => o[0] === m.roof)) out.roof = m.roof;
  for (const k of Object.keys(MOD_RANGES)) {
    if (!(k in out) || m[k] == null) continue;
    const v = clampStep(m[k], MOD_RANGES[k]);
    if (v != null) out[k] = k === 'spokes' ? Math.round(v) : v;
  }
  for (const k of ['letter', 'deep']) if (k in out && typeof m[k] === 'boolean') out[k] = m[k];
  if (out.acc && m.acc && typeof m.acc === 'object') Object.keys(out.acc).forEach((k) => typeof m.acc[k] === 'boolean' && (out.acc[k] = m.acc[k]));
  if (m.plate != null) out.plate = cleanPlate(m.plate, out.plate);
  if ('sideNo' in out && m.sideNo != null) out.sideNo = cleanSideNo(m.sideNo);
  if ('sign' in out && m.sign != null) out.sign = cleanSign(m.sign, 22) || out.sign;
  if ('company' in out && m.company != null) out.company = cleanSign(m.company, 16) || out.company;
  return out;
}

const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);
// Kayıt için: sadece fabrika halinden farklı alanlar (boş nesne = orijinal)
export function compactMods(id, cfg) {
  const d = modDefaults(id);
  const s = sanitizeMods(id, cfg);
  const out = {};
  for (const k of Object.keys(d)) {
    if (k === 'acc') {
      const acc = {};
      Object.keys(d.acc).forEach((a) => s.acc[a] !== d.acc[a] && (acc[a] = s.acc[a]));
      if (Object.keys(acc).length) out.acc = acc;
    } else if (!same(s[k], d[k])) out[k] = s[k];
  }
  return out;
}
export const modsKey = (id, mods) => `${Number(id) || 1}:${JSON.stringify(compactMods(id, mods))}`;

// İstemci çizimi: aracın tam çizim ayarına (vehicles.js defaultCarConfig) kayıtlı modifiyeyi uygula
export function applyVehicleMods(id, mods, base) {
  const s = sanitizeMods(id, mods);
  return { ...base, ...s, acc: { ...(base?.acc || {}), ...s.acc } };
}

// --- FİYAT (aracın galeri fiyatının yüzdesi) -------------------------------------------
const PCT = {
  // v151 türe özel "tip" seçimleri önce (faturada üstte)
  variant: 5,
  taxiType: 3,
  polType: 3,
  ambType: 3,
  trailer: 3,
  trailerColor: 1,
  company: 0.5,
  paint: 1,
  accent: 0.8,
  finish: { parlak: 0.5, metalik: 1, mat: 1.3, sedef: 4, krom: 8 },
  livery: { sivil: 0.5, yaris: 2 },
  sideNo: 0.2,
  sign: 0.2,
  roof: 2,
  tint: { seffaf: 0.4, hafif: 0.5, koyu: 1 },
  interior: 0.5,
  rimStyle: 1.7,
  spokes: 0.2,
  rim: 0.6,
  tire: 0.5,
  caliper: 0.3,
  letter: 0.3,
  deep: 1.2,
  wheelScale: 1.3,
  ride: 1.7,
  exhaust: { tek: 0.5, cift: 1, dort: 2 },
  helmet: 0.5,
  helmetVisor: 0.3,
  jacket: 0.5,
  neonColor: 0.5,
  plate: 5,
  acc: { spoiler: 2.3, scoop: 1.5, skirts: 1.7, bullbar: 1.2, rack: 1, fog: 0.6, neon: 2.7, ladder: 0.6, bikes: 0.6, beacon: 0.6, horns: 0.6, stacks: 1.2, lightbar: 1, sunvisor: 0.5 },
};
export const MOD_LABELS = {
  paint: 'Boya',
  finish: 'Yüzey',
  livery: 'Kaplama',
  sideNo: 'Kapı numarası',
  roof: 'Tavan',
  tint: 'Cam filmi',
  interior: 'İç döşeme',
  rimStyle: 'Jant tipi',
  spokes: 'Kol sayısı',
  rim: 'Jant rengi',
  tire: 'Lastik rengi',
  caliper: 'Kaliper',
  letter: 'Yazılı lastik',
  deep: 'Derin jant',
  wheelScale: 'Jant boyu',
  ride: 'Süspansiyon',
  exhaust: 'Egzoz',
  neonColor: 'Neon rengi',
  plate: 'Plaka',
  variant: 'Otobüs tipi',
  taxiType: 'Taksi tipi',
  polType: 'Araç tipi',
  ambType: 'Araç tipi',
  trailer: 'Dorse tipi',
  trailerColor: 'Dorse rengi',
  company: 'Firma adı',
  accent: 'Şerit rengi',
  sign: 'Güzergâh tabelası',
  helmet: 'Kask',
  helmetVisor: 'Vizör',
  jacket: 'Mont',
};
const ACC_LABEL = Object.fromEntries(Object.values(ACC_BY_PROFILE).flat().map(([k, l]) => [k, l]));
const carPrice = (id) => Number(VEHICLE_CATALOG[Number(id)]?.price || VEHICLE_CATALOG[1].price);
const priceOf = (id, pct) => Math.max(50, Math.round((carPrice(id) * pct) / 100 / 10) * 10);

// from → to arasındaki her değişiklik ayrı kalem (from: aracın ŞU ANKİ hali)
export function modCost(id, from, to) {
  const a = sanitizeMods(id, from);
  const b = sanitizeMods(id, to);
  const items = [];
  const prof = modProfile(id);
  for (const k of Object.keys(PCT)) {
    if (!(k in b)) continue;
    if (k === 'acc') {
      Object.keys(b.acc).forEach((x) => {
        if (a.acc[x] !== b.acc[x]) items.push({ key: `acc.${x}`, label: `${ACC_LABEL[x] || x}${b.acc[x] ? '' : ' (sök)'}`, price: priceOf(id, PCT.acc[x] ?? 1) });
      });
      continue;
    }
    if (k === 'neonColor' && !b.acc?.neon) continue; // neon kapalıyken rengi önemsiz
    if (k === 'tint' && prof === 'car' && b.roof !== 'kapali') continue; // açık tavanda cam filmi görünmez
    if (same(a[k], b[k])) continue;
    const p = PCT[k];
    const pct = typeof p === 'number' ? p : p[b[k]] ?? 0.5;
    items.push({ key: k, label: MOD_LABELS[k] || k, price: priceOf(id, pct) });
  }
  return { total: items.reduce((s, x) => s + x.price, 0), items };
}
