// =============================================================================
// politicsGazete.js — v136 gazetede SEÇİM haberleri (saf; buildGazete çağırır)
// -----------------------------------------------------------------------------
// Seçim günlerinde gazetenin manşeti seçimdir (vergi manşeti habere iner):
//   Cuma      imza dönemi başladı
//   Cumartesi kimler 10 imzayı topladı / henüz kimse toplayamadı
//   Pazar     sandıklar açıldı (adaylar) · ya da seçim yapılamadı (ekip devam ediyor)
//   Pazartesi kazanan (oy, yüzde, rakipler; yeniden seçilme / kura)
// Cümleler her baskıda rastgele seçilir (rnd).
// =============================================================================
import { POLITICS, polAddDays, splitCandidates } from './politicsRules.js';

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? String(v[k]) : ''));
const nf = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const pct = (a, b) => (b > 0 ? `%${((a / b) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '%0');
const names = (list, max = 4) => {
  const n = list.slice(0, max).map((x) => x.name || 'Oyuncu');
  if (list.length > max) n.push(`${list.length - max} aday daha`);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} ve ${n[n.length - 1]}` : n[0] || '';
};

const T = {
  fri: [
    { t: 'Seçim Zamanı!', s: 'Belediye başkanlığı için adaylık ve imza dönemi başladı. Koltuğa göz diken öne çıksın.' },
    { t: 'Sandık Kokusu Geldi', s: 'Neon Şehir yeni başkanını arıyor: adaylık başvuruları açıldı.' },
    { t: 'Başkanlık Yarışı Başladı', s: 'Aday olmak isteyen belediyeye koşuyor; imzalar toplanmaya başladı.' },
    { t: 'Şehir Yeni Liderini Seçiyor', s: 'Adaylık ve imza dönemi bu gece başladı. Kim cesaret edecek?' },
  ],
  friSub: "Adaylık {fee} altın · {need} imza toplayan Pazar sandığa çıkar.",
  satSome: [
    { t: '{first} Sandık Yolunda!', s: '{list} {need} imzayı topladı. İmzalar Pazar 00:00\'a kadar sürüyor.' },
    { t: 'İmza Yarışında İlk Biletler Alındı', s: '{list} seçime katılmayı garantiledi.' },
    { t: 'Adaylar Belli Olmaya Başladı', s: '{list} {need} imzaya ulaştı; diğerleri son saatlere oynuyor.' },
  ],
  satNone: [
    { t: 'İmza Yarışı Kızışıyor', s: 'Henüz kimse {need} imzaya ulaşamadı. Adaylık başvuruları sürüyor.' },
    { t: 'Sandık Hâlâ Boş', s: '{need} imzayı toplayan aday yok. Başvurular Pazar 00:00\'a kadar açık.' },
    { t: 'Adaylar Kapı Kapı Dolaşıyor', s: 'İmzalar toplanıyor ama {need}\'a ulaşan çıkmadı. Başvurular devam ediyor.' },
  ],
  satEmpty: [
    { t: 'Başkanlığa Talip Yok mu?', s: 'Henüz kimse aday olmadı. Başvurular Pazar 00:00\'a kadar açık.' },
    { t: 'Adaylık Masası Boş', s: 'Şehirde kimse koltuğa aday olmadı. Son gün yarın.' },
  ],
  sun: [
    { t: 'Sandıklar Açıldı!', s: '{list} başkanlık için yarışıyor. Oylar bu akşam 21:00\'e kadar.' },
    { t: 'Neon Şehir Sandık Başında', s: 'Seçim başladı: {list}. Sayım 21:00\'de.' },
    { t: 'Karar Günü', s: '{list} halkın oyunu bekliyor. Oylar gizli, sayım akşam.' },
  ],
  sunOne: [
    { t: 'Tek Aday Sandıkta', s: '{list} tek başına yarışıyor. Oylar bu akşam 21:00\'e kadar.' },
    { t: 'Rakipsiz Seçim', s: 'Sadece {list} 10 imzayı toplayabildi. Sandık yine de kuruldu.' },
  ],
  failNoApp: [
    { t: 'Seçim Yapılamadı!', s: 'Hiç kimse aday olmadı.' },
    { t: 'Sandık Kurulamadı', s: 'Başkanlık için tek bir başvuru bile gelmedi.' },
  ],
  failNoQual: [
    { t: 'Seçim Yapılamadı!', s: 'Hiçbir aday {need} imzaya ulaşamadı.' },
    { t: 'İmzalar Yetmedi, Sandık Kurulmadı', s: 'Adaylar {need} imza barajını geçemedi.' },
  ],
  failGov: "{gov} ve ekibi göreve devam ediyor. Yeni başvurular Cuma 00:00'da.",
  failVacant: "Belediye başkansız kalmaya devam ediyor. Yeni başvurular Cuma 00:00'da.",
  won: [
    { t: 'Neon Şehir Yeni Başkanını Seçti: {w}', s: '{w}, {v} oyla ({p}) belediye başkanı oldu.' },
    { t: 'Sandıktan {w} Çıktı!', s: '{v} oyla ({p}) kazanan {w}, bu gece göreve başladı.' },
    { t: 'Şehir Kararını Verdi', s: 'Yeni başkan {w}: {v} oy ({p}).' },
  ],
  wonAlone: [
    { t: '{w} Belediye Başkanı Oldu', s: 'Tek aday {w} {v} oyla göreve başladı.' },
  ],
  reelected: [
    { t: '{w} Yeniden Seçildi!', s: 'Halk devam dedi: {v} oy ({p}).' },
    { t: 'Koltukta Yine {w}', s: '{w}, {v} oyla ({p}) yeni bir dönem kazandı.' },
  ],
  tie: 'Oylar eşit çıktı — kazanan kurayla belirlendi.',
  coupStart: [
    { t: 'Darbe Girişimi!', s: 'Polis harekete geçti: {code} kod adlı Emniyet Genel Müdürü hükümete karşı ayaklandı.' },
    { t: 'Şehirde Darbe Var!', s: '{code} hükümeti devirmek istiyor. Halk taraf seçiyor.' },
    { t: 'Belediyeye Karşı Ayaklanma', s: 'Emniyet {code} önderliğinde hükümete karşı çıktı. Şehir ikiye bölündü.' },
  ],
  coupWon: [
    { t: 'Darbe Başarılı, Hükümet Devrildi!', s: '{code} kazandı; belediye kadrosu görevden alındı.' },
    { t: 'Yönetim Düştü!', s: 'Halkın desteğini alan darbeciler hükümeti devirdi.' },
  ],
  coupLost: [
    { t: 'Darbe Bastırıldı!', s: 'Halk hükümetin yanında durdu; {code} görevden alındı.' },
    { t: 'Hükümet Ayakta Kaldı', s: 'Darbe girişimi başarısız oldu. Şehir yeniden sakin.' },
  ],
  coupRule: [
    { t: '{code} Devletin Başına Geçti', s: 'Darbeci Emniyet Genel Müdürü yönetimi devraldı.' },
    { t: 'Darbeci Yönetimde', s: '{code} şehri yönetmeye başladı.' },
  ],
  coupElection: [
    { t: 'Darbeci Erken Seçim Dedi', s: '{code} yönetimi almadı; sandık kurulacak.' },
    { t: 'Erken Seçim Kararı', s: 'Darbenin ardından şehir yeniden sandığa gidiyor.' },
  ],
  fell: [
    { t: 'Başkan İstifa Etti, Hükümet Düştü!', s: '{name} koltuğu bıraktı; tüm ekip görevden ayrıldı.' },
    { t: 'Belediyede Deprem: {name} Gitti', s: 'Başkan istifa etti, şehir başkansız kaldı.' },
  ],
};

const headline = (h, v) => ({ kind: 'secim', t: fill(h.t, v), s: fill(h.s, v), d: v.d || '' });

/**
 * Bugünün seçim haberi ya da null.
 *   state: politics/state (gece geçişlerinden SONRA) · cycle: politicsCycles/{F} (ya da null)
 * Dönüş: { headline: {kind:'secim', t, s, d}, items: [{t, d}] }
 */
export function politicsNews({ day, state, cycle, rnd = Math.random }) {
  if (!state) return null;
  const need = POLITICS.NEED;
  const last = state.last;
  if (last?.day === day) {
    if (last.outcome === 'won') {
      const v = { w: last.winnerName || 'Yeni başkan', v: nf(last.votes), p: pct(last.votes, last.total), need };
      const fin = Array.isArray(last.finalists) ? last.finalists : [];
      const set = last.reelected ? T.reelected : fin.length <= 1 ? T.wonAlone : T.won;
      const items = fin.slice(0, 5).map((f, i) => ({ t: `${i + 1}. ${f.name || 'Oyuncu'}`, d: `${nf(f.votes)} oy · ${pct(f.votes, last.total)}` }));
      return { headline: headline(pick(set, rnd), { ...v, d: last.tie ? T.tie : `Toplam ${nf(last.total)} oy kullanıldı.` }), items };
    }
    if (last.outcome === 'noApplicants' || last.outcome === 'noQualified') {
      const h = pick(last.outcome === 'noApplicants' ? T.failNoApp : T.failNoQual, rnd);
      const d = last.govName ? fill(T.failGov, { gov: last.govName }) : T.failVacant;
      return { headline: headline(h, { need, d }), items: [] };
    }
  }
  // v136 — DARBE haberleri
  const lc = state.lastCoup;
  if (lc?.decision && (lc.decisionTimeout ? lc.decisionDay === day : polAddDays(lc.decisionDay, 1) === day)) {
    const h = pick(lc.decision === 'rule' ? T.coupRule : T.coupElection, rnd);
    return { headline: headline(h, { code: lc.leaderCode || 'Darbeci', d: lc.decision === 'rule' ? 'Yeni yönetimin ilk 7 günü darbe yapılamaz.' : "Adaylık başvuruları Cuma 00:00'da başlıyor." }), items: [] };
  }
  if (lc?.day === day && ['started', 'won', 'lost'].includes(lc.outcome)) {
    const v = { code: lc.leaderCode || 'Darbeci', gov: lc.govName || 'hükümet', c: nf(lc.power?.coup), g: nf(lc.power?.gov) };
    if (lc.outcome === 'started') return { headline: headline(pick(T.coupStart, rnd), { ...v, d: '24 saat boyunca herkes tarafını seçecek · sonuç gece 00:00' }), items: [] };
    if (lc.outcome === 'won') return { headline: headline(pick(T.coupWon, rnd), { ...v, d: `Güçler: darbe ${v.c} · hükümet ${v.g}. Darbeci 24 saat içinde kararını verecek.` }), items: [] };
    return { headline: headline(pick(T.coupLost, rnd), { ...v, d: `Güçler: hükümet ${v.g} · darbe ${v.c}. Darbeci görevden alındı.` }), items: [] };
  }
  // v136: hükümet düştü (başkan istifası / darbe) — bir önceki günün olayı
  if (state.govFell?.day && polAddDays(state.govFell.day, 1) === day && state.govFell.reason === 'resign') {
    const h = pick(T.fell, rnd);
    return { headline: headline(h, { name: state.govFell.name || 'Başkan', d: "Yeni başkan seçimle gelecek: adaylık başvuruları Cuma 00:00'da." }), items: [] };
  }
  if (!state.cycle) return null;
  const c = state.cycle;
  const { full, pending } = splitCandidates(cycle?.cands);
  if (state.phase === 'signup' && day === c) {
    return { headline: headline(pick(T.fri, rnd), { d: fill(T.friSub, { fee: nf(POLITICS.FEE), need }) }), items: [] };
  }
  if (state.phase === 'signup' && day === polAddDays(c, 1)) {
    const v = { need, first: full[0]?.name || '', list: names(full) };
    const h = full.length ? pick(T.satSome, rnd) : pick(pending.length ? T.satNone : T.satEmpty, rnd);
    const items = [];
    if (pending.length) items.push({ t: `İmza bekleyen ${pending.length} aday`, d: pending.slice(0, 4).map((k) => `${k.name || 'Oyuncu'} ${k.sigs}/${need}`).join(' · ') });
    return { headline: headline(h, { ...v, d: full.length ? `${full.length} aday sandığa çıkmayı garantiledi.` : '' }), items };
  }
  if (['election', 'counting'].includes(state.phase) && day === polAddDays(c, 2)) {
    const fin = (cycle?.finalists || []).map((uid) => ({ uid, name: cycle?.cands?.[uid]?.name }));
    const v = { list: names(fin), need };
    return { headline: headline(pick(fin.length > 1 ? T.sun : T.sunOne, rnd), { ...v, d: 'Oylar gizli · sayım 21:00–24:00 · sonuç Pazartesi 00:00' }), items: [] };
  }
  return null;
}
