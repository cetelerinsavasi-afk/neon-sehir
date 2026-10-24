// =============================================================================
// belediyeGazete.js — v127 NEON ŞEHİR GAZETESİ (saf modül: metin + baskı içeriği)
// -----------------------------------------------------------------------------
// Her gece 00:00'da belediye bir sayı basar (functions/belediye.js buildGazete):
//   • manşet (günün değişikliklerine göre: eleştirel / abartılı / övgü / sakin)
//   • hükümetin değişiklikleri: göreve gelinceki seviye · dün · bugün + kısa yorum
//   • başkanlık köşesi (başkan / yardımcının bir gün önceden yazdığı tek yazı)
//   • halkın sesi (en çok beğenilen şikâyet)
//   • kasa özeti (dünün neti, maaşlar)
// Cümleler her baskıda rastgele seçilir (rnd verilebilir — test).
// =============================================================================
import { RATE_ITEMS, RATE_BY_ID, fmtRate, isGoodChange, MINISTRIES } from './belediyeRates.js';

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? String(v[k]) : ''));

const HEAD = {
  zam: [
    { t: 'Cepler Yanıyor!', s: 'Belediye bu gece {n} kaleme el attı; vatandaş hesap makinesine sarıldı.' },
    { t: 'Zam Fırtınası Şehri Vurdu', s: '{top} başta olmak üzere {n} kalemde yeni dönem başladı.' },
    { t: 'Kasaya Para Lazım!', s: 'Belediye vergileri yükseltti. Kahvehanelerde tek konu: {top}.' },
    { t: 'Neon Şehir Pahalandı', s: 'Gece yarısı imzalanan kararlar sabah cüzdanlara ulaştı.' },
    { t: 'Halk Şaşkın, Kasa Mutlu', s: '{top} için alınan karar şehirde dedikodu malzemesi oldu.' },
  ],
  indirim: [
    { t: 'Müjde! Vergiler İndi', s: '{n} kalemde rahatlama var. Esnaf bu sabah gülümsüyor.' },
    { t: 'Belediyeden Bayram Havası', s: '{top} ucuzladı; sokaklarda alkış sesleri duyuluyor.' },
    { t: 'Cüzdanlar Nefes Aldı', s: 'Gece yarısı gelen indirimler şehrin havasını değiştirdi.' },
    { t: 'Tarihi Karar: Yük Hafifledi', s: 'Belediye {n} kalemde kemerleri gevşetti. Ne kadar sürecek?' },
  ],
  karisik: [
    { t: 'Bir Elle Veren, Diğeriyle Alan Belediye', s: '{up} zam, {down} indirim. Hesabı tutturan kazanır.' },
    { t: 'Terazi Yeniden Ayarlandı', s: 'Kimine müjde, kimine fatura: {n} kalemde değişiklik.' },
    { t: 'Şehirde Yeni Denge', s: '{top} değişti; kazananlar da kaybedenler de konuşuyor.' },
  ],
  sakin: [
    { t: 'Şehirde Sakin Bir Sabah', s: 'Belediye bu gece fiyatlara dokunmadı. Fırtına öncesi sessizlik mi?' },
    { t: 'Değişiklik Yok, Nefesler Tutuldu', s: 'Vergiler yerinde sayıyor. Gözler belediye koridorlarında.' },
    { t: 'Belediyede Sessiz Gece', s: 'Hiçbir kalem değişmedi; muhalefet "uyuyorlar" diyor, kadro "planlıyoruz".' },
  ],
  // v127 (2): sadece küçük kalemler değişti (yayın, imam, piyango…)
  ufak: [
    { t: 'Şehirde Sakin Bir Sabah', s: 'Belediye bu gece büyük kararlar almadı; ayrıntılar belediyede.' },
    { t: 'Büyük Kararlar Rafta', s: 'Bu gece sadece ufak ayarlar yapıldı.' },
  ],
  maasYok: [
    { t: 'Kasa Boş, Maaşlar Ödenemedi!', s: 'Polis, imam ve belediye kadrosu bu gece eli boş yattı.' },
    { t: 'Belediyede Maaş Krizi', s: 'Kasada para yetmedi; bordro borç defterine yazıldı.' },
  ],
};

const COMMENT = {
  // gold: maaş, %: vergi. good: oyuncu lehine
  good: ['Halk bunu sevdi.', 'Esnafın yüzü güldü.', 'Sonunda beklenen adım.', 'Alkışlar belediyeye.', 'Kimse itiraz etmedi.'],
  bad: ['Cüzdanlar alarmda.', 'Kahvehanede tepki büyük.', 'Bu kararın faturası ağır.', 'Muhalefet ayakta.', 'Vatandaş homurdanıyor.'],
};

const SALARY_WORD = (it) => (it.unit === 'gold' ? 'maaşı' : 'vergisi');

// prev/cur/start: tam oran setleri. Dönüş: listede gösterilecek satırlar
export function gazeteRows({ start, prev, cur, rnd = Math.random }) {
  const rows = [];
  for (const it of RATE_ITEMS) {
    const s = Number(start?.[it.id] ?? cur[it.id]);
    const p = Number(prev?.[it.id] ?? cur[it.id]);
    const c = Number(cur[it.id]);
    if (s === c && p === c) continue;
    const d = c - p;
    const good = d === 0 ? isGoodChange(it.unit, it.id, c - s) : isGoodChange(it.unit, it.id, d);
    rows.push({
      id: it.id,
      label: it.label,
      m: it.m,
      unit: it.unit,
      start: s,
      prev: p,
      cur: c,
      today: d !== 0,
      good,
      note: d !== 0 ? pick(good ? COMMENT.good : COMMENT.bad, rnd) : null,
    });
  }
  // bugün değişenler önce
  return rows.sort((a, b) => Number(b.today) - Number(a.today));
}

export function gazeteHeadline({ rows, payrollUnpaid = false, rnd = Math.random }) {
  const todays = rows.filter((r) => r.today);
  if (payrollUnpaid) {
    const h = pick(HEAD.maasYok, rnd);
    return { kind: 'kriz', t: h.t, s: h.s };
  }
  const up = todays.filter((r) => !r.good).length;
  const down = todays.filter((r) => r.good).length;
  const top = todays[0] ? `${todays[0].label} ${SALARY_WORD(todays[0])}` : '';
  const kind = !todays.length ? 'sakin' : up && down ? 'karisik' : up ? 'zam' : 'indirim';
  const h = pick(HEAD[kind], rnd);
  const v = { n: todays.length, up, down, top: top.toLocaleLowerCase('tr-TR') };
  const sub = fill(h.s, v);
  return { kind, t: fill(h.t, v), s: sub.charAt(0).toLocaleUpperCase('tr-TR') + sub.slice(1) };
}

// Kasa köşesi: dünün neti
export function gazeteKasaLine(net, rnd = Math.random) {
  const n = Math.round(Number(net) || 0);
  const amt = Math.abs(n).toLocaleString('tr-TR');
  const pos = ['Belediye dün {a} altın kârla kapattı. Kasada bayram havası.', 'Dünün bilançosu artıda: +{a} altın. Hazine memnun.', 'Gelirler giderleri geçti: kasaya {a} altın girdi.'];
  const neg = ['Belediye dün {a} altın zarar etti. Kemerler sıkılacak mı?', 'Kasa dün {a} altın eridi; muhasebe alarmda.', 'Giderler gelirleri ezdi geçti: −{a} altın.'];
  const zero = ['Dün kasada kayda değer bir hareket olmadı.'];
  return fill(pick(n > 0 ? pos : n < 0 ? neg : zero, rnd), { a: amt });
}

export const MINISTRY_SHORT = Object.fromEntries(Object.values(MINISTRIES).map((m) => [m.id, m.short]));
export const fmtGazeteRate = (v, unit) => fmtRate(v, unit);

// =============================================================================
// v127 (2) — SADE GAZETE: sadece ÖNEMLİ konular. Bir manşet + altında birkaç
// önemli haber. Önemli: fabrika, işçi, işletme vergileri; polis ve belediye
// kadrosu maaşları. Yayın/şarkı, imam, piyango, 2. el, makine vb. haber olmaz.
// Puan: konu ağırlığı × kapsam (konudaki kalemlerin ne kadarı değişti) ×
// yön (hepsi aynı yöne → tam; karışık → zayıf) × büyüklük (ortalama % değişim).
// =============================================================================
const TOPICS = [
  { id: 'fabrika', unit: 'dilim', w: 5, ids: ['f1', 'f2', 'f3', 'f4'], name: (it) => `Fabrika vergisi (${it.label})` },
  { id: 'polis', unit: 'rütbe', w: 5, ids: ['polGenel', 'polAmir', 'polBaskom', 'polKomiser', 'polMemur'], name: (it) => `${it.label} maaşı` },
  { id: 'isletme', unit: 'işletme türü', w: 4, ids: ['isSilahci', 'isModifiye', 'isKumar', 'isSpor', 'isKafe', 'isBar', 'isInternet', 'isOfis'], name: (it) => `${it.label} vergisi` },
  { id: 'isci', unit: 'kalem', w: 4, ids: ['fisci'], name: () => 'İşçi maaş vergisi' },
  { id: 'kadro', unit: 'koltuk', w: 3, ids: ['bsk', 'byrd', 'bakan'], name: (it) => `${it.label} maaşı` },
];

const NEWS = {
  fabrika: {
    up: [
      { t: 'Fabrikalara Vergi Darbesi!', s: 'Sanayici bu sabah hesap makinesine sarıldı.' },
      { t: 'Bacalar Tütüyor, Vergi de Artıyor', s: 'Fabrika vergilerinde yeni dönem başladı.' },
    ],
    down: [
      { t: 'Sanayiciye Müjde: Vergi İndi', s: 'Fabrika sahipleri bu sabah gülümsüyor.' },
      { t: 'Fabrikalar Nefes Aldı', s: 'Belediye sanayinin yükünü hafifletti.' },
    ],
    mixed: [{ t: 'Fabrika Vergilerinde Yeni Denge', s: 'Kimi dilime zam, kimine indirim.' }],
  },
  polis: {
    up: [
      { t: 'Polise Toplu Zam!', s: 'Teşkilatta bayram havası, tüm rütbeler kazançlı.', all: true },
      { t: 'Emniyete Maaş Müjdesi', s: 'Belediye polisin cebini doldurdu.' },
    ],
    down: [
      { t: 'Polis Maaşlarına Kesinti!', s: 'Teşkilatta huzursuzluk büyüyor.' },
      { t: 'Emniyette Kemerler Sıkıldı', s: 'Belediye polis bordrosunu budadı.' },
    ],
    mixed: [{ t: 'Teşkilatta Maaş Ayarı', s: 'Kimi rütbe kazandı, kimi kaybetti.' }],
  },
  isletme: {
    up: [
      { t: 'Esnafa Vergi Zammı!', s: 'Dükkân sahipleri tezgâh başında homurdanıyor.' },
      { t: 'İşletmelere Yeni Fatura', s: 'Belediye esnafın kasasına göz dikti.' },
    ],
    down: [
      { t: 'Esnafa Vergi İndirimi', s: 'Dükkânlarda bu sabah çaylar belediyeden.' },
      { t: 'İşletmeler Rahatladı', s: 'Esnafın vergi yükü hafifledi.' },
    ],
    mixed: [{ t: 'İşletme Vergilerinde Karışık Tablo', s: 'Bazı esnaf kazandı, bazısı kaybetti.' }],
  },
  isci: {
    up: [{ t: 'İşçinin Maaşından Daha Çok Kesilecek', s: 'Fabrika işçisinin vergisi arttı.' }],
    down: [{ t: 'İşçiye Vergi Müjdesi', s: 'Fabrika işçisinin eline daha çok para geçecek.' }],
    mixed: [{ t: 'İşçi Vergisi Değişti', s: '' }],
  },
  kadro: {
    up: [
      { t: 'Belediye Kendi Maaşına Zam Yaptı!', s: 'Halk soruyor: kasa kimin için?' },
      { t: 'Koltuklar Isındı, Maaşlar Arttı', s: 'Belediye kadrosu kendine zam yaptı.' },
    ],
    down: [
      { t: 'Belediye Kendi Maaşını Kesti', s: 'Kadro kemeri önce kendinde sıktı.' },
      { t: 'Örnek Karar: Yönetim Maaşları İndi', s: 'Belediye tasarrufa kendinden başladı.' },
    ],
    mixed: [{ t: 'Belediye Kadrosunda Maaş Ayarı', s: '' }],
  },
};

const PLURAL = { dilim: 'dilimler', rütbe: 'rütbeler', 'işletme türü': 'işletmeler', kalem: 'kalemler', koltuk: 'koltuklar' };
const pctMove = (from, to) => (from > 0 ? Math.abs(to - from) / from : 1);

/** Önemli konular (puan sırasıyla). prev/cur: tam oran setleri. */
export function gazeteTopics(prev, cur) {
  const out = [];
  for (const tp of TOPICS) {
    const ch = tp.ids.map((id) => ({ id, it: RATE_BY_ID[id], from: Number(prev?.[id] ?? cur[id]), to: Number(cur[id]) })).filter((c) => c.it && c.from !== c.to);
    if (!ch.length) continue;
    const ups = ch.filter((c) => c.to > c.from).length;
    const dir = ups === ch.length ? 'up' : ups === 0 ? 'down' : 'mixed';
    const coverage = ch.length / tp.ids.length;
    const mag = ch.reduce((a, c) => a + pctMove(c.from, c.to), 0) / ch.length;
    const score = tp.w * (0.4 + 0.6 * coverage) * (dir === 'mixed' ? 0.35 : 1) * (1 + Math.min(1, mag * 3));
    // temsilci kalem: en büyük oransal değişim
    const rep = [...ch].sort((a, b) => pctMove(b.from, b.to) - pctMove(a.from, a.to))[0];
    const good = dir === 'mixed' ? null : isGoodChange(rep.it.unit, rep.id, rep.to - rep.from);
    out.push({ topic: tp.id, unit: tp.unit, dir, score, good, ch, rep, n: ch.length, all: ch.length === tp.ids.length, name: tp.name });
  }
  return out.sort((a, b) => b.score - a.score);
}

const line = (tp, c) => `${tp.name(c.it)}: ${c.it.unit === 'gold' ? Math.round(c.from).toLocaleString('tr-TR') : fmtRate(c.from, c.it.unit)} → ${fmtRate(c.to, c.it.unit)}`;
function detail(tp) {
  if (tp.dir === 'mixed') {
    const up = tp.ch.filter((c) => c.to > c.from).length;
    return `${up} ${tp.unit} zam, ${tp.n - up} ${tp.unit} indirim · ${line(tp, tp.rep)}`;
  }
  if (tp.n === 1) return line(tp, tp.rep);
  return `${tp.all ? `Tüm ${PLURAL[tp.unit] || tp.unit}` : `${tp.n} ${tp.unit}`}: ${tp.dir === 'up' ? 'artış' : 'düşüş'} · ${line(tp, tp.rep)}`;
}

/**
 * Gazetenin haberleri: { headline: {kind,t,s,d}, items: [{t,d,good}] }
 * kind: 'zam' (kötü, kırmızı) · 'indirim' (iyi, yeşil) · 'karisik' · 'sakin' · 'kriz'
 */
export function gazeteNews({ prev, cur, payrollUnpaid = false, rnd = Math.random, max = 4 }) {
  const topics = gazeteTopics(prev, cur);
  const story = (tp) => {
    const opts = NEWS[tp.topic][tp.dir].filter((x) => !x.all || tp.all);
    const h = pick(opts, rnd);
    return { t: h.t, s: h.s, d: detail(tp), good: tp.good, kind: tp.dir === 'mixed' ? 'karisik' : tp.good ? 'indirim' : 'zam' };
  };
  let headline;
  let rest = topics;
  if (payrollUnpaid) {
    const h = pick(HEAD.maasYok, rnd);
    headline = { kind: 'kriz', t: h.t, s: h.s, d: '' };
  } else if (topics.length) {
    const st = story(topics[0]);
    headline = { kind: st.kind, t: st.t, s: st.s, d: st.d };
    rest = topics.slice(1);
  } else {
    const any = RATE_ITEMS.some((it) => prev?.[it.id] != null && Number(prev[it.id]) !== Number(cur[it.id]));
    const h = pick(any ? HEAD.ufak : HEAD.sakin, rnd);
    headline = { kind: 'sakin', t: h.t, s: h.s, d: '' };
  }
  const items = rest.slice(0, max).map((tp) => {
    const st = story(tp);
    return { t: st.t, d: st.d, good: st.good };
  });
  return { headline, items };
}
