// =============================================================================
// v135 — Mekânlardaki sağ buton sütunu için özel çizim ikonlar (emoji yerine).
// Altın çizgi + koyu cam gövde temasıyla uyumlu; her ikon kendi degradesini taşır.
// =============================================================================
const G = ({ id, a = '#ffe6a3', b = '#d4af37', c = '#9a7419' }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} />
      <stop offset="0.55" stopColor={b} />
      <stop offset="1" stopColor={c} />
    </linearGradient>
  </defs>
);

// Hareketler: dans eden figür + hareket çizgileri
export function IcEmotes() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <G id="sie" />
      <circle cx="17.5" cy="6.2" r="3.2" fill="url(#sie)" />
      <path d="M16.6 10.4c-1.6.2-2.7 1.3-3.3 2.7l-1.6 4.2-3.8 1.6a1.3 1.3 0 0 0 1 2.4l4.3-1.8c.4-.2.7-.5.9-.9l.7-1.8.9 3.6-2.7 6.1a1.4 1.4 0 0 0 2.6 1.1l2.9-6.6c.1-.3.1-.6.1-.9l-.4-1.7 2.6 2.2.9 5.6a1.4 1.4 0 0 0 2.8-.4l-1-6.2c0-.3-.2-.6-.5-.8l-3-2.6.8-3.1 1.6 1.5c.3.3.7.4 1.1.4l3.9-.2a1.3 1.3 0 0 0-.1-2.6l-3.4.1-2.4-2.3c-.8-.7-1.7-1.1-2.8-.9Z" fill="url(#sie)" />
      <path d="M5 9.5c1.2-1.1 2.6-1.6 4-1.6M4 13.6c.9-.5 1.8-.7 2.7-.6M25.5 25.5c1.2.5 2.4.5 3.5 0" stroke="#ffe6a3" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity=".75" />
      <path d="m26.5 4.5.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z" fill="#fff4cf" />
    </svg>
  );
}

// Odadakiler: önde biri, arkada iki kişi
export function IcPeople() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <G id="sip" />
      <G id="sip2" a="#c9a64a" b="#8f7124" c="#5e4a17" />
      <circle cx="8.6" cy="11.4" r="3.3" fill="url(#sip2)" />
      <path d="M2.5 23.5c0-3.5 2.7-6.3 6.1-6.3 1.5 0 2.9.5 3.9 1.4-1.6 1.4-2.6 3.2-2.8 4.9Z" fill="url(#sip2)" />
      <circle cx="23.4" cy="11.4" r="3.3" fill="url(#sip2)" />
      <path d="M29.5 23.5c0-3.5-2.7-6.3-6.1-6.3-1.5 0-2.9.5-3.9 1.4 1.6 1.4 2.6 3.2 2.8 4.9Z" fill="url(#sip2)" />
      <circle cx="16" cy="10.2" r="4.4" fill="url(#sip)" stroke="#1b1b1b" strokeWidth="1" />
      <path d="M8.6 26.5c0-4.6 3.3-8.3 7.4-8.3s7.4 3.7 7.4 8.3Z" fill="url(#sip)" stroke="#1b1b1b" strokeWidth="1" />
    </svg>
  );
}

// ChatsApp: iki konuşma balonu
export function IcChat() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <G id="sic" />
      <G id="sic2" a="#c9a64a" b="#8f7124" c="#5e4a17" />
      <path d="M19 9.5h7.3a3 3 0 0 1 3 3v6.2a3 3 0 0 1-3 3h-.8v3.1l-3.6-3.1H19a3 3 0 0 1-3-3V12.5a3 3 0 0 1 3-3Z" fill="url(#sic2)" />
      <path d="M6 4.5h12.5a3.5 3.5 0 0 1 3.5 3.5v7.5a3.5 3.5 0 0 1-3.5 3.5h-6.6L7 23.3V19H6a3.5 3.5 0 0 1-3.5-3.5V8A3.5 3.5 0 0 1 6 4.5Z" fill="url(#sic)" stroke="#1b1b1b" strokeWidth="1" />
      <circle cx="8" cy="11.8" r="1.4" fill="#2a2108" />
      <circle cx="12.2" cy="11.8" r="1.4" fill="#2a2108" />
      <circle cx="16.4" cy="11.8" r="1.4" fill="#2a2108" />
    </svg>
  );
}

// Telefon: akıllı telefon, ekranında uygulama kareleri
export function IcPhone() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <G id="sif" />
      <rect x="8.5" y="2.5" width="15" height="27" rx="3.6" fill="url(#sif)" stroke="#1b1b1b" strokeWidth="1" />
      <rect x="10.4" y="5.6" width="11.2" height="19.6" rx="1.6" fill="#141414" />
      <rect x="13.6" y="3.6" width="4.8" height="1.1" rx=".55" fill="#2a2108" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={11.8 + c * 3.3} y={7.4 + r * 3.4} width="2.4" height="2.4" rx=".7" fill={['#ff2e8c', '#19e8ff', '#ffd23f'][(r + c) % 3]} opacity=".9" />)
      )}
      <rect x="13.4" y="22.4" width="5.2" height="1" rx=".5" fill="#d4af37" opacity=".7" />
    </svg>
  );
}

// Kamera: gövde, mercek halkaları, flaş
export function IcCamera() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <G id="sik" />
      <defs>
        <radialGradient id="sikl" cx=".38" cy=".35" r=".7">
          <stop offset="0" stopColor="#7fd7ff" />
          <stop offset=".45" stopColor="#1d4f91" />
          <stop offset="1" stopColor="#0a0f1c" />
        </radialGradient>
      </defs>
      <path d="M11.2 6.5h9.6l1.6 2.8h3.6a3 3 0 0 1 3 3v11.2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V12.3a3 3 0 0 1 3-3h3.6Z" fill="url(#sik)" stroke="#1b1b1b" strokeWidth="1" />
      <circle cx="16" cy="17.6" r="6.6" fill="#1b1b1b" />
      <circle cx="16" cy="17.6" r="5.2" fill="url(#sikl)" />
      <circle cx="14.2" cy="15.8" r="1.4" fill="#fff" opacity=".8" />
      <rect x="23.6" y="11.2" width="3.2" height="2" rx=".8" fill="#fff4cf" />
      <circle cx="7.4" cy="12.4" r="1" fill="#ff3b3b" />
    </svg>
  );
}
