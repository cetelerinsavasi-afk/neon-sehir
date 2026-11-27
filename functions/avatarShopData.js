// =============================================================================
// v219 — ŞEHİRDEKİ GÖRÜNÜM DÜKKÂNLARI (berber · butik · aksesuarcı · kostümcü)
// Avatar artık Profil'den değil, bu dükkânlardan altınla değişir. Her değişiklik ücretlidir (eski
// görünüme dönmek de — gerçek berber gibi). Kostümler, özel aksesuarlar ve evcil hayvanlar eskisi gibi
// zümrütle (functions/cosmetics.js); burada yalnızca temel görünüm alanları satılır.
// Sunucu (index.js › avatarShopAction) ve istemci (AvatarShopPanel) aynı tabloyu kullanır.
// =============================================================================

// dükkân → satabildiği alanlar
export const AV_SHOP_FIELDS = {
  berber: ['hairStyle', 'hairColor', 'facialHair', 'faceShape', 'eyeShape', 'eyeColor', 'eyebrowShape', 'eyelash', 'noseShape', 'mouthShape', 'lipColor', 'gender', 'build', 'bodyShape', 'skin'],
  giyim: ['clothing', 'clothColor', 'pantsColor', 'shoeStyle', 'shoeColor'],
  aksesuar: ['hat', 'hatColor', 'faceAcc', 'earring', 'neckAcc', 'heldItem', 'tattoo'],
};
export const AV_SHOP_KEYS = Object.keys(AV_SHOP_FIELDS);

// fiyat (altın): seçeneğe göre; renkler sabit
export const AV_PRICES = {
  hairStyle: { kel: 100, short: 300, slick: 600, wavy: 800, long: 1200, mohawk: 1500, afro: 1500, bun: 900, braids: 2000, undercut: 1000, ponytail: 900, curly: 1100, pixie: 1000 },
  facialHair: { none: 100, mustache: 300, goatee: 400, short: 300, full: 700, sideburns: 300, vandyke: 600, chinstrap: 500, horseshoe: 600 },
  faceShape: { oval: 5000, round: 5000, square: 5000, heart: 5000, long: 5000, diamond: 5000 },
  eyeShape: { almond: 3000, round: 3000, narrow: 3000, wide: 3000, hooded: 3000, downturned: 3000 },
  eyebrowShape: { straight: 400, arched: 500, thick: 400, thin: 400, angled: 500, unibrow: 300 },
  eyelash: { none: 100, natural: 300, long: 500, dramatic: 800 },
  noseShape: { small: 4000, straight: 4000, wide: 4000, button: 4000, aquiline: 4000, flat: 4000 },
  mouthShape: { neutral: 2500, smile: 2500, smirk: 2500, full: 3000, thin: 2500, open: 2500 },
  gender: { erkek: 10000, kadin: 10000 },
  build: { zayif: 6000, standart: 6000, iri: 6000 },
  bodyShape: { kare: 4000, oval: 4000 },
  clothing: { suit: 2500, tuxedo: 6000, leather: 3500, hawaii: 1500, jumpsuit: 800, hoodie: 1200, police: 2000, vest: 1500, tanktop: 500, trenchcoat: 4000 },
  shoeStyle: { klasik: 1500, spor: 1200, bot: 2000, sandalet: 400 },
  hat: { none: 100, fedora: 2500, beret: 1200, bandana: 600, cap: 800, crown: 10000, tophat: 5000, hoodup: 300, helmet: 1500, policecap: 2000, beanie: 700, headband: 500 },
  faceAcc: { none: 100, sunglasses: 1500, scar: 800, cigar: 2500, eyepatch: 1200, mask: 2000, monocle: 4000, freckles: 500, piercing: 1000 },
  earring: { yok: 100, sol: 800, sag: 800, cift: 1500 },
  neckAcc: { none: 100, tie: 800, bow: 1200, chain: 6000, scarf: 900, dogtag: 700 },
  heldItem: { yok: 100, tabanca: 5000, bicak: 2500, sopa: 1500, para: 8000, canta: 3000, telefon: 2000, kadeh: 1200 },
  tattoo: { yok: 500, gozyasi: 3000, yildiz: 2000, boyunsembol: 2500, boyunyazi: 2500, yuzsembol: 4000, kolyazi: 2500 },
};
export const AV_COLOR_PRICES = { hairColor: 400, eyeColor: 2000, lipColor: 300, skin: 5000, clothColor: 500, pantsColor: 400, shoeColor: 300, hatColor: 300 };
const HEX = /^#[0-9a-fA-F]{6}$/;
// src/lib/avatarShapes.js › DEFAULT_AVATAR ile aynı (fonksiyonlar src'yi göremez)
export const AV_DEFAULT = {
  gender: 'erkek', build: 'standart', skin: '#c68863', eyeColor: '#3b2a1a', faceShape: 'oval', background: '#080b13',
  hairStyle: 'short', hairColor: '#2b2118', eyebrowShape: 'straight', eyeShape: 'almond', eyelash: 'none',
  noseShape: 'small', mouthShape: 'neutral', lipColor: '#a85a52', facialHair: 'none', faceAcc: 'none', earring: 'yok', tattoo: 'yok',
  clothing: 'suit', clothColor: '#22262f', neckAcc: 'tie', hat: 'none', hatColor: '#0d0d0d', heldItem: 'yok',
  pantsColor: '#22262f', shoeColor: '#0d0d0d', shoeStyle: 'klasik',
};
// şu anki avatar (eksik alanlar varsayılan; gövde şekli cinsiyetten)
export const avCurrent = (av) => {
  const a = { ...AV_DEFAULT, ...(av || {}) };
  if (a.bodyShape !== 'kare' && a.bodyShape !== 'oval') a.bodyShape = a.gender === 'kadin' ? 'oval' : 'kare';
  return a;
};

export const avFieldPrice = (field, value) => {
  if (AV_COLOR_PRICES[field] != null) return HEX.test(String(value || '')) ? AV_COLOR_PRICES[field] : null;
  const p = AV_PRICES[field]?.[value];
  return Number.isFinite(p) ? p : null;
};

// cur: şu anki avatar (varsayılanlarla dolu) · want: dükkânda denenen · shop: dükkân
// → { total, changes: { alan: değer }, bad } (bad: geçersiz alan/değer varsa adı)
export function avShopQuote(shop, cur, want) {
  const fields = AV_SHOP_FIELDS[shop];
  if (!fields) return { total: 0, changes: {}, bad: 'shop' };
  let total = 0;
  const changes = {};
  for (const f of fields) {
    if (!want || want[f] === undefined || want[f] === cur?.[f]) continue;
    const p = avFieldPrice(f, want[f]);
    if (p == null) return { total: 0, changes: {}, bad: f };
    total += p;
    changes[f] = want[f];
  }
  return { total, changes, bad: null };
}
