// =============================================================================
// v223 — SkateImg: kaykayın kart görseli (Arabalarım ve Profil › Araçların › Motor).
// Araç kartlarındaki 3D kareyle aynı oranda (16:10) ve aynı zeminde; çizim olduğu için
// hazırlanmayı beklemez. <img> olarak döner: CarImg ile aynı sınıfları alır.
// =============================================================================
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4c4b0"/><stop offset="1" stop-color="#b9a48d"/></linearGradient>
<linearGradient id="dk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b1fa8"/><stop offset=".5" stop-color="#8a3ae6"/><stop offset="1" stop-color="#5b1fa8"/></linearGradient>
<radialGradient id="wh" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd2d6"/></radialGradient>
</defs>
<rect width="320" height="200" fill="url(#bg)"/>
<ellipse cx="160" cy="160" rx="128" ry="14" fill="#000" opacity=".18"/>
<g transform="rotate(-8 160 110)">
<rect x="34" y="96" width="252" height="26" rx="13" fill="#1b1d22"/>
<rect x="40" y="92" width="240" height="24" rx="12" fill="url(#dk)"/>
<rect x="70" y="98" width="180" height="12" rx="6" fill="#19e8ff" opacity=".35"/>
<path d="M120 104 l12 -6 l8 10 l12 -10 l10 8" stroke="#ffd23f" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="74" y="120" width="44" height="8" rx="3" fill="#aeb3bb"/>
<rect x="202" y="120" width="44" height="8" rx="3" fill="#aeb3bb"/>
<circle cx="80" cy="138" r="13" fill="url(#wh)" stroke="#9aa0a8" stroke-width="2"/>
<circle cx="112" cy="138" r="13" fill="url(#wh)" stroke="#9aa0a8" stroke-width="2"/>
<circle cx="208" cy="138" r="13" fill="url(#wh)" stroke="#9aa0a8" stroke-width="2"/>
<circle cx="240" cy="138" r="13" fill="url(#wh)" stroke="#9aa0a8" stroke-width="2"/>
<circle cx="80" cy="138" r="4" fill="#7a7f87"/><circle cx="112" cy="138" r="4" fill="#7a7f87"/>
<circle cx="208" cy="138" r="4" fill="#7a7f87"/><circle cx="240" cy="138" r="4" fill="#7a7f87"/>
</g>
</svg>`;
const SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;

export default function SkateImg({ className = '', alt = 'Kaykay', ...rest }) {
  return <img className={className} src={SRC} alt={alt} draggable={false} {...rest} />;
}
