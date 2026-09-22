import { useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useFutbolTeamPlayers } from '../../hooks/useFutbolTeamPlayers';
import { assignFutbolDoctor, cancelFutbolDoctor } from '../../services/gameActions';
import FutbolPlayerAvatar from './FutbolPlayerAvatar';
import './FutbolAltyapi.css';

// KULLANICI REVİZESİ (Bölüm 13): doktor maliyeti 5.000 → 10.000 altın.
const FUTBOL_DOCTOR_COST = 10000;
const POSITION_LABELS = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta Saha', FWD: 'Forvet' };

const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR');

// FutbolDoktor — yeni istek: "kadrosunda sakat oyuncu olan takımlar
// doktor tabından 10.000 altın ödeyerek TEK bir oyuncunun iyileşmesini
// hızlandırabilir". Doktor kutusu aynı anda sadece 1 oyuncuyla
// ilgilenebilir (bkz. functions/index.js assignFutbolDoctor) ve HER
// gece 19:00'da (eskiden 00:00'da) kutu boşalır — tedavi görsün görmesin,
// ertesi gün istersen (başka ya da aynı) bir oyuncu için yeniden ödeme
// yapabilirsin. Doktorsuz sakatlık zaten her gece kendiliğinden 1 gün
// azalır; doktorla birlikte o gece 1 gün daha (toplam 2 gün) azalır.
//
// GÖRSEL CİLA (KULLANICI REVİZESİ: "doktor ekranı çok basit gözüküyor") —
// FutbolSponsor.jsx'teki kart/özet/renkli-uyarı-kutusu deseniyle AYNI
// kalitede: üstte doktor kutusunun durumunu gösteren bir özet kartı,
// her sakat oyuncu için rozetli bir kart (avatar + isim + meta + sakatlık
// rozeti) ve tutarlı renkli durum kutuları (bkz. FutbolAltyapi.css'teki
// futbol-doktor-* blok).
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
  const doctorPatient = doctorPlayerId ? players.find((p) => p.id === doctorPlayerId) : null;
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
      setMessage(`Tedavi iptal edildi, ${fmt(FUTBOL_DOCTOR_COST)} altın iade edildi ✓`);
    } catch (err) {
      setError(err?.message || 'Tedavi iptal edilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <fieldset className="futbol-altyapi futbol-doktor" disabled={readOnly}>
      <div className="futbol-doktor-summary">
        <div className="futbol-doktor-summary-main">
          <span className="futbol-doktor-summary-label">🩺 Doktor Kutusu</span>
          <span className={`futbol-doktor-summary-value${doctorPlayerId ? ' busy' : ''}`}>
            {doctorPlayerId ? `Meşgul — ${doctorPatient?.name || 'bir oyuncu'}` : 'Boş'}
          </span>
        </div>
        <p className="futbol-doktor-summary-gold">
          {isManaged ? 'Transfer Desteği + Takım Kasası' : 'Bakiye'}:{' '}
          <strong>💰 {fmt(gold)} altın</strong>
        </p>
      </div>

      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-doktor-alert ok">✅ {message}</p>}

      {injuredPlayers.length === 0 ? (
        <p className="futbol-placeholder">Kadronda şu an sakat oyuncu yok.</p>
      ) : (
        <div className="futbol-doktor-list">
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
              <div key={p.id} className={`futbol-doktor-card${isBeingTreated ? ' active' : ''}`}>
                <div className="futbol-doktor-card-head">
                  <FutbolPlayerAvatar playerId={p.id} position={p.position} size={40} />
                  <div className="futbol-doktor-card-info">
                    <span className="futbol-doktor-card-name">{p.name}</span>
                    <span className="futbol-doktor-card-meta">
                      {POSITION_LABELS[p.position] || p.position} · {p.age} yaş · {p.power.toFixed(1)} güç
                    </span>
                  </div>
                  <span className="futbol-doktor-injury-badge">🚑 {p.injuryDaysLeft} gün</span>
                </div>

                {isBeingTreated ? (
                  <div className="futbol-doktor-alert ok">
                    <span>💉 Tedavi ediliyor — bu gece normalden 1 gün daha hızlı iyileşecek.</span>
                    <button
                      className="futbol-admin-reset"
                      disabled={busyId === p.id}
                      onClick={() => handleCancel(p.id)}
                    >
                      {busyId === p.id ? '...' : 'İptal Et (altın iade)'}
                    </button>
                  </div>
                ) : willHealTonightNaturally ? (
                  <p className="futbol-doktor-alert muted">😌 Bu gece kendiliğinden iyileşecek — doktora gerek yok.</p>
                ) : doctorBusyWithOther ? (
                  <p className="futbol-doktor-alert warn">⏳ Doktor şu an başka bir oyuncuyla ilgileniyor.</p>
                ) : (
                  <button
                    className="futbol-admin-submit futbol-doktor-treat-btn"
                    disabled={busyId === p.id || !canAfford}
                    onClick={() => handleAssign(p.id)}
                  >
                    {busyId === p.id
                      ? '...'
                      : !canAfford
                        ? 'Yetersiz Bakiye'
                        : `💉 Tedavi Et (${fmt(FUTBOL_DOCTOR_COST)} altın · -1 gün)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
