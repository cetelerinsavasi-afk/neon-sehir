import { useEffect, useState } from 'react';
import { getFutbolTeamDetail } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import './FutbolTeamDetail.css';

// FutbolTeamDetail — puan tablosunda bir takıma tıklandığında açılan
// küçük bilgi kartı: logo, başkan (oyuncuya aitse adı, botsa "Bot
// Yönetimi") ve güncel takım değeri.
export default function FutbolTeamDetail({ teamId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError('');
    getFutbolTeamDetail(teamId)
      .then((res) => {
        if (!cancelled) setDetail(res?.data?.team || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Takım bilgisi yüklenemedi.');
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <div className="futbol-match-backdrop" onClick={onClose}>
      <div className="futbol-team-detail" onClick={(e) => e.stopPropagation()}>
        <button className="futbol-match-close" onClick={onClose}>
          ✕
        </button>

        {error && <p className="futbol-admin-error">{error}</p>}
        {!error && !detail && <p className="futbol-placeholder">Yükleniyor...</p>}

        {detail && (
          <>
            <div className="futbol-team-detail-header">
              <FutbolCrest logo={detail.logo} initials={detail.name?.[0]} size={64} />
              <p className="futbol-team-detail-name">{detail.name}</p>
              <p className="futbol-team-detail-tier">{detail.tier}. Lig</p>
            </div>
            <div className="futbol-team-detail-rows">
              <div className="futbol-team-detail-row">
                <span>Başkan</span>
                <strong>
                  {detail.chairman} {detail.isBot && <span className="futbol-kulup-bot-tag">Bot</span>}
                </strong>
              </div>
              <div className="futbol-team-detail-row">
                <span>Takım Değeri</span>
                <strong>{detail.value.toLocaleString('tr-TR')} altın</strong>
              </div>
              <div className="futbol-team-detail-row">
                <span>Taraftar</span>
                <strong>{detail.fans.toLocaleString('tr-TR')}</strong>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
