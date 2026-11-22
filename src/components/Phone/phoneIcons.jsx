// v161 — Cappstore ve indirilebilir uygulamaların ikonları (çizgi SVG; renk tone-* sınıfından)
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function PhoneSvgIcon({ id, size = 30 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true };
  if (id === 'cappstore')
    return (
      <svg {...common} {...P}>
        <path d="M4.6 8h14.8l-1.1 11.3a2 2 0 0 1-2 1.7H7.7a2 2 0 0 1-2-1.7L4.6 8z" />
        <path d="M8.8 8V6.6a3.2 3.2 0 0 1 6.4 0V8" />
        <path d="M14.6 12.6a3 3 0 1 0 0 4.3" />
      </svg>
    );
  if (id === 'borsa')
    return (
      <svg {...common} {...P} strokeWidth={2.1}>
        <path d="M3.5 17.5l5.2-5.6 3.8 3.3 7.8-8.4" />
        <path d="M15.2 6.8h5.1v5.1" />
        <path d="M3.5 21h17" />
      </svg>
    );
  if (id === 'fabrika')
    return (
      <svg {...common} {...P}>
        <path d="M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17z" />
        <path d="M7 18h2M12 18h2M17 18h1" />
      </svg>
    );
  if (id === 'isletme')
    return (
      <svg {...common} {...P}>
        <path d="M4.5 11v9h15v-9" />
        <path d="M3 10l2-6h14l2 6" />
        <path d="M3 10a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  if (id === 'futbol')
    return (
      <svg {...common} {...P} strokeWidth={1.8}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.6l3.7 2.7-1.4 4.3H9.7l-1.4-4.3z" />
        <path d="M12 7.6V3.4M15.7 10.3l3.9-1.3M14.3 14.6l2.4 3.4M9.7 14.6l-2.4 3.4M8.3 10.3L4.4 9" />
      </svg>
    );
  if (id === 'belediye')
    return (
      <svg {...common} {...P}>
        <path d="M12 3l8.5 5h-17z" />
        <path d="M5 10.5v7M9.7 10.5v7M14.3 10.5v7M19 10.5v7" />
        <path d="M3 20.5h18" />
      </svg>
    );
  return null;
}
