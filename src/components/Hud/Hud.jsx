import InfoIcon from '../InfoIcon/InfoIcon';
import { useAuth } from '../../contexts/AuthContext';
import './Hud.css';

/**
 * Hud — Bölüm 3'teki üst bar. Faz 1'de mock veriyle çalışır,
 * Faz 4'te gerçek Firestore verisine bağlanacak.
 *
 * Giriş yapmamış (misafir) oyuncular için, saygınlık/şüphe/altın
 * bilgilerinin yanına kalıcı bir "Google ile Giriş Yap" çağrısı eklenir —
 * bu bar her ekranda (harita + tüm mekanlar) göründüğü için üyeliği teşvik
 * etmenin en görünür yeri. Giriş yapmış oyuncular için HUD önceki haliyle
 * birebir aynıdır (ek buton render edilmez).
 */
export default function Hud({ suspicion = 0, reputation = 0, gold = 0, onGoldClick }) {
  const { user, loading, signIn } = useAuth();

  return (
    <div className="hud">
      <div className="hud-stat">
        <div className="hud-stat-label">
          <span>
            Şüphe
            <InfoIcon text="Şüphe yüzdeniz = suç işlerken yakalanma riskiniz." />
          </span>
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
          <span>
            Saygınlık
            <InfoIcon text="Saygınlık yüzdeniz = ekip soygunlarında içeriye polis sızdıysa esnafların sizi uyarma şansı." />
          </span>
          <span>{reputation}%</span>
        </div>
        <div className="hud-bar">
          <div
            className="hud-bar-fill hud-bar-reputation"
            style={{ width: `${reputation}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        className="hud-gold hud-gold-btn"
        onClick={onGoldClick}
        title="Altın Mağazası'nı aç"
      >
        <span className="hud-gold-icon">●</span>
        <span>{gold.toLocaleString('tr-TR')}</span>
      </button>

      {!loading && !user && (
        <button
          type="button"
          className="hud-signin hud-signin-btn"
          onClick={signIn}
          title="Google ile Giriş Yap"
        >
          <span className="hud-signin-icon">G</span>
          <span className="hud-signin-label">Giriş Yap</span>
        </button>
      )}
    </div>
  );
}
