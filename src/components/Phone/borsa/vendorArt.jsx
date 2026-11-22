// v176 — Neon Borsa: seyyar satıcıların profil resimleri (çizim SVG, dış görsel yok)
export const VENDOR_LOOK = {
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
};

function Art({ id }) {
  switch (id) {
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
