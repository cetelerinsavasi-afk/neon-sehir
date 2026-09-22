import './BroadcastFrame.css';

// BroadcastFrame — ORTAK "TV röportajı" görsel çerçevesi: "CANLI" rozeti,
// REC sayacı, alt üçüncü (lower third) altyazı bar'ı ve video ilerleme
// çubuğu. Hem Sixtagram röportaj videosu (madde 1) HEM DE TV uygulamasının
// 3 kanalı (madde 3) bu AYNI bileşeni kullanır — aynı görsel dil iki yerde
// ayrı ayrı YAZILMADI.
//
// `children` — arka plan + konuşan avatar (canvas/SVG karışımı, çağıran
// bileşen kurar); bu bileşen sadece ÜSTÜNE bindirilen TV çerçevesi/HUD'u
// sağlar.
function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function BroadcastFrame({
  children,
  subtitle,
  kicker,
  progress = 0,
  elapsedSec = 0,
  muted = true,
  onToggleMute,
  liveLabel = 'CANLI',
}) {
  return (
    <div className="bcast-frame">
      <div className="bcast-visual">{children}</div>

      <div className="bcast-top-row">
        <span className="bcast-live-badge">
          <span className="bcast-live-dot" /> {liveLabel}
        </span>
        <span className="bcast-rec-counter">
          <span className="bcast-rec-dot" /> REC {formatClock(elapsedSec)}
        </span>
      </div>

      {onToggleMute && (
        <button
          type="button"
          className="bcast-mute-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}

      <div className="bcast-lower-third">
        {kicker && <p className="bcast-kicker">{kicker}</p>}
        {subtitle && <p className="bcast-subtitle">{subtitle}</p>}
      </div>

      <div className="bcast-progress-track">
        <div className="bcast-progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>
    </div>
  );
}
