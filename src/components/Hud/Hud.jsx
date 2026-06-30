import './Hud.css';

/**
 * Hud — Bölüm 3'teki üst bar. Faz 1'de mock veriyle çalışır,
 * Faz 4'te gerçek Firestore verisine bağlanacak.
 */
export default function Hud({ suspicion = 0, reputation = 0, gold = 0 }) {
  return (
    <div className="hud">
      <div className="hud-stat">
        <div className="hud-stat-label">
          <span>Şüphe</span>
          <span>{suspicion}%</span>
        </div>
        <div className="hud-bar">
          <div
            className="hud-bar-fill hud-bar-suspicion"
            style={{ width: `${suspicion}%` }}
          />
        </div>
      </div>

      <div className="hud-stat">
        <div className="hud-stat-label">
          <span>Saygınlık</span>
          <span>{reputation}%</span>
        </div>
        <div className="hud-bar">
          <div
            className="hud-bar-fill hud-bar-reputation"
            style={{ width: `${reputation}%` }}
          />
        </div>
      </div>

      <div className="hud-gold">
        <span className="hud-gold-icon">●</span>
        <span>{gold.toLocaleString('tr-TR')}</span>
      </div>
    </div>
  );
}
