// Avatar SVG parça üretimi — kullanıcının verdiği "Mafya Kimlik
// Oluşturucu" prototipinden birebir taşındı. Her fonksiyon ham SVG
// markup'ı (string) döner; AvatarSvg bileşeni bunları birleştirip
// dangerouslySetInnerHTML ile <svg> içine basar. Girdi HER ZAMAN
// AVATAR_OPTIONS'a karşı sunucuda doğrulanmış veridir (bkz. functions/
// index.js setAvatar) — bu yüzden string enjeksiyonu riski yok.

export const SKIN_TONES = [
  '#ffe0c2', '#ffdbb0', '#f1c27d', '#e0ac69', '#c68863',
  '#a86b3c', '#8d5524', '#6b4226', '#5c3a21', '#3d2a1c',
];
export const EYE_COLORS = ['#3b2a1a', '#3f5f3f', '#3a5f7d', '#7d7d3a', '#1a1a1a', '#8b3a3a', '#6b3fa0', '#c9922f'];
export const HAIR_COLORS = [
  '#0d0a08', '#2b2118', '#5c3a21', '#8a6a3a', '#b0b0b0', '#e8d98a',
  '#c81d3f', '#22d3ee', '#ffffff', '#ff2e88', '#4a1d5c', '#3a5f7d',
];
export const CLOTH_COLORS = ['#22262f', '#0d0d0d', '#5c1a24', '#1d3d5c', '#3a2f1d', '#4a1d5c', '#1d5c3a', '#8a1d1d', '#e8e6df', '#7d7d3a'];
export const HAT_COLORS = ['#0d0d0d', '#3a2f1d', '#5c1a24', '#1d3d5c', '#d4af37', '#e8e6df', '#4a1d5c', '#1d5c3a'];
export const LIP_COLORS = ['#a85a52', '#8a3a3a', '#c9636b', '#7a3048', '#b06a4a', '#d48a8a', '#5c2e2e', '#e8998a'];
export const BACKGROUND_COLORS = [
  '#080b13', '#0a1f18', '#1d3557', '#3a1d1d', '#3a1d4a', '#1d3a2e', '#4a3a1d', '#2b2b2b', '#5c1a24', '#0d3a3a',
];
export const PANTS_COLORS = [
  '#22262f', '#0d0d0d', '#1d3d5c', '#2b3550', '#3a2f1d', '#4a1d5c', '#5c1a24', '#3d3d3d', '#0d2b1f', '#4a4a4a',
];
export const SHOE_COLORS = ['#0d0d0d', '#3a2f1d', '#5c1a24', '#e8e6df', '#1d3d5c', '#7a1f2b'];

// Tam vücut düzeninde bel/ayak bilek/zemin çizgileri (viewBox: full=580, headshot=400).
// LEG_H bilerek büyük tutuldu — önceki sürümde bacaklar çok kısaydı ve
// figür "göğüsten bacak başlıyormuş" gibi orantısız duruyordu; gerçekçi
// bir insan siluetinde bacaklar gövdeden en az bir kaç kat daha uzun
// olmalı.
const WAIST_Y = 380;
const LEG_H = 155;
const GROUND_Y = 562;

export const AVATAR_OPTIONS = {
  gender: ['erkek', 'kadin'],
  build: ['zayif', 'standart', 'iri'],
  faceShape: ['oval', 'round', 'square', 'heart', 'long', 'diamond'],
  hairStyle: [
    'kel', 'short', 'slick', 'wavy', 'long', 'mohawk', 'afro', 'bun', 'braids', 'undercut',
    'ponytail', 'curly', 'pixie',
  ],
  eyebrowShape: ['straight', 'arched', 'thick', 'thin', 'angled', 'unibrow'],
  eyeShape: ['almond', 'round', 'narrow', 'wide', 'hooded', 'downturned'],
  eyelash: ['none', 'natural', 'long', 'dramatic'],
  noseShape: ['small', 'straight', 'wide', 'button', 'aquiline', 'flat'],
  mouthShape: ['neutral', 'smile', 'smirk', 'full', 'thin', 'open'],
  facialHair: ['none', 'mustache', 'goatee', 'short', 'full', 'sideburns', 'vandyke', 'chinstrap', 'horseshoe'],
  faceAcc: ['none', 'sunglasses', 'scar', 'cigar', 'eyepatch', 'mask', 'monocle', 'freckles', 'piercing'],
  earring: ['yok', 'sol', 'sag', 'cift'],
  tattoo: ['yok', 'gozyasi', 'yildiz', 'boyunsembol', 'boyunyazi', 'yuzsembol', 'kolyazi'],
  clothing: ['suit', 'tuxedo', 'leather', 'hawaii', 'jumpsuit', 'hoodie', 'police', 'vest', 'tanktop', 'trenchcoat'],
  neckAcc: ['none', 'tie', 'bow', 'chain', 'scarf', 'dogtag'],
  hat: [
    'none', 'fedora', 'beret', 'bandana', 'cap', 'crown', 'tophat', 'hoodup', 'helmet',
    'policecap', 'beanie', 'headband',
  ],
  heldItem: ['yok', 'tabanca', 'bicak', 'sopa', 'para', 'canta', 'telefon', 'kadeh'],
  shoeStyle: ['klasik', 'spor', 'bot', 'sandalet'],
};

export const DEFAULT_AVATAR = {
  gender: 'erkek', build: 'standart', skin: '#c68863', eyeColor: '#3b2a1a',
  faceShape: 'oval',
  background: '#080b13',
  hairStyle: 'short', hairColor: '#2b2118',
  eyebrowShape: 'straight', eyeShape: 'almond', eyelash: 'none',
  noseShape: 'small', mouthShape: 'neutral', lipColor: '#a85a52',
  facialHair: 'none', faceAcc: 'none', earring: 'yok', tattoo: 'yok',
  clothing: 'suit', clothColor: '#22262f', neckAcc: 'tie',
  hat: 'none', hatColor: '#0d0d0d', heldItem: 'yok',
  pantsColor: '#22262f', shoeColor: '#0d0d0d', shoeStyle: 'klasik',
};

function shadeColor(hex, percent) {
  const f = parseInt(hex.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = f >> 16, G = (f >> 8) & 0x00ff, B = f & 0x0000ff;
  const newColor =
    0x1000000 +
    (Math.round((t - R) * p) + R) * 0x10000 +
    (Math.round((t - G) * p) + G) * 0x100 +
    (Math.round((t - B) * p) + B);
  return '#' + newColor.toString(16).slice(1);
}

function headShape(s) {
  const slim = s.gender === 'kadin';
  switch (s.faceShape) {
    case 'round':
      return `<ellipse cx="160" cy="170" rx="${slim ? 58 : 62}" ry="${slim ? 58 : 60}" fill="${s.skin}"/>`;
    case 'square':
      return `<path d="M102,140 Q102,106 160,104 Q218,106 218,140 L218,192 Q218,232 160,236 Q102,232 102,192 Z" fill="${s.skin}"/>`;
    case 'heart':
      return `<path d="M104,148 Q104,104 160,102 Q216,104 216,148 Q216,192 160,238 Q104,192 104,148 Z" fill="${s.skin}"/>`;
    case 'long':
      return `<ellipse cx="160" cy="176" rx="${slim ? 50 : 54}" ry="${slim ? 74 : 76}" fill="${s.skin}"/>`;
    case 'diamond':
      return `<path d="M160,102 Q200,130 210,170 Q200,214 160,238 Q120,214 110,170 Q120,130 160,102 Z" fill="${s.skin}"/>`;
    case 'oval':
    default:
      return `<ellipse cx="160" cy="170" rx="${slim ? 54 : 58}" ry="${slim ? 64 : 66}" fill="${s.skin}"/>`;
  }
}

function earsShape(s) {
  return `<ellipse cx="102" cy="176" rx="9" ry="14" fill="${s.skin}"/>
          <ellipse cx="218" cy="176" rx="9" ry="14" fill="${s.skin}"/>`;
}

function neckShape(s) {
  return `<rect x="140" y="222" width="40" height="52" rx="8" fill="${s.skin}"/>`;
}

function eyebrowShape(s) {
  const c = s.hairColor;
  switch (s.eyebrowShape) {
    case 'arched':
      return `<path d="M126,153 Q138,141 151,150" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>
              <path d="M169,150 Q182,141 194,153" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    case 'thick':
      return `<rect x="124" y="146" width="27" height="9" rx="4" fill="${c}" transform="rotate(-4 137 150)"/>
              <rect x="169" y="146" width="27" height="9" rx="4" fill="${c}" transform="rotate(4 183 150)"/>`;
    case 'thin':
      return `<rect x="128" y="150" width="20" height="2.5" rx="1.2" fill="${c}" transform="rotate(-3 138 151)"/>
              <rect x="172" y="150" width="20" height="2.5" rx="1.2" fill="${c}" transform="rotate(3 182 151)"/>`;
    case 'angled':
      return `<path d="M126,156 L151,146" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
              <path d="M169,146 L194,156" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
    case 'unibrow':
      return `<rect x="126" y="149" width="68" height="6" rx="3" fill="${c}"/>`;
    case 'straight':
    default:
      return `<rect x="126" y="149" width="24" height="6" rx="3" fill="${c}" transform="rotate(-4 138 152)"/>
              <rect x="170" y="149" width="24" height="6" rx="3" fill="${c}" transform="rotate(4 182 152)"/>`;
  }
}

function eyeShape(s) {
  let rx = 10, ry = 6.5, pupilR = 4.2;
  switch (s.eyeShape) {
    case 'round':
      rx = 8; ry = 8; pupilR = 4.6;
      break;
    case 'narrow':
      rx = 10.5; ry = 4; pupilR = 3.2;
      break;
    case 'wide':
      rx = 12.5; ry = 7; pupilR = 4.6;
      break;
    case 'hooded':
      rx = 10; ry = 6;
      break;
    case 'downturned':
      rx = 10; ry = 6.5;
      break;
    case 'almond':
    default:
      break;
  }
  const eyeAt = (x) => `
    <ellipse cx="${x}" cy="169" rx="${rx}" ry="${ry}" fill="#f4f1e8"/>
    <circle cx="${x}" cy="169" r="${pupilR}" fill="${s.eyeColor}"/>`;
  let hoodedLid = '';
  if (s.eyeShape === 'hooded') {
    const lidColor = shadeColor(s.skin, -18);
    hoodedLid = `
    <path d="M127,165 Q138,159 149,165" stroke="${lidColor}" stroke-width="4" fill="none"/>
    <path d="M171,165 Q182,159 193,165" stroke="${lidColor}" stroke-width="4" fill="none"/>`;
  }
  return eyeAt(138) + eyeAt(182) + hoodedLid;
}

function eyelashShape(s) {
  if (!s.eyelash || s.eyelash === 'none') return '';
  const len = s.eyelash === 'dramatic' ? 7 : s.eyelash === 'long' ? 5 : 3;
  const count = s.eyelash === 'dramatic' ? 3 : 2;
  let out = '';
  [138, 182].forEach((x, i) => {
    const dir = i === 0 ? -1 : 1;
    for (let k = 0; k < count; k++) {
      const ox = x + dir * (7 - k * 3);
      out += `<line x1="${ox}" y1="163" x2="${ox + dir * 2}" y2="${163 - len}" stroke="#1a1a1a" stroke-width="1.4" stroke-linecap="round"/>`;
    }
  });
  return out;
}

function noseShape(s) {
  const shade = shadeColor(s.skin, -30);
  switch (s.noseShape) {
    case 'button':
      return `<circle cx="160" cy="184" r="4" fill="${shade}" opacity="0.55"/>`;
    case 'wide':
      return `<path d="M155,173 Q150,190 145,193 Q160,198 175,193 Q170,190 165,173" stroke="${shade}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'aquiline':
      return `<path d="M158,172 Q163,180 157,186 Q154,189 150,191" stroke="${shade}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'flat':
      return `<path d="M158,178 Q156,184 154,186" stroke="${shade}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    case 'straight':
      return `<path d="M158,170 Q155,185 152,192" stroke="${shade}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'small':
    default:
      return `<path d="M158,173 Q154,186 150,191" stroke="${shade}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
}

function mouthShape(s) {
  const c = s.lipColor;
  switch (s.mouthShape) {
    case 'smile':
      return `<path d="M138,205 Q160,220 182,205" stroke="${c}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    case 'smirk':
      return `<path d="M141,208 Q162,212 181,201" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'full':
      return `<path d="M138,204 Q160,216 182,204 Q160,213 138,204 Z" fill="${c}"/>`;
    case 'thin':
      return `<path d="M144,208 Q160,210 176,208" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    case 'open':
      return `<ellipse cx="160" cy="209" rx="10" ry="6" fill="#3a1414"/><ellipse cx="160" cy="207" rx="10" ry="3" fill="${c}"/>`;
    case 'neutral':
    default:
      return `<path d="M141,207 Q160,214 179,207" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
}

function facialHairShape(s) {
  const c = s.hairColor;
  switch (s.facialHair) {
    case 'mustache':
      return `<path d="M136,199 Q160,208 184,199 Q160,193 136,199 Z" fill="${c}"/>`;
    case 'goatee':
      return `<path d="M148,208 Q160,238 172,208 Q160,220 148,208 Z" fill="${c}"/>`;
    case 'short':
      return `<path d="M105,178 Q102,222 160,230 Q218,222 215,178 Q214,208 160,216 Q106,208 105,178 Z" fill="${c}" opacity="0.92"/>`;
    case 'full':
      return `<path d="M100,176 Q96,232 160,246 Q224,232 220,176 Q222,214 160,224 Q98,214 100,176 Z" fill="${c}"/>`;
    case 'sideburns':
      return `<path d="M100,150 L112,150 L110,196 L100,196 Z" fill="${c}"/>
              <path d="M220,150 L208,150 L210,196 L220,196 Z" fill="${c}"/>`;
    case 'vandyke':
      return `<path d="M136,199 Q160,208 184,199 Q160,193 136,199 Z" fill="${c}"/>
              <path d="M150,210 Q160,236 170,210 Q160,220 150,210 Z" fill="${c}"/>`;
    case 'chinstrap':
      return `<path d="M104,180 Q102,220 160,232 Q218,220 216,180 L212,180 Q212,214 160,224 Q108,214 108,180 Z" fill="${c}"/>`;
    case 'horseshoe':
      return `<path d="M136,199 Q160,208 184,199 Q160,193 136,199 Z" fill="${c}"/>
              <path d="M136,199 L134,232" stroke="${c}" stroke-width="8" stroke-linecap="round"/>
              <path d="M184,199 L186,232" stroke="${c}" stroke-width="8" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function hairSideStubs(s) {
  const c = s.hairColor;
  return `<path d="M100,150 Q88,230 104,326 Q120,330 122,150 Z" fill="${c}"/>
          <path d="M220,150 Q232,230 216,326 Q200,330 198,150 Z" fill="${c}"/>`;
}

function hairBackShape(s) {
  const c = s.hairColor;
  if (s.hairStyle === 'long') return hairSideStubs(s);
  if (s.hairStyle === 'braids') {
    const d = shadeColor(c, -30);
    return `
      <path d="M108,150 Q100,230 110,320 Q118,322 120,150 Z" fill="${c}"/>
      <path d="M212,150 Q220,230 210,320 Q202,322 200,150 Z" fill="${c}"/>
      <line x1="112" y1="190" x2="118" y2="190" stroke="${d}" stroke-width="2"/>
      <line x1="112" y1="230" x2="118" y2="230" stroke="${d}" stroke-width="2"/>
      <line x1="112" y1="270" x2="118" y2="270" stroke="${d}" stroke-width="2"/>
      <line x1="202" y1="190" x2="208" y2="190" stroke="${d}" stroke-width="2"/>
      <line x1="202" y1="230" x2="208" y2="230" stroke="${d}" stroke-width="2"/>
      <line x1="202" y1="270" x2="208" y2="270" stroke="${d}" stroke-width="2"/>
    `;
  }
  if (s.hairStyle === 'afro') return `<circle cx="160" cy="128" r="68" fill="${c}"/>`;
  if (s.hairStyle === 'ponytail') {
    const d = shadeColor(c, -20);
    return `<path d="M204,120 Q234,150 224,220 Q216,260 202,250 Q214,190 196,140 Z" fill="${c}"/>
            <ellipse cx="206" cy="118" rx="7" ry="5" fill="${d}"/>`;
  }
  return '';
}

function hairFrontShape(s) {
  if (s.hairStyle === 'kel' || s.hat !== 'none') return '';
  const c = s.hairColor;
  const base = `M104,152 C104,100 130,104 160,104 C190,104 216,100 216,152 C216,128 190,112 160,112 C130,112 104,128 104,152 Z`;
  switch (s.hairStyle) {
    case 'short':
      return `<path d="${base}" fill="${c}"/>`;
    case 'slick':
      return `<path d="M100,152 C100,96 128,100 160,100 C196,100 220,96 220,152 C220,124 192,108 160,108 C128,108 100,124 100,152 Z" fill="${c}"/>
              <line x1="142" y1="102" x2="132" y2="140" stroke="${shadeColor(c, -25)}" stroke-width="2"/>
              <ellipse cx="150" cy="112" rx="18" ry="5" fill="${shadeColor(c, 40)}" opacity="0.25"/>`;
    case 'wavy':
      return `<path d="M104,152 C104,116 116,92 132,102 C140,82 150,104 160,94 C170,104 180,82 188,102 C204,92 216,116 216,152 C216,126 190,112 160,112 C130,112 104,126 104,152 Z" fill="${c}"/>`;
    case 'long':
      return `<path d="${base}" fill="${c}"/>`;
    case 'mohawk':
      return `<path d="M146,112 L160,44 L174,112 Z" fill="${c}"/>`;
    case 'afro':
      return `<path d="${base}" fill="${c}"/>`;
    case 'bun':
      return `<path d="${base}" fill="${c}"/>
              <circle cx="160" cy="88" r="17" fill="${c}"/>
              <ellipse cx="160" cy="88" rx="17" ry="17" fill="none" stroke="${shadeColor(c, -30)}" stroke-width="1.5" opacity="0.5"/>`;
    case 'braids':
      return `<path d="${base}" fill="${c}"/>`;
    case 'undercut':
      return `<path d="M120,140 C120,102 138,104 160,104 C182,104 200,102 200,140 C200,118 182,110 160,110 C138,110 120,118 120,140 Z" fill="${c}"/>`;
    case 'ponytail':
      return `<path d="${base}" fill="${c}"/>`;
    case 'curly':
      return `<path d="${base}" fill="${c}"/>
              <circle cx="112" cy="120" r="12" fill="${c}"/>
              <circle cx="136" cy="102" r="13" fill="${c}"/>
              <circle cx="162" cy="96" r="13" fill="${c}"/>
              <circle cx="188" cy="102" r="13" fill="${c}"/>
              <circle cx="210" cy="120" r="12" fill="${c}"/>`;
    case 'pixie':
      return `<path d="M108,148 C108,108 132,102 160,102 C182,102 202,108 208,132 C198,118 178,110 158,112 C136,114 116,124 112,150 Z" fill="${c}"/>
              <path d="M108,132 Q98,144 104,158" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function hatShape(s) {
  const c = s.hatColor;
  const accent = shadeColor(c, 60);
  switch (s.hat) {
    case 'fedora':
      return `<path d="M116,84 Q160,58 204,84 Q212,110 200,116 L120,116 Q108,110 116,84 Z" fill="${c}"/>
              <rect x="112" y="110" width="96" height="10" rx="4" fill="${accent}"/>
              <ellipse cx="160" cy="120" rx="72" ry="13" fill="${c}"/>`;
    case 'beret':
      return `<ellipse cx="152" cy="106" rx="52" ry="26" fill="${c}" transform="rotate(-8 152 106)"/>
              <circle cx="178" cy="86" r="5" fill="${accent}"/>`;
    case 'bandana':
      return `<path d="M100,150 C100,104 130,90 160,90 C190,90 220,104 220,150 Q220,120 160,116 Q100,120 100,150 Z" fill="${c}"/>
              <path d="M212,140 L236,158 L218,164 Z" fill="${c}"/>`;
    case 'cap':
      return `<ellipse cx="160" cy="112" rx="60" ry="22" fill="${c}"/>
              <rect x="196" y="118" width="34" height="9" rx="4" fill="${accent}"/>`;
    case 'crown':
      return `<path d="M108,124 L124,90 L142,116 L160,82 L178,116 L196,90 L212,124 Z" fill="#d4af37" stroke="#a67c1e" stroke-width="2"/>
              <circle cx="160" cy="86" r="4" fill="#ff2e88"/>`;
    case 'tophat':
      return `<ellipse cx="160" cy="118" rx="66" ry="12" fill="${c}"/>
              <rect x="130" y="56" width="60" height="64" rx="4" fill="${c}"/>
              <rect x="130" y="100" width="60" height="10" fill="${accent}"/>`;
    case 'hoodup':
      return `<path d="M96,120 Q96,58 160,52 Q224,58 224,120 Q224,180 196,196 Q210,150 196,110 Q178,80 160,80 Q142,80 124,110 Q110,150 124,196 Q96,180 96,120 Z" fill="${c}"/>`;
    case 'helmet':
      return `<path d="M98,150 Q98,72 160,70 Q222,72 222,150 Q222,168 206,168 L114,168 Q98,168 98,150 Z" fill="${c}"/>
              <rect x="118" y="150" width="84" height="30" rx="10" fill="#9fd8f0" opacity="0.55"/>
              <rect x="150" y="66" width="20" height="10" rx="3" fill="${accent}"/>`;
    case 'policecap':
      return `<ellipse cx="160" cy="116" rx="58" ry="20" fill="#1d3557"/>
              <ellipse cx="160" cy="108" rx="46" ry="16" fill="#14263f"/>
              <rect x="140" y="96" width="40" height="10" rx="3" fill="${accent}"/>
              <circle cx="160" cy="100" r="6" fill="#d4af37"/>
              <ellipse cx="160" cy="130" rx="70" ry="10" fill="#0d0d0d"/>`;
    case 'beanie':
      return `<path d="M100,150 Q100,90 160,88 Q220,90 220,150 Q220,158 210,158 L110,158 Q100,158 100,150 Z" fill="${c}"/>
              <rect x="100" y="140" width="120" height="18" rx="6" fill="${accent}"/>`;
    case 'headband':
      return `<rect x="100" y="128" width="120" height="16" rx="8" fill="${c}"/>
              <circle cx="160" cy="136" r="6" fill="${accent}"/>`;
    default:
      return '';
  }
}

function faceAccShape(s) {
  switch (s.faceAcc) {
    case 'sunglasses':
      return `<rect x="124" y="162" width="28" height="15" rx="6" fill="#111"/>
              <rect x="168" y="162" width="28" height="15" rx="6" fill="#111"/>
              <line x1="152" y1="168" x2="168" y2="168" stroke="#111" stroke-width="3"/>`;
    case 'scar':
      return `<line x1="128" y1="146" x2="150" y2="196" stroke="#a8233d" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'cigar':
      return `<g transform="rotate(18 190 208)"><rect x="178" y="204" width="28" height="7" rx="3" fill="#7a5230"/><circle cx="207" cy="207" r="4" fill="#e35b3f"/></g>`;
    case 'eyepatch':
      return `<rect x="124" y="158" width="28" height="20" rx="4" fill="#111"/>
              <line x1="138" y1="160" x2="216" y2="150" stroke="#111" stroke-width="3"/>
              <line x1="138" y1="176" x2="222" y2="182" stroke="#111" stroke-width="3"/>`;
    case 'mask':
      return `<path d="M100,182 Q160,206 220,182 L220,150 Q160,132 100,150 Z" fill="#161616"/>
              <ellipse cx="138" cy="169" rx="12" ry="8" fill="#f4f1e8" opacity="0.9"/>
              <ellipse cx="182" cy="169" rx="12" ry="8" fill="#f4f1e8" opacity="0.9"/>
              <circle cx="138" cy="169" r="4.2" fill="${s.eyeColor}"/>
              <circle cx="182" cy="169" r="4.2" fill="${s.eyeColor}"/>`;
    case 'monocle':
      return `<circle cx="182" cy="169" r="13" fill="none" stroke="#d4af37" stroke-width="2.5"/>
              <line x1="193" y1="180" x2="204" y2="220" stroke="#d4af37" stroke-width="1.5"/>`;
    case 'freckles':
      return `<circle cx="128" cy="180" r="1.6" fill="#7a4a30" opacity="0.6"/>
              <circle cx="134" cy="185" r="1.6" fill="#7a4a30" opacity="0.6"/>
              <circle cx="124" cy="188" r="1.6" fill="#7a4a30" opacity="0.6"/>
              <circle cx="192" cy="180" r="1.6" fill="#7a4a30" opacity="0.6"/>
              <circle cx="186" cy="185" r="1.6" fill="#7a4a30" opacity="0.6"/>
              <circle cx="196" cy="188" r="1.6" fill="#7a4a30" opacity="0.6"/>`;
    case 'piercing':
      return `<circle cx="150" cy="204" r="2" fill="#d4af37"/>`;
    default:
      return '';
  }
}

function torsoShape(s) {
  const c = s.clothColor;
  const dark = shadeColor(c, -25);
  const light = shadeColor(c, 25);
  // B: gövdenin temel dikdörtgeni. ÖNEMLİ — alt genişlik ÜST genişlikle
  // AYNI tutuluyor (bl=tl, br=tr): daha önce alt kısım omuzlardan çok
  // daha geniş bir "palto" gibi flare yapıyordu, artık düz kenarlı bir
  // dikdörtgen. Palto gibi bilerek geniş duran parçalar (trenchcoat)
  // kendi `inset`/`bottomInset` değerleriyle bunun üzerine ayrıca
  // genişliyor.
  const B =
    s.build === 'zayif'
      ? { tl: 98, tr: 222, bl: 98, br: 222, ty: 264 }
      : s.build === 'iri'
        ? { tl: 50, tr: 270, bl: 50, br: 270, ty: 258 }
        : { tl: 70, tr: 250, bl: 70, br: 250, ty: 262 };

  // trapezoid(...) — B'den türetilmiş, kenarları içe/dışa kaydırılmış ve
  // alt kenarı farklı bir Y'de bitebilen genel bir gövde poligonu. Her
  // kıyafet türü kendi siluetini bu yardımcıyla üretir — böylece sadece
  // renk/desen değil, GERÇEK SİLUET de birbirinden ayrışır.
  const trapezoid = (fill, { inset = 0, bottomInset = 0, bottomY = 380 } = {}) =>
    `<path d="M${B.tl + inset},${B.ty} L${B.tr - inset},${B.ty} L${B.br - bottomInset},${bottomY} L${B.bl + bottomInset},${bottomY} Z" fill="${fill}"/>`;

  let base = trapezoid(c);
  let details = '';
  switch (s.clothing) {
    case 'suit':
      details = `
        <path d="M120,262 L156,262 L142,304 Z" fill="${dark}"/>
        <path d="M200,262 L164,262 L178,304 Z" fill="${dark}"/>
        <path d="M142,262 L160,282 L178,262 L170,255 L160,270 L150,255 Z" fill="#f2efe4"/>`;
      break;
    case 'tuxedo':
      base = trapezoid('#0d0d0d');
      details = `
        <path d="M120,262 L156,262 L142,304 Z" fill="${c}"/>
        <path d="M200,262 L164,262 L178,304 Z" fill="${c}"/>
        <path d="M142,262 L160,282 L178,262 L170,255 L160,270 L150,255 Z" fill="#f2efe4"/>`;
      break;
    case 'leather':
      // Dar kesim (biker) ceket — dik yaka, fermuar çizgisi.
      base = trapezoid(c, { inset: 4, bottomInset: 6 });
      details = `
        <path d="M128,258 L146,258 L138,236 Q133,246 128,258 Z" fill="${light}"/>
        <path d="M192,258 L174,258 L182,236 Q187,246 192,258 Z" fill="${light}"/>
        <line x1="160" y1="264" x2="152" y2="378" stroke="#111" stroke-width="2.5"/>
        <path d="M152,264 L168,264 L165,290 L155,290 Z" fill="${dark}"/>`;
      break;
    case 'hawaii':
      // Bol kesim, kısa kollu gömlek — omuzda küçük kol kapağı.
      base = trapezoid(c, { inset: -6, bottomInset: -10 });
      details = `
        <path d="M${B.tl - 8},${B.ty} Q${B.tl - 22},${B.ty + 14} ${B.tl - 4},${B.ty + 26} L${B.tl + 10},${B.ty + 10} Z" fill="${c}"/>
        <path d="M${B.tr + 8},${B.ty} Q${B.tr + 22},${B.ty + 14} ${B.tr + 4},${B.ty + 26} L${B.tr - 10},${B.ty + 10} Z" fill="${c}"/>
        <path d="M140,262 L160,290 L180,262 L165,262 L160,278 L155,262 Z" fill="${s.skin}"/>
        <circle cx="100" cy="300" r="4" fill="${light}"/><circle cx="130" cy="340" r="4" fill="${light}"/>
        <circle cx="190" cy="310" r="4" fill="${light}"/><circle cx="220" cy="350" r="4" fill="${light}"/>
        <circle cx="160" cy="360" r="4" fill="${light}"/>`;
      break;
    case 'jumpsuit':
      // Tek parça, vücuda oturan tulum — dar kesim.
      base = trapezoid(c, { inset: 10, bottomInset: 14 });
      details = `
        <line x1="160" y1="264" x2="160" y2="378" stroke="${dark}" stroke-width="3"/>
        <rect x="94" y="298" width="22" height="16" rx="2" fill="${dark}"/>
        <rect x="204" y="298" width="22" height="16" rx="2" fill="${dark}"/>
        <rect x="140" y="272" width="40" height="14" rx="2" fill="#f2efe4" opacity="0.85"/>`;
      break;
    case 'hoodie':
      // Bol, hacimli siluet + boyunda kapüşon yığını.
      base = trapezoid(c, { inset: -8, bottomInset: -6 });
      details = `
        <ellipse cx="160" cy="252" rx="30" ry="16" fill="${dark}"/>
        <path d="M120,262 Q160,286 200,262 L200,274 Q160,300 120,274 Z" fill="${dark}"/>
        <path d="M148,266 L152,320 M172,266 L168,320" stroke="${dark}" stroke-width="3"/>
        <circle cx="150" cy="322" r="3" fill="${light}"/><circle cx="170" cy="322" r="3" fill="${light}"/>`;
      break;
    case 'police':
      // Düzgün duruş, apolet + kemer ile resmî silüet.
      base = trapezoid('#1d3557', { inset: 2 });
      details = `
        <path d="M120,262 L156,262 L142,300 Z" fill="#14263f"/>
        <path d="M200,262 L164,262 L178,300 Z" fill="#14263f"/>
        <path d="M142,262 L160,282 L178,262 L170,255 L160,270 L150,255 Z" fill="#e8e6df"/>
        <rect x="${B.tl - 2}" y="${B.ty - 4}" width="20" height="8" rx="2" fill="#d4af37"/>
        <rect x="${B.tr - 18}" y="${B.ty - 4}" width="20" height="8" rx="2" fill="#d4af37"/>
        <rect x="118" y="352" width="84" height="12" fill="#14263f"/>
        <rect x="104" y="284" width="16" height="16" rx="2" fill="#d4af37"/>
        <circle cx="112" cy="292" r="5" fill="#1d3557"/>`;
      break;
    case 'vest':
      // Açık yaka — orta kısımda gömlek görünür, sadece yanlarda yelek.
      base = `
        <path d="M${B.tl},${B.ty} L${B.tr},${B.ty} L${B.br},380 L${B.bl},380 Z" fill="#e8e6df"/>
        <path d="M${B.tl},${B.ty} L156,${B.ty} L142,380 L${B.bl},380 Z" fill="${c}"/>
        <path d="M${B.tr},${B.ty} L164,${B.ty} L178,380 L${B.br},380 Z" fill="${c}"/>`;
      details = `
        <path d="M156,${B.ty} L160,290 L164,${B.ty} Z" fill="${dark}"/>
        <line x1="160" y1="290" x2="160" y2="376" stroke="${dark}" stroke-width="1.5" stroke-dasharray="4,5"/>`;
      break;
    case 'tanktop':
      // Kolsuz, dar kesim — omuzlar belirgin şekilde daralır.
      base = trapezoid(c, { inset: 16, bottomInset: 4 });
      details = `
        <path d="M${B.tl},${B.ty} L${B.tl + 16},${B.ty} L${B.tl + 8},${B.ty + 30} Z" fill="${s.skin}"/>
        <path d="M${B.tr},${B.ty} L${B.tr - 16},${B.ty} L${B.tr - 8},${B.ty + 30} Z" fill="${s.skin}"/>
        <path d="M126,${B.ty} L138,${B.ty} L138,380 L126,380 Z" fill="${dark}"/>
        <path d="M194,${B.ty} L182,${B.ty} L182,380 L194,380 Z" fill="${dark}"/>`;
      break;
    case 'trenchcoat':
      // Uzun, geniş yakalı palto — beldeki diğer kıyafetlerin aksine
      // bacakların üst kısmına kadar uzanır (z-sırası: bacaklar önce
      // çizildiği için palto eteği bacakların üstünü doğal olarak örter).
      base = trapezoid(c, { inset: -10, bottomInset: -16, bottomY: 420 });
      details = `
        <line x1="160" y1="264" x2="160" y2="418" stroke="${dark}" stroke-width="2"/>
        <rect x="132" y="290" width="14" height="14" rx="2" fill="${dark}"/>
        <rect x="174" y="290" width="14" height="14" rx="2" fill="${dark}"/>
        <rect x="136" y="360" width="12" height="12" rx="2" fill="${dark}"/>
        <rect x="172" y="360" width="12" height="12" rx="2" fill="${dark}"/>
        <path d="M126,262 L156,262 L142,296 Z" fill="${dark}"/>
        <path d="M194,262 L164,262 L178,296 Z" fill="${dark}"/>
        <path d="M${B.bl - 6},380 L${B.br + 6},380 L${B.br + 4},420 L${B.bl - 4},420 Z" fill="${shadeColor(c, -12)}"/>`;
      break;
    default:
      break;
  }
  return base + details;
}

// legsShape / shoesShape — tam vücut modunda bel hizasından (WAIST_Y)
// aşağıya pantolon ve ayakkabıları çizer. `pose`:
//  - 'idle': düz duruş
//  - 'walk1'/'walk2': 2 karelik yürüyüş çevrimi (bacaklar zıt yönde açılır)
//  - 'sit': oturma — bacaklar kısaltılıp hafifçe açılır, böylece
//    karakter bir bank/sandalyenin üstünde AYAKTA duruyormuş gibi değil,
//    gerçekten OTURUYORMUŞ gibi görünür.
const SIT_LEG_H = LEG_H * 0.4;

function legHipX(s) {
  const cxL = s.build === 'zayif' ? 138 : s.build === 'iri' ? 122 : 132;
  return { cxL, cxR: 320 - cxL };
}

function legsShape(s, pose = 'idle') {
  const { cxL, cxR } = legHipX(s);
  const halfW = s.build === 'zayif' ? 15 : s.build === 'iri' ? 24 : 19;
  const c = s.pantsColor;
  const dark = shadeColor(c, -22);

  if (pose === 'sit') {
    const spread = 11;
    const leg = (cx, angle) => `
      <g transform="translate(${cx},${WAIST_Y}) rotate(${angle})">
        <rect x="${-halfW}" y="0" width="${halfW * 2}" height="${SIT_LEG_H}" rx="${halfW * 0.55}" fill="${c}"/>
      </g>`;
    return leg(cxL, -spread) + leg(cxR, spread);
  }

  const swing = pose === 'walk1' ? 16 : pose === 'walk2' ? -16 : 0;
  const leg = (cx, angle, shade) => `
    <g transform="translate(${cx},${WAIST_Y}) rotate(${angle})">
      <rect x="${-halfW}" y="0" width="${halfW * 2}" height="${LEG_H}" rx="${halfW * 0.55}" fill="${shade}"/>
    </g>`;
  // Yürürken arkada kalan bacak biraz koyu gölgeli — derinlik hissi için.
  return leg(cxL, swing, swing >= 0 ? c : dark) + leg(cxR, -swing, -swing >= 0 ? c : dark);
}

function shoesShape(s, pose = 'idle') {
  const { cxL, cxR } = legHipX(s);
  const c = s.shoeColor;

  const shoeInner = () => {
    switch (s.shoeStyle) {
      case 'spor':
        return `<rect x="-17" y="-2" width="36" height="15" rx="7" fill="${c}"/><rect x="-17" y="8" width="36" height="4" fill="#f2efe4"/>`;
      case 'bot':
        return `<rect x="-15" y="-16" width="30" height="30" rx="4" fill="${c}"/>`;
      case 'sandalet':
        return `<rect x="-15" y="-2" width="30" height="8" rx="3" fill="${c}"/><rect x="-15" y="-8" width="30" height="4" fill="${c}"/>`;
      case 'klasik':
      default:
        return `<path d="M-17,-2 Q-19,10 -6,13 L22,13 Q24,3 14,-2 Z" fill="${c}"/>`;
    }
  };

  if (pose === 'sit') {
    const spread = 11;
    const shoe = (cx, angle) => `<g transform="translate(${cx},${WAIST_Y + SIT_LEG_H}) rotate(${angle})">${shoeInner()}</g>`;
    return shoe(cxL, -spread) + shoe(cxR, spread);
  }

  const swing = pose === 'walk1' ? 16 : pose === 'walk2' ? -16 : 0;
  const shoe = (cx, angle) => `<g transform="translate(${cx},${WAIST_Y + LEG_H}) rotate(${angle})">${shoeInner()}</g>`;
  return shoe(cxL, swing) + shoe(cxR, -swing);
}

function neckAccShape(s) {
  switch (s.neckAcc) {
    case 'tie':
      return `<path d="M154,258 L166,258 L172,300 L160,318 L148,300 Z" fill="#7a1f2b"/>`;
    case 'bow':
      return `<path d="M136,262 L158,258 L158,270 L136,274 Z" fill="#7a1f2b"/>
              <path d="M184,262 L162,258 L162,270 L184,274 Z" fill="#7a1f2b"/>
              <circle cx="160" cy="266" r="5" fill="#5c1620"/>`;
    case 'chain':
      return `<ellipse cx="160" cy="272" rx="28" ry="7" fill="none" stroke="#d4af37" stroke-width="3.5"/>
              <circle cx="160" cy="288" r="6" fill="#d4af37"/>`;
    case 'scarf':
      return `<rect x="128" y="246" width="64" height="24" rx="10" fill="#5c1a24"/>
              <rect x="150" y="264" width="16" height="46" rx="4" fill="#5c1a24"/>`;
    case 'dogtag':
      return `<line x1="150" y1="258" x2="156" y2="296" stroke="#b0b0b0" stroke-width="2"/>
              <line x1="170" y1="258" x2="164" y2="296" stroke="#b0b0b0" stroke-width="2"/>
              <rect x="148" y="294" width="24" height="16" rx="3" fill="#c9c9c9" stroke="#8a8a8a" stroke-width="1"/>`;
    default:
      return '';
  }
}

function earringShape(s) {
  if (s.earring === 'yok') return '';
  const g = '#d4af37';
  const left = `<circle cx="101" cy="192" r="3.5" fill="${g}"/>`;
  const right = `<circle cx="219" cy="192" r="3.5" fill="${g}"/>`;
  if (s.earring === 'sol') return left;
  if (s.earring === 'sag') return right;
  if (s.earring === 'cift') return left + right;
  return '';
}

function tattooShape(s) {
  switch (s.tattoo) {
    case 'gozyasi':
      return `<circle cx="149" cy="182" r="3" fill="#2a3a55"/>`;
    case 'yildiz':
      return `<path d="M148,186 L150,192 L156,192 L151,196 L153,202 L148,198 L143,202 L145,196 L140,192 L146,192 Z" fill="#2a3a55"/>`;
    case 'boyunsembol':
      return `<circle cx="160" cy="245" r="9" fill="none" stroke="#2a3a55" stroke-width="2"/>
              <line x1="160" y1="236" x2="160" y2="254" stroke="#2a3a55" stroke-width="2"/>`;
    case 'boyunyazi':
      return `<text x="160" y="250" font-family="Special Elite, monospace" font-size="9" fill="#2a3a55" text-anchor="middle" letter-spacing="1">MAFYA</text>`;
    case 'yuzsembol':
      return `<path d="M126,180 L132,192" stroke="#2a3a55" stroke-width="1.6" stroke-linecap="round"/>
              <path d="M126,192 L132,180" stroke="#2a3a55" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'kolyazi':
      return `<text x="160" y="245" font-family="Special Elite, monospace" font-size="7" fill="#2a3a55" text-anchor="middle" letter-spacing="0.5">SADAKAT</text>`;
    default:
      return '';
  }
}

function heldItemShape(s) {
  switch (s.heldItem) {
    case 'tabanca':
      return `<g transform="translate(238,318) rotate(-8)">
                <rect x="0" y="0" width="34" height="10" rx="2" fill="#2b2b2b"/>
                <rect x="4" y="9" width="10" height="16" rx="2" fill="#1a1a1a"/>
              </g>`;
    case 'bicak':
      return `<g transform="translate(240,300) rotate(18)">
                <rect x="0" y="0" width="6" height="34" fill="#c9c9c9"/>
                <rect x="-2" y="30" width="10" height="14" rx="2" fill="#3a2f1d"/>
              </g>`;
    case 'sopa':
      return `<g transform="translate(246,290) rotate(-14)">
                <rect x="0" y="0" width="9" height="70" rx="4" fill="#c9a066"/>
              </g>`;
    case 'para':
      return `<g transform="translate(232,320)">
                <rect x="0" y="10" width="34" height="18" rx="2" fill="#1d5c3a" stroke="#0d3a22" stroke-width="1"/>
                <rect x="3" y="6" width="34" height="18" rx="2" fill="#22703f" stroke="#0d3a22" stroke-width="1"/>
                <rect x="6" y="2" width="34" height="18" rx="2" fill="#2a8a4a" stroke="#0d3a22" stroke-width="1"/>
              </g>`;
    case 'canta':
      return `<g transform="translate(234,296)">
                <rect x="0" y="10" width="38" height="30" rx="4" fill="#3a2f1d"/>
                <path d="M6,10 Q19,-6 32,10" fill="none" stroke="#3a2f1d" stroke-width="4"/>
                <rect x="15" y="20" width="8" height="8" fill="#d4af37"/>
              </g>`;
    case 'telefon':
      return `<g transform="translate(240,300) rotate(-6)">
                <rect x="0" y="0" width="20" height="36" rx="4" fill="#111"/>
                <rect x="2" y="4" width="16" height="26" fill="#4ab8e0"/>
              </g>`;
    case 'kadeh':
      return `<g transform="translate(238,296)">
                <path d="M2,0 L22,0 L16,16 Q12,20 8,16 Z" fill="none" stroke="#d4af37" stroke-width="2"/>
                <path d="M4,3 L20,3 L15,14 Q12,17 9,14 Z" fill="#8a1d3a" opacity="0.85"/>
                <line x1="12" y1="18" x2="12" y2="30" stroke="#d4af37" stroke-width="2"/>
                <line x1="6" y1="30" x2="18" y2="30" stroke="#d4af37" stroke-width="2"/>
              </g>`;
    default:
      return '';
  }
}

// buildAvatarSvgInner — tüm parçaları birleştirip <svg> içine konacak
// markup'ı üretir.
//
// opts.pose: 'idle' (varsayılan) | 'walk1' | 'walk2'. Tam vücut (full)
// modda bacaklar zıt yönde döner, üst gövde de hafifçe iner/kalkar —
// böylece ParkWorld gibi gezilebilir sahnelerde bu iki kareyi art arda
// göstererek basit bir yürüme animasyonu elde edilir. 'headshot'
// görünümde (viewBox 0 0 320 400) bacak/ayakkabı zaten kırpılıp
// görünmez, bu yüzden pose orada etkisizdir.
export function buildAvatarSvgInner(rawState, opts = {}) {
  const s = { ...DEFAULT_AVATAR, ...rawState };
  const pose = opts.pose || 'idle';
  const bob = pose === 'walk1' ? -3 : pose === 'walk2' ? 3 : 0;

  let upperBody = '';
  upperBody += torsoShape(s);
  upperBody += heldItemShape(s);
  upperBody += neckAccShape(s);
  upperBody += hairBackShape(s);
  upperBody += neckShape(s);
  upperBody += headShape(s);
  upperBody += earsShape(s);
  upperBody += earringShape(s);
  upperBody += eyebrowShape(s);
  upperBody += eyeShape(s);
  upperBody += eyelashShape(s);
  upperBody += noseShape(s);
  upperBody += mouthShape(s);
  upperBody += tattooShape(s);
  upperBody += facialHairShape(s);
  upperBody += hairFrontShape(s);
  upperBody += hatShape(s);
  upperBody += faceAccShape(s);

  let svg = '';
  svg += `<ellipse cx="160" cy="${GROUND_Y}" rx="74" ry="12" fill="#000" opacity="0.35"/>`;
  svg += legsShape(s, pose);
  svg += shoesShape(s, pose);
  svg += `<g transform="translate(0,${bob})">${upperBody}</g>`;
  return svg;
}

// buildFullAvatarSvgMarkup — buildAvatarSvgInner'ın tam, kendi başına
// geçerli bir <svg> dokümanına sarılmış hali. Park gibi canvas tabanlı
// sahnelerde, karakteri bir <img>/Image() üzerinden canvas'a çizebilmek
// için (drawImage) kullanılır — arka planı YOK (şeffaf), sadece
// siluetin kendisi.
export function buildFullAvatarSvgMarkup(rawState, opts = {}) {
  const inner = buildAvatarSvgInner(rawState, opts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 580">${inner}</svg>`;
}
