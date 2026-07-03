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

export const AVATAR_OPTIONS = {
  gender: ['erkek', 'kadin'],
  build: ['zayif', 'standart', 'iri'],
  hairStyle: ['kel', 'short', 'slick', 'wavy', 'long', 'mohawk', 'afro', 'bun', 'braids', 'undercut'],
  facialHair: ['none', 'mustache', 'goatee', 'short', 'full', 'sideburns', 'vandyke'],
  faceAcc: ['none', 'sunglasses', 'scar', 'cigar', 'eyepatch', 'mask', 'monocle'],
  earring: ['yok', 'sol', 'sag', 'cift'],
  tattoo: ['yok', 'gozyasi', 'yildiz', 'boyunsembol', 'boyunyazi'],
  clothing: ['suit', 'tuxedo', 'leather', 'hawaii', 'jumpsuit', 'hoodie', 'police', 'vest'],
  neckAcc: ['none', 'tie', 'bow', 'chain', 'scarf', 'dogtag'],
  hat: ['none', 'fedora', 'beret', 'bandana', 'cap', 'crown', 'tophat', 'hoodup', 'helmet', 'policecap'],
  heldItem: ['yok', 'tabanca', 'bicak', 'sopa', 'para', 'canta'],
};

export const DEFAULT_AVATAR = {
  gender: 'erkek', build: 'standart', skin: '#c68863', eyeColor: '#3b2a1a',
  hairStyle: 'short', hairColor: '#2b2118',
  facialHair: 'none', faceAcc: 'none', earring: 'yok', tattoo: 'yok',
  clothing: 'suit', clothColor: '#22262f', neckAcc: 'tie',
  hat: 'none', hatColor: '#0d0d0d', heldItem: 'yok',
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
  const rx = s.gender === 'kadin' ? 54 : 58;
  const ry = s.gender === 'kadin' ? 64 : 66;
  return `<ellipse cx="160" cy="170" rx="${rx}" ry="${ry}" fill="${s.skin}"/>`;
}

function earsShape(s) {
  return `<ellipse cx="102" cy="176" rx="9" ry="14" fill="${s.skin}"/>
          <ellipse cx="218" cy="176" rx="9" ry="14" fill="${s.skin}"/>`;
}

function neckShape(s) {
  return `<rect x="140" y="222" width="40" height="52" rx="8" fill="${s.skin}"/>`;
}

function faceFeatures(s) {
  const shade = shadeColor(s.skin, -30);
  return `
    <rect x="126" y="149" width="24" height="6" rx="3" fill="${s.hairColor}" transform="rotate(-4 138 152)"/>
    <rect x="170" y="149" width="24" height="6" rx="3" fill="${s.hairColor}" transform="rotate(4 182 152)"/>
    <ellipse cx="138" cy="169" rx="10" ry="6.5" fill="#f4f1e8"/>
    <ellipse cx="182" cy="169" rx="10" ry="6.5" fill="#f4f1e8"/>
    <circle cx="138" cy="169" r="4.2" fill="${s.eyeColor}"/>
    <circle cx="182" cy="169" r="4.2" fill="${s.eyeColor}"/>
    <path d="M158,173 Q154,186 150,191" stroke="${shade}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M141,207 Q160,214 179,207" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
  `;
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
    default:
      return '';
  }
}

function torsoShape(s) {
  const c = s.clothColor;
  const dark = shadeColor(c, -25);
  const light = shadeColor(c, 25);
  const B =
    s.build === 'zayif'
      ? { tl: 98, tr: 222, bl: 64, br: 256, ty: 264 }
      : s.build === 'iri'
        ? { tl: 50, tr: 270, bl: 2, br: 318, ty: 258 }
        : { tl: 70, tr: 250, bl: 12, br: 308, ty: 262 };
  let base = `<path d="M${B.tl},${B.ty} L${B.tr},${B.ty} L${B.br},400 L${B.bl},400 Z" fill="${c}"/>`;
  let details = '';
  switch (s.clothing) {
    case 'suit':
      details = `
        <path d="M120,262 L156,262 L142,304 Z" fill="${dark}"/>
        <path d="M200,262 L164,262 L178,304 Z" fill="${dark}"/>
        <path d="M142,262 L160,282 L178,262 L170,255 L160,270 L150,255 Z" fill="#f2efe4"/>`;
      break;
    case 'tuxedo':
      base = `<path d="M${B.tl},${B.ty} L${B.tr},${B.ty} L${B.br},400 L${B.bl},400 Z" fill="#0d0d0d"/>`;
      details = `
        <path d="M120,262 L156,262 L142,304 Z" fill="${c}"/>
        <path d="M200,262 L164,262 L178,304 Z" fill="${c}"/>
        <path d="M142,262 L160,282 L178,262 L170,255 L160,270 L150,255 Z" fill="#f2efe4"/>`;
      break;
    case 'leather':
      details = `
        <line x1="160" y1="264" x2="160" y2="398" stroke="#111" stroke-width="2" stroke-dasharray="3,4"/>
        <path d="M128,262 L146,262 L134,240 Z" fill="${light}"/>
        <path d="M192,262 L174,262 L186,240 Z" fill="${light}"/>`;
      break;
    case 'hawaii':
      details = `
        <path d="M140,262 L160,290 L180,262 L165,262 L160,278 L155,262 Z" fill="${s.skin}"/>
        <circle cx="100" cy="300" r="4" fill="${light}"/><circle cx="130" cy="340" r="4" fill="${light}"/>
        <circle cx="190" cy="310" r="4" fill="${light}"/><circle cx="220" cy="350" r="4" fill="${light}"/>
        <circle cx="160" cy="360" r="4" fill="${light}"/>`;
      break;
    case 'jumpsuit':
      details = `
        <line x1="160" y1="264" x2="160" y2="398" stroke="${dark}" stroke-width="3"/>
        <rect x="90" y="300" width="24" height="18" rx="2" fill="${dark}"/>
        <rect x="206" y="300" width="24" height="18" rx="2" fill="${dark}"/>
        <rect x="140" y="272" width="40" height="14" rx="2" fill="#f2efe4" opacity="0.85"/>`;
      break;
    case 'hoodie':
      details = `
        <path d="M120,262 Q160,282 200,262 L200,272 Q160,296 120,272 Z" fill="${dark}"/>
        <path d="M148,266 L152,320 M172,266 L168,320" stroke="${dark}" stroke-width="3"/>
        <circle cx="150" cy="322" r="3" fill="${light}"/><circle cx="170" cy="322" r="3" fill="${light}"/>`;
      break;
    case 'police':
      base = `<path d="M${B.tl},${B.ty} L${B.tr},${B.ty} L${B.br},400 L${B.bl},400 Z" fill="#1d3557"/>`;
      details = `
        <path d="M120,262 L156,262 L142,300 Z" fill="#14263f"/>
        <path d="M200,262 L164,262 L178,300 Z" fill="#14263f"/>
        <path d="M142,262 L160,282 L178,262 L170,255 L160,270 L150,255 Z" fill="#e8e6df"/>
        <rect x="104" y="284" width="16" height="16" rx="2" fill="#d4af37"/>
        <circle cx="112" cy="292" r="5" fill="#1d3557"/>`;
      break;
    case 'vest':
      details = `
        <path d="M122,262 L156,262 L156,340 L122,332 Z" fill="${dark}"/>
        <path d="M198,262 L164,262 L164,340 L198,332 Z" fill="${dark}"/>
        <rect x="142" y="270" width="36" height="70" fill="#e8e6df" opacity="0.9"/>`;
      break;
    default:
      break;
  }
  return base + details;
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
    default:
      return '';
  }
}

// buildAvatarSvgInner — tüm parçaları birleştirip <svg> içine konacak
// markup'ı üretir.
export function buildAvatarSvgInner(rawState) {
  const s = { ...DEFAULT_AVATAR, ...rawState };
  let svg = '';
  svg += `<ellipse cx="160" cy="392" rx="120" ry="14" fill="#000" opacity="0.35"/>`;
  svg += torsoShape(s);
  svg += heldItemShape(s);
  svg += neckAccShape(s);
  svg += hairBackShape(s);
  svg += neckShape(s);
  svg += headShape(s);
  svg += earsShape(s);
  svg += earringShape(s);
  svg += faceFeatures(s);
  svg += tattooShape(s);
  svg += facialHairShape(s);
  svg += hairFrontShape(s);
  svg += hatShape(s);
  svg += faceAccShape(s);
  return svg;
}
