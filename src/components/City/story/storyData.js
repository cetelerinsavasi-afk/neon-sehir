// =============================================================================
// v168 — RIZA AMCA SENARYOSU: karakterler, replikler, görev sahneleri, yerler.
// Görevlerin sırası ve kimlikleri functions/onboardingData.js › ONBOARDING_ORDER ile BİREBİR aynı
// (ilerleme her zaman sunucuda; burası sadece hikâyenin sözleri ve yerleri).
// =============================================================================
import { ONBOARDING_ORDER } from '../../../../functions/onboardingData.js';

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
  id: 'npc_riza_amca',
  name: 'Rıza Amca',
  carId: 1, // oyunun en ucuz arabası
  avatar: AV({ gender: 'erkek', build: 'iri', skin: '#b97f58', eyeColor: '#3b2a1a', faceShape: 'square', hairStyle: 'slick', hairColor: '#9b968e', eyebrowShape: 'thick', eyeShape: 'hooded', noseShape: 'aquiline', mouthShape: 'smile', facialHair: 'mustache', clothing: 'leather', clothColor: '#4a3326', pantsColor: '#2b2a28', shoeColor: '#1a1410', shoeStyle: 'klasik', background: '#2a1c14' }),
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
// görevlerini çoktan bitirmiş oyuncu (3 yıl önce'yi izledikten sonra)
export const MEET_OLD = ['Hoş geldin evlat.', 'Senin yapmadığını biliyorum.', 'Üç yıl… Bu şehirde kendine bir yer etmişsin.'];
export const CHAPTERS = { 1: 'Tahliye', 2: 'Sokağın Kuralları', 3: 'Kendi Tekerin', 4: 'Hesap' };

// --- görev sahneleri (taskId = sunucudaki görev kimliği) ---------------------------------------
// go: görev başlayınca · ride: birlikte yoldayken · there: kapıya gelince · done: görev bitince
// Kural: Amca kısa konuşur ve görevin NEDEN yapıldığını tek cümlede söyler.
const SCENES = {
  1: { chapter: 1, to: 'fabrika', go: ['Sana fabrikada iş ayarladım. Bin, gidelim.'], there: ['Her gün çalış, maaşın her gün yatar.'], done: ['Alın teri kimseye hesap vermez.'] },
  21: { chapter: 1, to: 'liman', go: ['Benim bir işim var.', "Haritaya dokun, Liman'a ışınlan. Orada buluşuruz."], leave: true },
  2: { chapter: 2, to: 'liman', meet: ['Geldin mi? Gel bakalım.'], go: ['Maaşla iş yürümez.'], there: ['Depodan bir mal al.'], done: ['Şimdi alıcı lazım.'] },
  3: { chapter: 2, to: 'park', go: ['Parktaki adam alır.'], there: ['Bu iş kârlı. Ama şüphen yükselirse polis kapına gelir. Gözünü dört aç.'], done: ['Para böyle döner.'] },
  4: { chapter: 2, to: 'camii', go: ['Şüphe biriktirme. Camiye.'], there: ['İbadet et; şüphen düşer, saygınlığın artar.'], done: ['Gönlün de hafifledi.'] },
  5: { chapter: 2, to: 'silah', go: ['Silahsız adamı bu şehirde kimse dinlemez. Silahçıya.'], ride: ['Nevzat çıktığını duymuştur.'], there: ['Bir silah al. Silah gücündür.'], done: ['Belinde dursun.'] },
  6: { chapter: 2, to: 'kofteci', go: ['Köfteciye.'], there: ['Haraç kes. Gücün arttıkça kazancın artar.'], done: ['Kibar ama net. Aferin.'] },
  7: { chapter: 2, to: 'kokorec', go: ['Haraç aldığın yerle alışveriş olmaz.', 'Kokoreççiye bağış yap, şüphen düşer.'], done: ['Adın iyi anılsın.'] },
  9: { chapter: 2, go: ['Polisle nasıl anlaşılır göstereceğim.', 'Parkta 4 mal sat, şüphen 20 olur.'], done: ['Tamam. Şimdi karakola.'] },
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
export const OLD_HESAP = { ...SCENES[22], taskId: 22, index: -1, title: 'Rıza Amca ile hurdalığa git', emoji: '🔥' };

// Nevzat'ın telefonu (şampiyonadan sonra / eski oyuncuda karşılaşmadan sonra)
export const CALL = [
  { who: 'amca', text: 'Alo?', face: 'smile' },
  { who: 'nevzat', text: 'Rıza. Yeğenin çıkmış.', face: 'mid' },
  { who: 'nevzat', text: 'Fabrika, araba, pist... Her şeyden haberim var.' },
  { who: 'amca', text: 'Ona dokunma.', face: 'dark' },
  { who: 'nevzat', text: 'Hurdalıkta bekliyorum. Gelmezsen ben gelirim.' },
];
export const CALL_OLD = [
  { who: 'amca', text: 'Alo?', face: 'smile' },
  { who: 'nevzat', text: 'Rıza. Yeğenin çıkmış.', face: 'mid' },
  { who: 'nevzat', text: 'Üç yıl hapis yatırdım, hâlâ yaşıyor. Şanslı çocuk.' },
  { who: 'amca', text: 'Ona dokunma.', face: 'dark' },
  { who: 'nevzat', text: 'Hurdalıkta bekliyorum. Gelmezsen ben gelirim.' },
];
export const AFTER_CALL = ['Yok bir şey. Hadi.'];
export const AFTER_CALL_OLD = ['Nevzat. Bu gece hesap kapanacak.', 'Hurdalığa.'];

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
    'Çakmak cebimde… artık senin.',
    'Bu şehri… al.',
  ],
};
export const LIGHTER = { title: "Rıza'nın Çakmağı", sub: 'Babandan kalma. Artık senin.' };
export const LIGHTER_SVG = '<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#8d8f94"/><stop offset=".45" stop-color="#e6e7ea"/><stop offset="1" stop-color="#76787d"/></linearGradient></defs><rect x="22" y="58" width="76" height="92" rx="9" fill="url(#lg)" stroke="#45474b" stroke-width="2"/><rect x="22" y="40" width="76" height="24" rx="6" fill="url(#lg)" stroke="#45474b" stroke-width="2"/><line x1="22" y1="64" x2="98" y2="64" stroke="#45474b" stroke-width="2"/><circle cx="74" cy="34" r="9" fill="#5c5e62"/><path d="M54 30 q-8 -14 4 -26 q-2 12 8 16 q4 -8 2 -14 q14 14 0 26 z" fill="#ffb347"/><path d="M58 30 q-3 -8 3 -14 q0 8 5 9 q-1 5 -8 5z" fill="#fff1b8"/><text x="60" y="112" font-family="Georgia,serif" font-size="22" text-anchor="middle" fill="#55575c" font-style="italic">R.A.</text></svg>';

// Bir repliğin ekranda kalma süresi (ms)
export const lineMs = (t) => 1400 + String(t || '').length * 52;
