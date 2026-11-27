// v176 — Neon Borsa: seyyar satıcıların profil resimleri (çizim SVG, dış görsel yok)
export const VENDOR_LOOK = {
  seyyar: { c: '#ffb347', bg: '#33200a' }, // v219: 6 tezgâh tek hisse
  kokorecci: { c: '#ff8a3d', bg: '#3a1d0e' },
  simitci: { c: '#ffc845', bg: '#3a2a0a' },
  donerci: { c: '#5cc8ff', bg: '#0b2a3d' },
  kofteci: { c: '#ff5a6e', bg: '#3a0e16' },
  midyeci: { c: '#b38cff', bg: '#22153d' },
  dondurmaci: { c: '#7df0c0', bg: '#0d3326' },
  // v177 şirketler
  hastane: { c: '#ff5470', bg: '#2e0d16' },
  nakliye: { c: '#ffb13d', bg: '#33220a' },
  terminal: { c: '#4dd0ff', bg: '#0a2533' },
  taksi: { c: '#ffd60a', bg: '#2e2a06' },
  // v196 mekânlar
  mk_silahci: { c: '#3ad6ff', bg: '#0a1f2a' },
  mk_galeri: { c: '#ff2e5a', bg: '#2e0a14' },
  mk_motogaleri: { c: '#ff8a1e', bg: '#2e1a06' },
  mk_modifiye: { c: '#7cff6b', bg: '#0f2a0c' },
  mk_spor: { c: '#ff4fd8', bg: '#2a0a26' },
  mk_cafe: { c: '#d9a066', bg: '#2a1a0c' },
  mk_bar: { c: '#ffab4a', bg: '#2e1a08' },
  mk_internet: { c: '#b56bff', bg: '#1c0d33' },
  mk_tamirci: { c: '#ffc21a', bg: '#2a2206' }, // v198
};

function Art({ id }) {
  switch (id) {
    case 'seyyar':
      return (
        <>
          <path d="M14 30h52l-4-10H18z" fill="#ff5a6e" />
          <path d="M22 20l-3 10M32 20l-1 10M42 20v10M52 20l1 10M62 20l3 10" stroke="#fff3e0" strokeWidth="3" />
          <rect x="18" y="30" width="44" height="22" rx="3" fill="#ffc845" />
          <rect x="22" y="34" width="36" height="8" rx="2" fill="#3a2a0a" />
          <circle cx="30" cy="38" r="2.6" fill="#ff8a3d" />
          <circle cx="40" cy="38" r="2.6" fill="#f2a65a" />
          <circle cx="50" cy="38" r="2.6" fill="#7df0c0" />
          <circle cx="26" cy="58" r="6" fill="#222" />
          <circle cx="54" cy="58" r="6" fill="#222" />
          <circle cx="26" cy="58" r="2.4" fill="#aaa" />
          <circle cx="54" cy="58" r="2.4" fill="#aaa" />
        </>
      );
    case 'kokorecci':
      return (
        <>
          <rect x="10" y="44" width="60" height="6" rx="3" fill="#cfd6df" />
          <rect x="16" y="30" width="48" height="18" rx="9" fill="#a8551f" />
          <path d="M22 32v14M30 31v16M38 30v18M46 30v18M54 31v16" stroke="#7a3510" strokeWidth="3" />
          <rect x="18" y="52" width="44" height="10" rx="5" fill="#e8b96a" />
          <path d="M24 20q4-6 0-10M40 20q4-6 0-10M56 20q4-6 0-10" stroke="#ffffff80" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      );
    case 'simitci':
      return (
        <>
          <circle cx="40" cy="42" r="21" fill="none" stroke="#c97a2a" strokeWidth="13" />
          <circle cx="40" cy="42" r="21" fill="none" stroke="#e39a45" strokeWidth="7" />
          <g fill="#fff3d6">
            {[
              [24, 36],
              [31, 25],
              [45, 23],
              [56, 32],
              [58, 47],
              [49, 59],
              [33, 60],
              [22, 50],
            ].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />
            ))}
          </g>
        </>
      );
    case 'donerci':
      return (
        <>
          <path d="M12 50q28-26 50-6l8-8v20l-8-8q-22 20-50-6z" fill="#7fb2d6" />
          <path d="M12 50q28-26 50-6q-22 20-50-6z" fill="#a9d4ef" />
          <circle cx="22" cy="47" r="2.6" fill="#0b2a3d" />
          <path d="M34 40v12M42 38v16M50 39v14" stroke="#5d8fb3" strokeWidth="2" />
          <path d="M8 60q32 14 64 0v6q-32 12-64 0z" fill="#e6b06a" />
        </>
      );
    case 'kofteci':
      return (
        <>
          <ellipse cx="40" cy="54" rx="30" ry="9" fill="#e9eef5" />
          <ellipse cx="40" cy="52" rx="24" ry="6" fill="#cfd6df" />
          <g fill="#8a3b1c">
            <ellipse cx="28" cy="46" rx="9" ry="6" />
            <ellipse cx="44" cy="44" rx="9" ry="6" />
            <ellipse cx="54" cy="49" rx="8" ry="5" />
          </g>
          <path d="M22 44h12M38 42h12M48 47h10" stroke="#5c2410" strokeWidth="2" />
          <path d="M58 30l6-8M54 28l2-9" stroke="#3ddc84" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'midyeci':
      return (
        <>
          <path d="M14 48q8-30 32-30 18 0 20 18-6 24-36 24-14 0-16-12z" fill="#2b2140" />
          <path d="M20 46q8-20 26-22 12 0 14 12-6 16-28 18-10 0-12-8z" fill="#f2a65a" />
          <path d="M26 44q10-6 24-8" stroke="#ffd29a" strokeWidth="3" fill="none" />
          <circle cx="62" cy="56" r="10" fill="#f5e663" />
          <path d="M62 46v20M52 56h20" stroke="#d8c43a" strokeWidth="2" />
        </>
      );
    case 'dondurmaci':
      return (
        <>
          <path d="M28 42l12 32 12-32z" fill="#e0a356" />
          <path d="M30 46l18 8M32 54l14 6M29 44l20 2" stroke="#b9772f" strokeWidth="2" />
          <circle cx="33" cy="36" r="10" fill="#ff9ec4" />
          <circle cx="47" cy="36" r="10" fill="#fff3e0" />
          <circle cx="40" cy="25" r="10" fill="#7a4a2a" />
          <circle cx="42" cy="16" r="3" fill="#ff3b3b" />
        </>
      );
    case 'hastane':
      return (
        <>
          <rect x="16" y="22" width="48" height="44" rx="4" fill="#f1f4f8" />
          <rect x="16" y="22" width="48" height="8" rx="3" fill="#ff5470" />
          <path d="M40 36v20M30 46h20" stroke="#ff2d55" strokeWidth="7" strokeLinecap="round" />
          <rect x="35" y="58" width="10" height="8" fill="#8a95a5" />
        </>
      );
    case 'nakliye':
      return (
        <>
          <rect x="8" y="30" width="40" height="24" rx="2" fill="#ffb13d" />
          <path d="M48 36h12l10 10v8H48z" fill="#e8eef5" />
          <rect x="54" y="39" width="8" height="6" rx="1" fill="#33220a" />
          <path d="M14 38h28M14 45h28" stroke="#c97f14" strokeWidth="2" />
          <circle cx="20" cy="58" r="6" fill="#222" />
          <circle cx="60" cy="58" r="6" fill="#222" />
          <circle cx="20" cy="58" r="2.4" fill="#aaa" />
          <circle cx="60" cy="58" r="2.4" fill="#aaa" />
        </>
      );
    case 'terminal':
      return (
        <>
          <rect x="10" y="22" width="60" height="34" rx="7" fill="#4dd0ff" />
          <rect x="15" y="27" width="11" height="12" rx="2" fill="#0a2533" />
          <rect x="29" y="27" width="11" height="12" rx="2" fill="#0a2533" />
          <rect x="43" y="27" width="11" height="12" rx="2" fill="#0a2533" />
          <rect x="57" y="27" width="8" height="18" rx="2" fill="#0a2533" />
          <path d="M10 46h47" stroke="#e8f8ff" strokeWidth="3" />
          <circle cx="22" cy="58" r="6" fill="#222" />
          <circle cx="58" cy="58" r="6" fill="#222" />
        </>
      );
    case 'taksi':
      return (
        <>
          <rect x="31" y="16" width="18" height="7" rx="2" fill="#1a1a1a" />
          <path d="M14 46l7-16h38l7 16z" fill="#ffd60a" />
          <path d="M24 32h13v12H20zM43 32h13l4 12H43z" fill="#2e2a06" />
          <rect x="10" y="44" width="60" height="12" rx="4" fill="#ffd60a" />
          <path d="M10 50h60" stroke="#1a1a1a" strokeWidth="3" strokeDasharray="4 4" />
          <circle cx="24" cy="58" r="6" fill="#222" />
          <circle cx="56" cy="58" r="6" fill="#222" />
        </>
      );
    // ── v196 mekân hisseleri ────────────────────────────────────────
    case 'mk_silahci':
      return (
        <>
          <path d="M12 34h44l4-4h10v8l-14 4-4 8h-8l-2 14H30l4-14H12z" fill="#2c3440" />
          <path d="M12 34h44l4-4h10v8l-14 4" fill="none" stroke="#3ad6ff" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="18" y="38" width="20" height="3" rx="1.5" fill="#3ad6ff" opacity=".7" />
        </>
      );
    case 'mk_galeri':
      return (
        <>
          <path d="M10 50l8-14q4-6 12-6h20q8 0 12 6l8 14v8H10z" fill="#ff2e5a" />
          <path d="M24 36h32l6 10H18z" fill="#ffd0da" opacity=".85" />
          <circle cx="24" cy="58" r="7" fill="#1a1a1f" />
          <circle cx="56" cy="58" r="7" fill="#1a1a1f" />
          <circle cx="24" cy="58" r="3" fill="#cfd6df" />
          <circle cx="56" cy="58" r="3" fill="#cfd6df" />
        </>
      );
    case 'mk_motogaleri':
      return (
        <>
          <circle cx="20" cy="54" r="10" fill="none" stroke="#1a1a1f" strokeWidth="5" />
          <circle cx="60" cy="54" r="10" fill="none" stroke="#1a1a1f" strokeWidth="5" />
          <path d="M20 54l14-16h14l12 16M36 38l-4-8h10" fill="none" stroke="#ff8a1e" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M40 40h14l4 6H44z" fill="#ff8a1e" />
        </>
      );
    case 'mk_modifiye':
      return (
        <>
          <path d="M22 18a12 12 0 0 0 4 20L48 60a6 6 0 1 0 8-8L34 30a12 12 0 0 0-20-4l8 8-4 4-8-8" fill="#cfd6df" />
          <circle cx="52" cy="56" r="3" fill="#0f2a0c" />
          <path d="M50 18l12 12M56 14l10 10" stroke="#7cff6b" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'mk_spor':
      return (
        <>
          <rect x="14" y="36" width="52" height="8" rx="4" fill="#cfd6df" />
          <rect x="10" y="26" width="8" height="28" rx="3" fill="#ff4fd8" />
          <rect x="18" y="30" width="6" height="20" rx="2" fill="#ff4fd8" opacity=".8" />
          <rect x="62" y="26" width="8" height="28" rx="3" fill="#ff4fd8" />
          <rect x="56" y="30" width="6" height="20" rx="2" fill="#ff4fd8" opacity=".8" />
        </>
      );
    case 'mk_cafe':
      return (
        <>
          <path d="M18 36h36v12q0 14-18 14T18 48z" fill="#f4efe6" />
          <path d="M54 40h4q8 0 8 7t-8 7h-5" fill="none" stroke="#f4efe6" strokeWidth="4" />
          <ellipse cx="36" cy="37" rx="17" ry="4" fill="#6b4226" />
          <path d="M28 28q4-6 0-12M38 28q4-6 0-12M48 28q4-6 0-12" stroke="#ffffff99" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="38" cy="66" rx="26" ry="4" fill="#d9a066" opacity=".6" />
        </>
      );
    case 'mk_bar':
      return (
        <>
          <path d="M18 18h44L42 42v18h10v4H28v-4h10V42z" fill="#ffe2b8" opacity=".9" />
          <path d="M24 24h32L42 38h-4z" fill="#ffab4a" />
          <circle cx="54" cy="22" r="5" fill="#7cff6b" />
          <path d="M50 14l8 10" stroke="#5c3a1e" strokeWidth="2" />
        </>
      );
    case 'mk_internet':
      return (
        <>
          <rect x="12" y="18" width="56" height="36" rx="4" fill="#1a1a2e" stroke="#b56bff" strokeWidth="3" />
          <path d="M22 44l10-12 8 8 10-14 8 18" fill="none" stroke="#b56bff" strokeWidth="3" strokeLinejoin="round" />
          <rect x="34" y="56" width="12" height="6" fill="#cfd6df" />
          <rect x="24" y="62" width="32" height="4" rx="2" fill="#cfd6df" />
        </>
      );
    case 'mk_tamirci': // v198: lastik + anahtar
      return (
        <>
          <circle cx="34" cy="44" r="20" fill="#1a1a1f" />
          <circle cx="34" cy="44" r="11" fill="#5d6066" />
          <circle cx="34" cy="44" r="4" fill="#cfd6df" />
          <path d="M48 20l6-6 4 4-3 3 6 6 3-3 4 4-6 6-6-2-12 12-4-4 12-12z" fill="#ffc21a" />
        </>
      );
    default:
      return null;
  }
}

export function VendorAvatar({ id, size = 46 }) {
  const look = VENDOR_LOOK[id] || { c: '#19e8ff', bg: '#102030' };
  return (
    <span className="borsa-av" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <rect width="80" height="80" fill={look.bg} />
        <circle cx="40" cy="40" r="34" fill={look.c} opacity=".18" />
        <Art id={id} />
      </svg>
    </span>
  );
}
