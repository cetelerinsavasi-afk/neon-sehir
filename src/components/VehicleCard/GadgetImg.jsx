// =============================================================================
// v225 — GadgetImg: jetpack ve uçan kaykayın kart görseli (Arabalarım › Motor; ileride mağaza).
// SkateImg ile aynı oran (16:10) ve zemin; çizim olduğu için hazırlanmayı beklemez.
// =============================================================================
const BG = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4c4b0"/><stop offset="1" stop-color="#b9a48d"/></linearGradient>`;

const JET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
<defs>${BG}
<linearGradient id="tk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa1ab"/><stop offset=".45" stop-color="#f2f4f7"/><stop offset="1" stop-color="#8b929c"/></linearGradient>
<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".45" stop-color="#ff9a2e"/><stop offset="1" stop-color="#ff5a1e" stop-opacity="0"/></linearGradient>
</defs>
<rect width="320" height="200" fill="url(#bg)"/>
<ellipse cx="160" cy="182" rx="70" ry="8" fill="#000" opacity=".16"/>
<rect x="118" y="34" width="84" height="104" rx="14" fill="#262a33"/>
<rect x="118" y="62" width="84" height="7" fill="#19e8ff"/>
<rect x="104" y="30" width="38" height="112" rx="19" fill="url(#tk)"/>
<rect x="178" y="30" width="38" height="112" rx="19" fill="url(#tk)"/>
<path d="M110 140 h26 l-4 14 h-18z" fill="#3a3d44"/>
<path d="M184 140 h26 l-4 14 h-18z" fill="#3a3d44"/>
<path d="M114 154 h18 l-9 34z" fill="url(#fl)"/>
<path d="M188 154 h18 l-9 34z" fill="url(#fl)"/>
<circle cx="160" cy="98" r="9" fill="#19e8ff" opacity=".85"/>
</svg>`;

const HOVER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
<defs>${BG}
<linearGradient id="dk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d138a"/><stop offset=".5" stop-color="#7a2ad0"/><stop offset="1" stop-color="#3d138a"/></linearGradient>
<radialGradient id="gl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#19e8ff" stop-opacity=".75"/><stop offset="1" stop-color="#19e8ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="320" height="200" fill="url(#bg)"/>
<ellipse cx="160" cy="166" rx="120" ry="16" fill="url(#gl)"/>
<g transform="rotate(-6 160 104)">
<rect x="36" y="96" width="248" height="26" rx="13" fill="#121419"/>
<rect x="42" y="92" width="236" height="22" rx="11" fill="url(#dk)"/>
<rect x="36" y="114" width="248" height="5" rx="2.5" fill="#19e8ff"/>
<ellipse cx="92" cy="126" rx="22" ry="5" fill="#19e8ff" opacity=".9"/>
<ellipse cx="228" cy="126" rx="22" ry="5" fill="#19e8ff" opacity=".9"/>
<path d="M140 103 l10 -6 l8 9 l10 -9 l10 7" stroke="#ffd23f" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<path d="M78 140 v14 M92 142 v18 M106 140 v14 M214 140 v14 M228 142 v18 M242 140 v14" stroke="#19e8ff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
</svg>`;

const SRC = {
  jet: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(JET)}`,
  hover: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(HOVER)}`,
};

export default function GadgetImg({ kind = 'jet', className = '', alt, ...rest }) {
  return <img className={className} src={SRC[kind] || SRC.jet} alt={alt || (kind === 'hover' ? 'Uçan kaykay' : 'Jetpack')} draggable={false} {...rest} />;
}
