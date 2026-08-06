import { useId } from 'react';

// Basit bir string hash'i — her oyuncu id'si için HEP AYNI (deterministik)
// ama oyuncular arasında farklı görünen bir avatar üretmek için.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const SKIN_TONES = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
const HAIR_COLORS = ['#2C1B10', '#6B4226', '#1A1A1A', '#B8860B', '#5C4033'];
const HAIR_STYLES = ['short', 'curly', 'bald', 'mohawk', 'long'];

const POSITION_RING = { GK: '#FFD100', DEF: '#3B82F6', MID: '#3ddc84', FWD: '#FF2E8C' };

export default function FutbolPlayerAvatar({ playerId, position, size = 44 }) {
  const clipId = useId();
  const seed = hashString(playerId || 'x');
  const hue = seed % 360;
  const skin = SKIN_TONES[seed % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(seed >> 3) % HAIR_COLORS.length];
  const hairStyle = HAIR_STYLES[(seed >> 5) % HAIR_STYLES.length];
  const ring = POSITION_RING[position] || 'var(--panel-border)';

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="28" />
        </clipPath>
        <linearGradient id={`${clipId}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue}, 45%, 30%)`} />
          <stop offset="100%" stopColor={`hsl(${hue}, 55%, 18%)`} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={ring} />
      <circle cx="32" cy="32" r="28" fill={`url(#${clipId}-bg)`} />
      <g clipPath={`url(#${clipId})`}>
        {/* boyun + gövde */}
        <rect x="18" y="46" width="28" height="20" rx="8" fill={skin} />
        {/* kafa */}
        <circle cx="32" cy="30" r="14" fill={skin} />
        {/* saç */}
        {hairStyle === 'short' && <path d="M18,26 a14,14 0 0 1 28,0 v-4 a14,10 0 0 0 -28,0 Z" fill={hairColor} />}
        {hairStyle === 'curly' && (
          <g fill={hairColor}>
            <circle cx="20" cy="20" r="5" />
            <circle cx="27" cy="16" r="6" />
            <circle cx="36" cy="16" r="6" />
            <circle cx="44" cy="21" r="5" />
          </g>
        )}
        {hairStyle === 'bald' && null}
        {hairStyle === 'mohawk' && <rect x="28" y="12" width="8" height="16" rx="3" fill={hairColor} />}
        {hairStyle === 'long' && (
          <path d="M17,24 a15,16 0 0 1 30,0 v14 h-5 v-10 h-20 v10 h-5 Z" fill={hairColor} />
        )}
        {/* gözler */}
        <circle cx="27" cy="30" r="1.6" fill="#1a1a1a" />
        <circle cx="37" cy="30" r="1.6" fill="#1a1a1a" />
        {/* ağız */}
        <path d="M27,37 Q32,40 37,37" stroke="#7a4a2b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
