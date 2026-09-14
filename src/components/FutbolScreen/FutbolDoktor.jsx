import { useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { assignFutbolDoctor, cancelFutbolDoctor } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolAltyapi.css';

// KULLANICI REVİZESİ (Bölüm 13): doktor maliyeti 5.000 → 10.000 altın.
const FUTBOL_DOCTOR_COST = 10000;
const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };

// FutbolDoktor — yeni istek: "kadrosunda sakat oyuncu olan takımlar
// doktor tabından 10.000 altın ödeyerek TEK bir oyuncunun iyileşmesini
// hızlandırabilir". Doktor kutusu aynı anda sadece 1 oyuncuyla
// ilgilenebilir (bkz. functions/index.js assignFutbolDoctor) ve HER
// gece 19:00'da (eskiden 00:00'da) kutu boşalır — tedavi görsün görmesin,
// ertesi gün istersen (başka ya da aynı) bir oyuncu için yeniden ödeme
// yapabilirsin. Doktorsuz sakatlık zaten her gece kendiliğinden 1 gün
// azalır; doktorla birlikte o gece 1 gün daha (toplam 2 gün) azalır.
export default function FutbolDoktor({ team, role }) {
  const { player } = usePlayer();
  const { players } = useFutbolTeamPlayers(team.id);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // KULLANICI İSTEĞİ: menajer varken başkan inceleyebilir ama işlem
  // yapamaz (Forma ve Menajer sekmeleri hariç).
  const readOnly = role === 'owner' && Boolean(team.managerUid);

  const injuredPlayers = players
    .filter((p) => (p.injuryDaysLeft || 0) > 0)
    .sort((a, b) => (b.injuryDaysLeft || 0) - (a.injuryDaysLeft || 0));

  const doctorPlayerId = team.doctorPlayerId || null;
  // Bölüm 2/6/13: MANAGED bir takımda harcama önce transfer desteğinden,
  // kalanı kasadan düşer — kişisel altın hiç kullanılmaz.
  const isManaged = Boolean(team.managerUid);
  const gold = isManaged ? (team.transferSupport || 0) + (team.treasury || 0) : player?.gold || 0;
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

  const handleCancel = async (playerId) => {
    setBusyId(playerId);
    setError('');
    setMessage('');
    try {
      await cancelFutbolDoctor(team.id);
      setMessage(`Tedavi iptal edildi, ${FUTBOL_DOCTOR_COST.toLocaleString('tr-TR')} altın iade edildi ✓`);
    } catch (err) {
      setError(err?.message || 'Tedavi iptal edilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <fieldset className="futbol-altyapi" disabled={readOnly}>
      <p className="futbol-kadro-section-title">Doktor</p>
      <p className="futbol-placeholder">Doktor, sakat futbolcuların daha hızlı iyileşmesini sağlar.</p>
      <p className="futbol-transfer-balance">
        {isManaged ? `💰 Destek + Kasa: ${gold.toLocaleString('tr-TR')} altın` : `💰 ${gold.toLocaleString('tr-TR')} altın`}
      </p>

      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}

      {injuredPlayers.length === 0 ? (
        <p className="futbol-placeholder">Kadronda şu an sakat oyuncu yok.</p>
      ) : (
        <div className="futbol-training-slots">
          {injuredPlayers.map((p) => {
            const isBeingTreated = doctorPlayerId === p.id;
            const doctorBusyWithOther = doctorPlayerId && !isBeingTreated;
            // Kullanıcı revizesi: sakatlık zaten HER gece (doktorsuz da)
            // kendiliğinden 1 gün azalıyor — kalan sakatlık süresi 1 gün
            // olan bir oyuncu bu gece 00:00'da doktorsuz da tamamen
            // iyileşmiş olacak. Böyle bir oyuncuya doktor tutmak parayı
            // boşa harcamak demek, o yüzden buton yerine bilgi notu
            // gösteriliyor.
            const willHealTonightNaturally = !isBeingTreated && (p.injuryDaysLeft || 0) === 1;
            return (
              <div key={p.id} className={`futbol-training-slot${isBeingTreated ? ' filled' : ''}`}>
                <div className="futbol-training-row">
                  <FutbolPlayerAvatar playerId={p.id} position={p.position} size={38} />
                  <div className="futbol-training-info">
                    <p className="futbol-transfer-name">{p.name}</p>
                    <p className="futbol-buy-meta">
                      {POSITION_LABELS[p.position] || p.position} · {p.age} yaş · {p.power.toFixed(1)} güç ·{' '}
                      <span className="futbol-injury-badge">🚑 {p.injuryDaysLeft} gün sakat</span>
                    </p>
                  </div>
                  {isBeingTreated ? (
                    <div className="futbol-doktor-treating">
                      <span className="futbol-roster-status training">Tedavi ediliyor (bu gece -1 gün daha)</span>
                      <button
                        className="futbol-admin-reset"
                        disabled={busyId === p.id}
                        onClick={() => handleCancel(p.id)}
                      >
                        {busyId === p.id ? '...' : 'Tedaviyi İptal Et (altın iade)'}
                      </button>
                    </div>
                  ) : willHealTonightNaturally ? (
                    <span className="futbol-buy-meta futbol-doktor-busy-note">
                      Bu gece iyileşecek — doktora gerek yok.
                    </span>
                  ) : doctorBusyWithOther ? (
                    <span className="futbol-buy-meta futbol-doktor-busy-note">
                      Doktor şu an başka bir oyuncuyla ilgileniyor.
                    </span>
                  ) : (
                    <button
                      className="futbol-admin-submit"
                      disabled={busyId === p.id || !canAfford}
                      onClick={() => handleAssign(p.id)}
                    >
                      {busyId === p.id
                        ? '...'
                        : !canAfford
                          ? 'Yetersiz Bakiye'
                          : `Tedavi Et (${FUTBOL_DOCTOR_COST.toLocaleString('tr-TR')} altın · -1 gün)`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
