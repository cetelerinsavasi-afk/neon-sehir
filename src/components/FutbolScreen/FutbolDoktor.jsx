import { useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { assignFutbolDoctor } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolAltyapi.css';

const FUTBOL_DOCTOR_COST = 5000;

// FutbolDoktor — yeni istek: "kadrosunda sakat oyuncu olan takımlar
// doktor tabından 5000 altın ödeyerek TEK bir oyuncunun iyileşmesini
// hızlandırabilir". Doktor kutusu aynı anda sadece 1 oyuncuyla
// ilgilenebilir (bkz. functions/index.js assignFutbolDoctor) ve HER
// gece 00:00'da kutu boşalır — tedavi görsün görmesin, ertesi gün
// istersen (başka ya da aynı) bir oyuncu için yeniden ödeme yapabilirsin.
// Doktorsuz sakatlık zaten her gece kendiliğinden 1 gün azalır; doktorla
// birlikte o gece 1 gün daha (toplam 2 gün) azalır.
export default function FutbolDoktor({ team }) {
  const { player } = usePlayer();
  const { players } = useFutbolTeamPlayers(team.id);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const injuredPlayers = players
    .filter((p) => (p.injuryDaysLeft || 0) > 0)
    .sort((a, b) => (b.injuryDaysLeft || 0) - (a.injuryDaysLeft || 0));

  const doctorPlayerId = team.doctorPlayerId || null;
  const gold = player?.gold || 0;
  const canAfford = gold >= FUTBOL_DOCTOR_COST;

  const handleAssign = async (playerId) => {
    setBusyId(playerId);
    setError('');
    setMessage('');
    try {
      await assignFutbolDoctor(team.id, playerId);
      setMessage('Tedavi başladı — bu gece normalden 1 gün daha hızlı iyileşecek ✓');
    } catch (err) {
      setError(err?.message || 'Doktor ataması başarısız.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="futbol-altyapi">
      <p className="futbol-kadro-section-title">Doktor</p>
      <p className="futbol-placeholder">
        Sakat oyuncular her gece 00:00&apos;da kendiliğinden 1 gün iyileşir.
        Doktora {FUTBOL_DOCTOR_COST.toLocaleString('tr-TR')} altın ödeyerek
        AYNI ANDA SADECE 1 oyuncunun o gece 1 GÜN DAHA (toplam 2 gün)
        iyileşmesini sağlayabilirsin. Doktor kutusu her gece boşalır —
        tedavi bitsin bitmesin, ertesi gün yeniden ödeme yapman gerekir.
      </p>
      <p className="futbol-transfer-balance">💰 {gold.toLocaleString('tr-TR')} altın</p>

      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}

      {injuredPlayers.length === 0 ? (
        <p className="futbol-placeholder">Kadronda şu an sakat oyuncu yok.</p>
      ) : (
        <div className="futbol-training-slots">
          {injuredPlayers.map((p) => {
            const isBeingTreated = doctorPlayerId === p.id;
            const doctorBusyWithOther = doctorPlayerId && !isBeingTreated;
            return (
              <div key={p.id} className={`futbol-training-slot${isBeingTreated ? ' filled' : ''}`}>
                <div className="futbol-training-row">
                  <FutbolPlayerAvatar playerId={p.id} position={p.position} size={38} />
                  <div className="futbol-training-info">
                    <p className="futbol-transfer-name">{p.name}</p>
                    <p className="futbol-buy-meta">
                      {p.age} yaş · {p.power.toFixed(1)} güç ·{' '}
                      <span className="futbol-injury-badge">🚑 {p.injuryDaysLeft} gün sakat</span>
                    </p>
                  </div>
                  {isBeingTreated ? (
                    <span className="futbol-roster-status training">Tedavi ediliyor</span>
                  ) : (
                    <button
                      className="futbol-admin-submit"
                      disabled={busyId === p.id || doctorBusyWithOther || !canAfford}
                      onClick={() => handleAssign(p.id)}
                      title={
                        doctorBusyWithOther
                          ? 'Doktor şu an başka bir oyuncuyla ilgileniyor, yarın tekrar dene.'
                          : !canAfford
                            ? 'Yetersiz altın.'
                            : ''
                      }
                    >
                      {busyId === p.id ? '...' : `Tedavi Et (${FUTBOL_DOCTOR_COST.toLocaleString('tr-TR')})`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
