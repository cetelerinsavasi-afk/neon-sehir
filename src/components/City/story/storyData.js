// =============================================================================
// v168 — RIZA AMCA SENARYOSU: karakterler, replikler, görev sahneleri, yerler.
// Görevlerin sırası ve kimlikleri functions/onboardingData.js › ONBOARDING_ORDER ile BİREBİR aynı
// (ilerleme her zaman sunucuda; burası sadece hikâyenin sözleri ve yerleri).
// =============================================================================
import { ONBOARDING_ORDER } from '../../../../functions/onboardingData.js';
import { AMCA_ID, AMCA_CAR_ID, AMCA_AVATAR } from '../../../../functions/storyNpcs.js';

// Şehirdeki yerler: at = kapının önü (oyuncu buraya gelince "there" sözü), park = Amca'nın arabası
export const PLACES = {
  karakol: { at: { x: -55, z: -75 }, park: { x: -50, z: -60 }, name: 'Karakol' },
  fabrika: { at: { x: -23, z: -35 }, park: { x: -19, z: -20 }, name: 'Fabrika' },
  liman: { at: { x: -102, z: 86 }, park: { x: -96, z: 100 }, name: 'Liman & Depo' },
  park: { at: { x: 13, z: 8 }, park: { x: 10, z: 20 }, name: 'Park' },
  camii: { at: { x: -100, z: -35 }, park: { x: -96, z: -20 }, name: 'Camii' },
  silah: { at: { x: -100, z: 5 }, park: { x: -96, z: 20 }, name: 'Silahçı' },
  kofteci: { at: { x: -56, z: 58 }, park: { x: -52, z: 60 }, name: 'Köfteci' },
  kokorec: { at: { x: -90, z: 51 }, park: { x: -86, z: 60 }, name: 'Kokoreççi' },
  galeri: { at: { x: -60, z: -35 }, park: { x: -56, z: -20 }, name: 'Galeri' },
  pist: { at: { x: -21, z: 31 }, park: { x: -26, z: 20 }, name: 'Yarış Pisti' },
  banka: { at: { x: -15, z: -75 }, park: { x: -11, z: -60 }, name: 'Banka' },
  hurdalik: { at: { x: 266, z: 30 }, park: { x: 258, z: 30 }, name: 'Hurdalık' },
};
// Amca'nın mezarı: hurdalıkta, karargah kapılarının solundaki boşlukta (taş girişe bakar)
export const GRAVE = { x: 268.8, z: 53.5, ry: Math.PI + 0.2 };
// Amca'nın arabası şehre buradan girer (ilk karşılaşma)
export const AMCA_ARRIVE_FROM = { x: -112, z: -58 }; // karakola ~1 sokak (oyuncu uzun beklemesin)

const AV = (o) => ({
  eyeColor: '#2a2a2a', lipColor: '#9a5a50', earring: 'yok', tattoo: 'yok', neckAcc: 'none', hat: 'none', hatColor: '#0d0d0d', heldItem: 'yok', faceAcc: 'none',
  ...o,
});
export const AMCA = {
  id: AMCA_ID,
  name: 'Rıza Amca',
  carId: AMCA_CAR_ID, // oyunun en ucuz arabası
  avatar: AMCA_AVATAR, // fotoğraftaki görünüşle aynı (functions/storyNpcs.js)
};
export const AMCA_MID = { ...AMCA.avatar, mouthShape: 'neutral' }; // telefonda yüzü düşer
export const AMCA_DARK = { ...AMCA.avatar, mouthShape: 'thin', eyebrowShape: 'angled', eyeShape: 'narrow' }; // Nevzat aradıktan sonra
export const EMRE = {
  id: 'npc_emre',
  name: 'Emre',
  carId: 4,
  avatar: AV({ gender: 'erkek', build: 'standart', skin: '#c99068', eyeColor: '#3b2a1a', faceShape: 'oval', hairStyle: 'undercut', hairColor: '#2a1c12', eyebrowShape: 'thick', eyeShape: 'almond', noseShape: 'straight', mouthShape: 'smile', facialHair: 'short', clothing: 'leather', clothColor: '#7a1f1f', neckAcc: 'chain', pantsColor: '#22262f', shoeColor: '#f0f0f0', shoeStyle: 'spor', background: '#2a1414' }),
};
export const NEVZAT = {
  id: 'npc_kor_nevzat',
  name: 'Kör Nevzat',
  carId: 5,
  avatar: AV({ gender: 'erkek', build: 'standart', skin: '#d29a76', faceShape: 'long', hairStyle: 'kel', hairColor: '#222', eyebrowShape: 'angled', eyeShape: 'narrow', noseShape: 'straight', mouthShape: 'smirk', facialHair: 'goatee', faceAcc: 'eyepatch', clothing: 'suit', clothColor: '#15161a', neckAcc: 'chain', pantsColor: '#15161a', shoeColor: '#0d0d0d', shoeStyle: 'klasik', background: '#101014' }),
};
export const AKREPLER = [0, 1, 2, 3].map((e) => ({
  id: `npc_akrep_${e}`,
  name: 'Akrep',
  avatar: AV({ gender: 'erkek', build: e === 1 ? 'iri' : 'standart', skin: ['#c68863', '#a8704c', '#d8a07a', '#b88560'][e], faceShape: 'oval', hairStyle: ['short', 'undercut', 'kel', 'buzz'][e], hairColor: '#1b1612', eyebrowShape: 'thick', eyeShape: 'narrow', noseShape: 'wide', mouthShape: 'neutral', facialHair: ['short', 'none', 'full', 'goatee'][e], faceAcc: e === 0 ? 'sunglasses' : e === 3 ? 'scar' : 'none', tattoo: e === 2 ? 'boyunsembol' : 'yok', clothing: ['leather', 'hoodie', 'vest', 'leather'][e], clothColor: ['#1d1d1d', '#2a2a2a', '#3a1414', '#262018'][e], hat: e === 1 ? 'beanie' : 'none', hatColor: '#111', pantsColor: '#1a1a1a', shoeColor: '#0d0d0d', shoeStyle: 'bot', background: '#101014' }),
}));
export const POLISLER = [0, 1, 2, 3].map((e) => ({
  id: `npc_polis_${e}`,
  name: 'Polis',
  carId: 14,
  avatar: AV({ gender: 'erkek', build: 'standart', skin: ['#d0a080', '#b07850', '#c49070', '#e0b090'][e], faceShape: 'square', hairStyle: ['buzz', 'short', 'short', 'buzz'][e], hairColor: '#1a1a1a', eyebrowShape: 'thick', eyeShape: 'almond', noseShape: 'straight', mouthShape: 'neutral', facialHair: ['mustache', 'none', 'short', 'none'][e], clothing: 'police', clothColor: '#1f3a6b', pantsColor: '#1a2540', shoeColor: '#0d0d0d', shoeStyle: 'bot', background: '#101830' }),
}));
export const SAGLIKCI = {
  id: 'npc_saglikci',
  name: 'Sağlıkçı',
  carId: 15,
  avatar: AV({ gender: 'erkek', build: 'standart', skin: '#d4a07c', faceShape: 'oval', hairStyle: 'short', hairColor: '#2a1c12', eyebrowShape: 'thick', eyeShape: 'almond', noseShape: 'straight', mouthShape: 'neutral', facialHair: 'none', clothing: 'jumpsuit', clothColor: '#e9edf2', pantsColor: '#e9edf2', shoeColor: '#222', shoeStyle: 'spor', background: '#1a2a3a' }),
};
export const WHO = { amca: AMCA, nevzat: NEVZAT, emre: EMRE, polis: POLISLER[0] };
export const isStoryNpcId = (id) => typeof id === 'string' && id.startsWith('npc_');

// --- 3 yıl önce (köprü) ---------------------------------------------------------------
export const FLASHBACK = {
  drive: [
    { who: 'emre', text: 'Bizi kimse ayıramaz kardeşim.' },
    { who: 'emre', text: 'Bu şehir bir gün bizim olacak.' },
  ],
  approach: { who: 'emre', text: 'Bunlar kim lan?' },
  block: [
    { who: 'nevzat', text: "Bu köprüden geçen Akrepler'e haraç öder." },
    { who: 'emre', text: 'Biz kimseye haraç ödemeyiz.' },
    { who: 'nevzat', text: 'Yanlış cevap.' },
  ],
  hurt: { who: 'me', text: 'Dayan kardeşim, kurtulacaksın!' },
  handsUp: { who: 'polis', text: 'Eller yukarı!' },
  frame: [
    { who: 'nevzat', text: 'Memur bey! O vurdu, gözümle gördüm!' },
    { who: 'me', text: 'Hayır, ben yapmadım!' },
  ],
  after: '3 yıl sonra',
};

// --- karakolun önü: ilk karşılaşma ------------------------------------------------------------
export const MEET_NEW = ['Hoş geldin evlat.', 'Senin yapmadığını biliyorum.', 'Gel, sana bu şehri öğreteyim.'];
// --- görevlerini çoktan bitirmiş oyuncu (3 yıl önce'yi izledikten sonra) -------------------
// v168.2: karakolun önü → (oyuncunun gerçek hayatından 1–2 söz) → parkta çay → çay sırasında Nevzat arar
export const MEET_OLD = ['Hoş geldin evlat.', 'Üç yıl… Her ay o kapıya geldim. Görüş vermediler.', 'Senin yapmadığını biliyorum.'];
export const MEET_OLD_END = ['Gel, parkta bir çay içelim. Anlatacaklarım var.'];
// Amca oyuncuyu uzaktan izlemiş: oyuncunun kaydındaki gerçek bilgilerden en fazla iki söz (sırayla ilk uyanlar)
export function personalLines(player, gang) {
  const p = player || {};
  const out = [];
  const add = (cond, line) => {
    if (cond && out.length < 2) out.push(line);
  };
  add(p.belediyeSeat, 'Belediyede koltuğun varmış. Bu şehre söz geçiriyorsun demek.');
  add(p.profession === 'polis', 'Polis olmuşsun… Seni o kapıdan alan üniformayı giymişsin. Hayat garip.');
  add(gang?.gangId && gang?.gangRank === 'baba', "Duydum, kendi çeteni kurmuşsun. 'Baba' diyorlarmış sana.");
  add(gang?.gangId && gang?.gangRank !== 'baba', "Bir çeteye girmişsin. Emre de hep 'bir gün bu şehir bizim olacak' derdi.");
  add(Number(p.heistSuccessCount || 0) >= 10, 'Adın soygunlarla anılıyor. Dikkat et, bu şehir unutmaz.');
  add(Number(p.gold || 0) >= 1_000_000, 'Cebin dolmuş maşallah. Ama para, yalnızlığı doldurmuyor.');
  add(p.employment, 'Fabrikada alın teri döküyormuşsun. Bak, ona sevindim.');
  add(Number(p.reputation || 0) >= 70, 'Mahallede adın temiz anılıyor. Babanın oğlusun.');
  add(Number(p.suspicion || 0) >= 50, 'Polis tepende dolaşıyormuş, biliyorum. Biraz yavaşla.');
  if (!out.length) out.push('Bu şehirde tek başına ayakta kalmışsın. Kolay değil.');
  return out;
}
// parkta, bankta yan yana: Amca anlatır (her sözden sonra kısa sessizlik), son sözün ardından telefon çalar
export const TEA_OLD = [
  'Emre küçükken bu bankta otururduk. Simidinin yarısını hep güvercinlere atardı.',
  'Babanla ikiniz aynı inattınız. Söz dinlemezdiniz, ama sözünüzden de dönmezdiniz.',
  "O gece şahitlik edecektim. 'Hain' dediler, kapıma adam yolladılar… sustum.",
  'Üç yıl o sessizliği taşıdım evlat. Her gece.',
  'Ama bak, sen ayakta kalmışsın. Gurur duyuyorum.',
];
export const OLD_TEA = { taskId: 'tea', index: -1, to: 'park', tea: true, title: 'Rıza Amca ile parkta çay iç', emoji: '🍵', go: [] };
export const CHAPTERS = { 1: 'Tahliye', 2: 'Sokağın Kuralları', 3: 'Kendi Tekerin', 4: 'Hesap' };

// --- görev sahneleri (taskId = sunucudaki görev kimliği) ---------------------------------------
// go: görev başlayınca · ride: birlikte yoldayken · there: kapıya gelince · done: görev bitince
// Kural: Amca kısa konuşur ve görevin NEDEN yapıldığını tek cümlede söyler.
const SCENES = {
  1: { chapter: 1, to: 'fabrika', go: ['Fabrikaya gidiyoruz. Bin.'], there: ['Kapıdan gir, Çalış’a bas. Günde bir kez, 5.000 altın.'], done: ['Alın teri kimseye hesap vermez.'] },
  21: { chapter: 1, to: 'liman', go: ['Benim bir işim var.', "Haritaya dokun, Liman'a ışınlan. Orada buluşuruz."], leave: true },
  2: { chapter: 2, to: 'liman', meet: ['Geldin mi? Gel bakalım.'], go: ['Maaşla iş yürümez.'], there: ['Depodan bir mal al.'], done: ['Şimdi alıcı lazım.'] },
  3: { chapter: 2, to: 'park', go: ['Parktaki adam alır.'], there: ['Bu iş kârlı. Ama şüphen yükselirse polis kapına gelir. Gözünü dört aç.'], done: ['Para böyle döner.'] },
  4: { chapter: 2, to: 'camii', go: ['Şüphe biriktirme. Camiye.'], there: ['İbadet et; şüphen düşer, saygınlığın artar.'], done: ['Gönlün de hafifledi.'] },
  5: { chapter: 2, to: 'silah', go: ['Silahsız adamı bu şehirde kimse dinlemez. Silahçıya.'], ride: ['Nevzat çıktığını duymuştur.'], there: ['Bir silah al. Silah gücündür.'], done: ['Belinde dursun.'] },
  6: { chapter: 2, to: 'kofteci', go: ['Köfteciye.'], there: ['Haraç kes. Gücün arttıkça kazancın artar.'], done: ['Kibar ama net. Aferin.'] },
  7: { chapter: 2, to: 'kokorec', go: ['Haraç aldığın yerle alışveriş olmaz.', 'Kokoreççiye bağış yap, şüphen düşer.'], done: ['Adın iyi anılsın.'] },
  9: { chapter: 2, to: 'park', go: ['Polisle nasıl anlaşılır göstereceğim.', 'Parkta 4 mal sat, şüphen 20 olur.'], there: ['Riskli sat, her satış şüpheni 5 artırır.'], done: ['Tamam. Şimdi karakola.'] },
  10: { chapter: 2, to: 'karakol', go: ['Bu şehirde her kapının bir anahtarı var.'], ride: ['Çıktığın kapıya zarfla gidiyoruz.'], there: ['Rüşvet şüpheni 20 düşürür. Zarfı ver.'], done: ['Şehir böyle işte.'] },
  11: { chapter: 3, to: 'galeri', go: ['Kendi tekerin olmadan kendi yolun olmaz. Galeriye.'], there: ['Seç bakalım.'], done: ['Hayırlı olsun!', 'Arabanı çağır. Önden sen, ben arkandayım.'] },
  12: { chapter: 3, to: 'pist', go: ['Piste!'], there: ['Arabanı tanı. Antrenmanda ustalaşan şampiyonada kazanır.'], done: ['Babanın oğlusun!'] },
  13: { chapter: 3, to: 'pist', go: ['Her gün şampiyona var. Günün birincisi ödülü alır.'], done: ['Kendine bir yer ediyorsun evlat.'], call: true },
  14: { chapter: 3, to: 'banka', go: ['Bankaya. Sana lazım olacak.'], there: ['Kredi çek, zamanında öde. Öderken puanın yükselir, banka sana daha çok güvenir.'] },
  16: { chapter: 3, go: ["Kılığını değiştir. Nevzat'ın adamları seni tanımasın."] },
  17: { chapter: 3, go: ['Birine yaz. Bu şehirde yalnız kalan çabuk düşer.'], done: ['...Ben olmasam bile.'] },
  19: { chapter: 3, to: 'silah', go: ["Arayan Nevzat'tı. Bu gece hurdalıkta."], there: ['Gelişmiş silah, büyük iş demek. Bu gece lazım olacak.'], done: ['Hazırız.'] },
  22: { chapter: 4, to: 'hurdalik', go: ['Hurdalığa.'], ride: ["Emre'yi Nevzat vurdu, biliyorum.", 'Şahitlik edecektim, bana "hain" dediler.', 'Bu gece hesap kapanacak.'], finale: true },
  20: { chapter: 4, sub: "Rıza Amca'nın son sözü" },
};
export const STORY_TASKS = ONBOARDING_ORDER.map((id, i) => ({ taskId: id, index: i, ...(SCENES[id] || {}) }));
export const IDX_CAR = ONBOARDING_ORDER.indexOf(11);
export const IDX_CALL = ONBOARDING_ORDER.indexOf(13);
export const IDX_FINALE = ONBOARDING_ORDER.indexOf(22);
// eski oyuncu (görevleri bitmiş) için tek sahne: hurdalığa git
export const OLD_HESAP = {
  ...SCENES[22],
  taskId: 22,
  index: -1,
  title: 'Rıza Amca ile hurdalığa git',
  emoji: '🔥',
  go: [],
  // eski oyuncu bankta zaten anlattı; yolda başka sözler (son sözlerine zemin)
  ride: ['Nevzat yıllardır bu geceyi bekliyor.', 'Bir şey olursa… kendine bir yer edin evlat. Söz ver.', 'Bu gece hesap kapanacak.'],
};

// Nevzat'ın telefonu (şampiyonadan sonra / eski oyuncuda karşılaşmadan sonra)
export const CALL = [
  { who: 'amca', text: 'Alo?', face: 'smile' },
  { who: 'nevzat', text: 'Rıza. Yeğenin çıkmış.', face: 'mid' },
  { who: 'nevzat', text: 'Fabrika, araba, pist... Her şeyden haberim var.' },
  { who: 'amca', text: 'Ona dokunma.', face: 'dark' },
  { who: 'nevzat', text: 'Hurdalıkta bekliyorum. Gelmezsen ben gelirim.' },
];
// eski oyuncu: çay sırasında — Nevzat onları izliyor
export const CALL_OLD = [
  { who: 'amca', text: 'Alo?', face: 'smile' },
  { who: 'nevzat', text: 'Rıza. Çayınız güzel mi?', face: 'mid' },
  { who: 'nevzat', text: 'Yeğenini üç yıl içeride tuttum. Yetmedi galiba.' },
  { who: 'amca', text: 'Ona dokunma.', face: 'dark' },
  { who: 'nevzat', text: 'Hurdalıkta bekliyorum. Gelmezsen ben gelirim.' },
];
export const AFTER_CALL = ['Yok bir şey. Hadi.'];
export const AFTER_CALL_OLD = ['Çayın soğudu evlat.', 'Nevzat… Bizi izliyormuş.', 'Kalk. Hurdalığa gidiyoruz.'];

// Hurdalık: çatışma öncesi + Amca'nın son sözleri (tüm düşmanlar öldükten sonra)
export const FINALE = {
  talk: [
    { who: 'nevzat', text: 'Yeğeni de getirmişsin Rıza.' },
    { who: 'amca', text: 'Hesabın benimle Nevzat.' },
    { who: 'amca', text: 'Siper al!' },
    { who: 'nevzat', text: 'Vurun!' },
  ],
  last: [
    'Ağlama lan… Ben yolumu yürüdüm.',
    "Emre'nin hesabı kapandı. Seninki yeni başlıyor.",
    'Bu şehirde yalnız adam ezilir. Bir çeteye gir.',
    'Adam topla, güç topla. Bir gün o koltuğa sen otur.',
    'Bu şehri… al.',
  ],
};

// Bir repliğin ekranda kalma süresi (ms)
export const lineMs = (t) => 1400 + String(t || '').length * 52;
