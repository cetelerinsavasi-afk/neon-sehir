import { useState } from 'react';
import { useVehicles } from '../../hooks/useVehicles';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useChampionshipDaily } from '../../hooks/useChampionshipDaily';
import { createChampionshipRace } from '../../services/gameActions';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { INITIAL_LIFE_DAYS } from '../VehicleCard/VehicleCard';
import InfoIcon from '../InfoIcon/InfoIcon';
import { CarStatBars, LevelPips, vehicleRaceLevel } from './CarStats';
import { fmtRace } from './timeAttackGame';
import { championshipPodium, championshipPrize } from '../../../functions/championshipPrizes.js';
import './RaceTrackScreen.css';

const RULES_TEXT =
  'Her araçla günde 1 kez katılırsın. Yarış bitmeden çıkarsan o günkü hakkın yanar. Günün en hızlı ilk 3\'ü gece 00:00\'da ödül alır: aracın galeri fiyatının %25\'i, %10\'u ve %5\'i.';
// v78: eski günlerin kaydı tur sayısıyla, yenileri süreyle tutulur
const resultText = (ms, turns) => (ms ? fmtRace(ms) : turns ? `${turns} tur` : '');
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const MEDAL = ['🥇', '🥈', '🥉'];

// v96 — günün / dünün ilk 3'ü (ödülleriyle)
function PodiumList({ title, rows, note }) {
  return (
    <div className="champ-podium">
      <p className="champ-podium-title">
        {title}
        {note && <span className="champ-podium-note"> · {note}</span>}
      </p>
      {rows.length === 0 && <p className="champ-podium-empty">Henüz kimse tamamlamadı</p>}
      {rows.map((r) => (
        <p key={`${r.place}_${r.uid}`} className="champ-podium-row">
          <span className="champ-podium-medal">{MEDAL[r.place - 1]}</span>
          <span className="champ-podium-name">{r.name || 'Oyuncu'}</span>
          <span className="champ-card-time">{resultText(r.timeMs, r.turns)}</span>
          <span className="champ-podium-prize">+{fmt(r.reward)}</span>
        </p>
      ))}
    </div>
  );
}

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
        Her araç için ayrı bir şampiyona var. Amacın pisti günün en kısa süresinde bitirmek.
      </p>

      {error && <p className="race-error">{error}</p>}

      <div className="champ-list">
        {vehicleCatalog.map((catalogVehicle) => {
          // Kullanıcı revizesi (kritik hata): "sattığım arabalarla
          // şampiyonaya katılabiliyorum" — 2. elde listelenmiş (satışa
          // çıkarılmış) bir araç artık fiilen elimizde sayılmamalı. Aynı
          // modelden birden fazla araca sahip olunabildiği için (bkz.
          // buyVehicle) burada listelenmemiş İLK aracı seçiyoruz — hepsi
          // listelenmişse bu model artık "sahipsin" sayılmaz.
          const myVehicle = vehicles.find((v) => v.catalogId === catalogVehicle.id && !v.listed);
          const owned = Boolean(myVehicle);
          const lifeDays = myVehicle?.lifeDays ?? INITIAL_LIFE_DAYS;
          const seized = Boolean(myVehicle?.seizedByBank);
          const usedToday = Boolean(actions[`championship_${catalogVehicle.id}`]);
          const prizes = [1, 2, 3].map((pl) => championshipPrize(catalogVehicle.price, pl));
          const daily = byCatalogId[String(catalogVehicle.id)] || {};
          const yesterday = daily.yesterday;
          const today = daily.today;
          const todayTop = championshipPodium(today, catalogVehicle.price);
          // dün: kesinleşmişse ödenen liste, değilse hesaplanan
          const yesterdayTop = yesterday?.finalized && Array.isArray(yesterday.winners) && yesterday.winners.length
            ? yesterday.winners.map((w) => ({ ...w, turns: yesterday.winnerTurns }))
            : championshipPodium(yesterday, catalogVehicle.price);
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
                  <span className="champ-card-name">
                    {catalogVehicle.name} {owned && <LevelPips level={vehicleRaceLevel(myVehicle)} />}
                  </span>
                  <span className="champ-card-reward">🏆 {prizes.map((x) => fmt(x)).join(' · ')}</span>
                </div>
              </div>
              <div className="champ-card-stats-bars">
                <CarStatBars catalogId={catalogVehicle.id} level={owned ? vehicleRaceLevel(myVehicle) : 1} compact />
              </div>

              <div className="champ-card-stats">
                <button type="button" className="champ-leader-toggle" onClick={() => toggleExpanded(catalogVehicle.id)} aria-expanded={isExpanded}>
                  <span>
                    Günün lideri:{' '}
                    {todayTop[0] ? (
                      <strong>
                        {todayTop[0].name} — <span className="champ-card-time">{resultText(todayTop[0].timeMs, todayTop[0].turns)}</span>
                      </strong>
                    ) : (
                      'Henüz kimse tamamlamadı'
                    )}
                  </span>
                  <span className="champ-leader-arrow">{isExpanded ? '▴' : '▾'}</span>
                </button>
                {isExpanded && (
                  <div className="champ-leaders-panel">
                    <PodiumList title="Bugün" rows={todayTop} />
                    <PodiumList title="Dün" rows={yesterdayTop} note={yesterday && !yesterday.finalized && yesterdayTop.length ? 'hesaplanıyor' : null} />
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
