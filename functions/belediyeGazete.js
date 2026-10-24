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
import { RATE_ITEMS, fmtRate, isGoodChange, MINISTRIES } from './belediyeRates.js';

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
