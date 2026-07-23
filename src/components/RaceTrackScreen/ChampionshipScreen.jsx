import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useChampionshipDaily } from '../../hooks/useChampionshipDaily';
import { createChampionshipRace } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { INITIAL_LIFE_DAYS } from '../VehicleCard/VehicleCard';
import InfoIcon from '../InfoIcon/InfoIcon';
import './RaceTrackScreen.css';

const RULES_TEXT =
  'Sahip olduğun her araçla günde 1 kez şampiyonaya katılabilirsin. Rakibin yok, tek başına 300 karelik pisti tamamlıyorsun. Benzinin biterse o araçla bugünlük elendin. Pisti tamamlarsan kaç turda (kaç zar atışında) bitirdiğine bakılır — o araçla günün en az turunu yapan, gece 00:00\'da aracın galeri fiyatının 1/5\'i kadar altın kazanır.';

export default function ChampionshipScreen({ onEnterRace }) {
  const { vehicles } = useVehicles();
  const { actions } = useDailyActions();
  const { byCatalogId } = useChampionshipDaily();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const toggleExpanded = (catalogId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(catalogId)) next.delete(catalogId);
      else next.add(catalogId);
      return next;
    });
  };

  const handleJoin = async (vehicle) => {
    setBusyId(vehicle.id);
    setError(null);
    try {
      const res = await createChampionshipRace(vehicle.id);
      if (res?.data?.roomId) onEnterRace(res.data.roomId);
    } catch (err) {
      setError(err.message || 'Şampiyonaya katılamadın.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="race-screen">
      <p className="race-panel-title">
        🏆 Şampiyona
        <InfoIcon text={RULES_TEXT} />
      </p>
      <p className="race-hint">
        Her araç için ayrı bir şampiyona var. Amacın en az turda (en az zar atışında) pisti
        bitirmek.
      </p>

      {error && <p className="race-error">{error}</p>}

      <div className="champ-list">
        {vehicleCatalog.map((catalogVehicle) => {
          const myVehicle = vehicles.find((v) => v.catalogId === catalogVehicle.id);
          const owned = Boolean(myVehicle);
          const lifeDays = myVehicle?.lifeDays ?? INITIAL_LIFE_DAYS;
          const seized = Boolean(myVehicle?.seizedByBank);
          const usedToday = Boolean(actions[`championship_${catalogVehicle.id}`]);
          const reward = Math.round(catalogVehicle.price / 5);
          const daily = byCatalogId[String(catalogVehicle.id)] || {};
          const yesterday = daily.yesterday;
          const today = daily.today;
          const todayLeaders =
            today?.leaders && today.leaders.length
              ? today.leaders
              : today?.leaderUid
                ? [{ uid: today.leaderUid, name: today.leaderName, vehicleModel: today.leaderVehicleModel }]
                : [];
          const hasTiedLeaders = todayLeaders.length > 1;
          const isExpanded = expandedIds.has(catalogVehicle.id);

          let statusLabel = 'Şampiyonaya Katıl';
          let disabledReason = null;
          if (!owned) disabledReason = 'Bu araca sahip değilsin';
          else if (seized) disabledReason = 'Araç bankaya el konulmuş';
          else if (lifeDays <= 0) disabledReason = 'Ömrü bitmiş — önce tamir ettir';
          else if (usedToday) disabledReason = 'Bugün bu araçla katıldın';
          if (disabledReason) statusLabel = disabledReason;

          return (
            <div key={catalogVehicle.id} className="champ-card">
              <div className="champ-card-top">
                {catalogVehicle.image && (
                  <img
                    className="champ-card-photo"
                    src={catalogVehicle.image}
                    alt={catalogVehicle.name}
                  />
                )}
                <div className="champ-card-info">
                  <span className="champ-card-name">{catalogVehicle.name}</span>
                  <span className="champ-card-reward">🏆 Ödül: {reward.toLocaleString('tr-TR')} altın</span>
                </div>
              </div>

              <div className="champ-card-stats">
                <p className="champ-card-stat">
                  Dünün kazananı:{' '}
                  {yesterday?.winnerUid ? (
                    <strong>
                      {yesterday.winnerName} — {yesterday.winnerTurns} tur
                    </strong>
                  ) : yesterday?.leaderUid && !yesterday?.finalized ? (
                    <strong>
                      {yesterday.leaderName} — {yesterday.leaderTurns} tur (hesaplanıyor)
                    </strong>
                  ) : (
                    'Kimse tamamlayamadı'
                  )}
                </p>
                <p className="champ-card-stat">
                  Günün lideri:{' '}
                  {today?.leaderUid ? (
                    <>
                      <strong>
                        {today.leaderName} — {today.leaderTurns} tur
                      </strong>
                      {hasTiedLeaders && (
                        <button
                          type="button"
                          className="champ-leaders-toggle"
                          onClick={() => toggleExpanded(catalogVehicle.id)}
                        >
                          {isExpanded ? '▲ gizle' : `▼ +${todayLeaders.length - 1} kişi daha aynı turda`}
                        </button>
                      )}
                    </>
                  ) : (
                    'Henüz kimse tamamlamadı'
                  )}
                </p>
                {hasTiedLeaders && isExpanded && (
                  <div className="champ-leaders-panel">
                    {todayLeaders.map((leader) => (
                      <p key={leader.uid} className="champ-leaders-panel-item">
                        {leader.name}
                        {leader.vehicleModel ? ` — ${leader.vehicleModel}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="race-btn primary"
                disabled={Boolean(disabledReason) || busyId === myVehicle?.id}
                onClick={() => myVehicle && handleJoin(myVehicle)}
              >
                {busyId === myVehicle?.id ? 'Katılınıyor…' : statusLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
