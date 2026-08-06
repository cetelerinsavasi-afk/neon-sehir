import { useEffect, useState } from 'react';
import { listFutbolClubs } from '../../services/gameActions';
import FutbolCrest from './FutbolCrest';
import './FutbolKulupler.css';

export default function FutbolKulupler({ leagueId }) {
  const [clubs, setClubs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!leagueId) return;
    setClubs(null);
    setError('');
    listFutbolClubs(leagueId)
      .then((res) => setClubs(res?.data?.clubs || []))
      .catch(() => setError('Kulüpler yüklenemedi.'));
  }, [leagueId]);

  if (error) return <p className="futbol-admin-error">{error}</p>;
  if (clubs === null) return <p className="futbol-placeholder">Yükleniyor...</p>;

  return (
    <div className="futbol-kulupler-list">
      {clubs.map((c) => (
        <div key={c.id} className="futbol-kulup-row">
          <FutbolCrest logo={c.logo} initials={c.name?.[0]} size={44} />
          <div className="futbol-kulup-info">
            <p className="futbol-kulup-name">{c.name}</p>
            <p className="futbol-buy-meta">
              Başkan: {c.chairman} {c.isBot && <span className="futbol-kulup-bot-tag">Bot</span>}
            </p>
            <p className="futbol-buy-meta">{c.fans.toLocaleString('tr-TR')} taraftar</p>
          </div>
          <p className="futbol-kulup-value">{c.value.toLocaleString('tr-TR')} altın</p>
        </div>
      ))}
    </div>
  );
}
