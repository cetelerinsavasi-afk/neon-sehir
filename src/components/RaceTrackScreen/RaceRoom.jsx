import { useEffect, useRef, useState } from 'react';
import {
  cancelRaceRoom,
  declineOpponent,
  startRace,
  rollDice,
  autoRoll,
  raceRefuel,
  raceBuyNitro,
  raceChangeGear,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import DiceRoll from './DiceRoll';
import './RaceTrackScreen.css';

const RULES_TEXT =
  'Sırayla oynanır, her hamle için 10 saniyen var. 1. tur herkes 1 zar atar (vites 1). Sonraki turlarda vites ±1 değişebilir. 300. kareye ilk ulaşan kazanır — ama sen ilk başlarsan rakibine bir son hamle hakkı verilir, o da biterse berabere olur. Benzinin biterse anında kaybedersin.';

function useCountdown(deadline) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!deadline?.toMillis) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const ms = deadline.toMillis() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  return secondsLeft;
}

function useAutoRollWatcher(roomId, deadline, active) {
  const firedFor = useRef(null);

  useEffect(() => {
    if (!active || !deadline?.toMillis) return;
    const key = deadline.toMillis();
    const check = () => {
      if (key <= Date.now() && firedFor.current !== key) {
        firedFor.current = key;
        autoRoll(roomId).catch(() => {});
      }
    };
    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [roomId, deadline, active]);
}

export default function RaceRoom({ room, myUid, onDismissFinished }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const otherUid = room.participantUids?.find((u) => u !== myUid);
  const me = room.players?.[myUid];
  const other = otherUid ? room.players?.[otherUid] : null;
  const racing = room.status === 'racing';
  const isMyTurn = room.currentTurnUid === myUid || room.finalTurnFor === myUid;
  const isFinalTurnForMe = room.finalTurnFor === myUid;

  const secondsLeft = useCountdown(room.turnDeadline);
  useAutoRollWatcher(room.id, room.turnDeadline, racing);

  const run = async (key, fn) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      return res;
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (room.status === 'waiting') {
    return (
      <div className="race-screen">
        <p className="race-hint">Rakip bekleniyor… Bahis: {room.betAmount.toLocaleString('tr-TR')} altın</p>
        <button className="race-btn" disabled={busy} onClick={() => run('cancel', () => cancelRaceRoom(room.id).then(onDismissFinished))}>
          Odayı İptal Et
        </button>
        {error && <p className="race-error">{error}</p>}
      </div>
    );
  }

  if (room.status === 'ready') {
    const isCreator = room.creatorUid === myUid;
    if (!isCreator) {
      return (
        <div className="race-screen">
          <p className="race-hint">Odaya katıldın, oda sahibinin yarışı başlatması bekleniyor…</p>
        </div>
      );
    }
    return (
      <div className="race-screen">
        <p className="race-hint">
          <strong>{other?.displayName}</strong> katıldı — {other?.vehicleModel} (Vites{' '}
          {other?.maxGear}, Depo {other?.maxFuel}L)
        </p>
        <div className="race-controls">
          <button className="race-btn primary" disabled={busy} onClick={() => run('start', () => startRace(room.id))}>
            Yarışı Başlat
          </button>
          <button className="race-btn" disabled={busy} onClick={() => run('decline', () => declineOpponent(room.id))}>
            Reddet
          </button>
        </div>
        {error && <p className="race-error">{error}</p>}
      </div>
    );
  }

  if (room.status === 'finished') {
    const won = room.winnerUid === myUid;
    const isDraw = room.winnerUid === 'draw';
    const noContest = !room.winnerUid;
    return (
      <div className="race-screen">
        <p className={`race-result ${won ? 'win' : isDraw || noContest ? '' : 'lose'}`}>
          {isDraw ? 'Berabere! Bahisleriniz iade edildi.' : noContest ? 'Yarış sonuçsuz bitti.' : won ? 'Kazandın!' : 'Kaybettin.'}
        </p>
        {me?.lostByFuel && <p className="race-hint">Benzinin bitti ve yarışı kaybettin.</p>}
        <p className="race-hint">
          Kazandığın yarış-içi altın ({(me?.raceGold ?? 0).toLocaleString('tr-TR')}) ve varsa bahis
          payın hesabına eklendi.
        </p>
        <button className="race-btn primary" onClick={onDismissFinished}>
          Lobiye Dön
        </button>
      </div>
    );
  }

  if (!me || !other) {
    return <p className="race-hint">Yarış yükleniyor…</p>;
  }

  const atStation = me.position % 10 === 0;
  const refuelPrice = atStation ? 10 : 100;

  const handleRoll = async (useNitro, useTurbo) => {
    await run('roll', () => rollDice(room.id, useNitro, useTurbo));
  };

  const rollButtonLabel = () => {
    if (!isMyTurn) return `${other.displayName}'in sırası… (${secondsLeft ?? '—'}s)`;
    if (isFinalTurnForMe) return `Son hamlen! Zar At (${secondsLeft ?? '—'}s)`;
    return me.nitroActive ? `Zar At — Nitro Aktif (${secondsLeft ?? '—'}s)` : `Zar At (${secondsLeft ?? '—'}s)`;
  };

  return (
    <div className="race-screen">
      <p className="race-panel-title">
        Yarış
        <InfoIcon text={RULES_TEXT} />
      </p>

      <div className="race-track">
        <div className="race-track-ticks">
          {Array.from({ length: 29 }, (_, i) => (i + 1) * 10).map((pos) => (
            <div
              key={pos}
              className={`race-tick${pos % 100 === 0 ? ' major' : ''}`}
              style={{ left: `${(pos / 300) * 100}%` }}
            />
          ))}
        </div>
        <div className="race-track-finish" />
        <div className="race-car me" style={{ left: `${Math.min(96, (me.position / 300) * 100)}%` }}>
          🏎️
        </div>
        <div
          className="race-car other"
          style={{ left: `${Math.min(96, (other.position / 300) * 100)}%` }}
        >
          🚙
        </div>
      </div>
      <div className="race-positions">
        <span>Sen: {me.position}/300</span>
        <span>{other.displayName}: {other.position}/300</span>
      </div>

      <div className="race-stat-boxes">
        <div className={`race-stat-box${me.fuel <= 0 ? ' danger' : ''}`}>
          <span className="race-stat-emoji">⛽</span>
          <span className="race-stat-value">{me.fuel}/{me.maxFuel}</span>
        </div>
        <div className="race-stat-box gold">
          <span className="race-stat-coin" />
          <span className="race-stat-value">{me.raceGold}</span>
        </div>
        {me.turboCount > 0 && (
          <div className="race-stat-box turbo">
            <span className="race-stat-emoji">🚀</span>
            <span className="race-stat-value">×{me.turboCount}</span>
          </div>
        )}
      </div>

      <div className="race-dice-row">
        <div className="race-dice-col">
          <span className="race-dice-owner">Sen</span>
          <DiceRoll rollKey={`${me.position}-${me.lastRollDice?.join(',')}`} dice={me.lastRollDice} />
          {me.lastRollBoost && (
            <span className="race-boost-badge">
              {me.lastRollBoost === 'combo' ? '🔥🚀 Kombo ×3' : me.lastRollBoost === 'nitro' ? '🔥 Nitro ×2' : '🚀 Turbo ×2'}
            </span>
          )}
        </div>
        <div className="race-dice-col">
          <span className="race-dice-owner">{other.displayName}</span>
          <DiceRoll
            rollKey={`o-${other.position}-${other.lastRollDice?.join(',')}`}
            dice={other.lastRollDice}
          />
          {other.lastRollBoost && (
            <span className="race-boost-badge">
              {other.lastRollBoost === 'combo' ? '🔥🚀 Kombo ×3' : other.lastRollBoost === 'nitro' ? '🔥 Nitro ×2' : '🚀 Turbo ×2'}
            </span>
          )}
        </div>
      </div>

      {!me.hasRolledOnce && (
        <p className="race-hint">İlk turda herkes 1 zar atar, vites 1'de sabit.</p>
      )}

      <div className="race-gear-nitro-row">
        <div className="race-gear-stepper">
          <span className="race-gear-label">Vites</span>
          <button
            className="race-gear-btn"
            disabled={busy || !isMyTurn || !me.hasRolledOnce || me.gear <= 1}
            onClick={() => run('gear-', () => raceChangeGear(room.id, -1))}
          >
            −
          </button>
          <span className="race-gear-value">{me.gear}</span>
          <button
            className="race-gear-btn"
            disabled={busy || !isMyTurn || !me.hasRolledOnce || me.gear >= me.maxGear}
            onClick={() => run('gear+', () => raceChangeGear(room.id, 1))}
          >
            +
          </button>
        </div>
        <button
          className="race-nitro-btn"
          disabled={busy || !isMyTurn || me.raceGold < 20 || me.nitroActive}
          onClick={() => run('nitro', () => raceBuyNitro(room.id))}
        >
          {me.nitroActive ? '🔥 Nitro Alındı' : '🔥 Nitro (20)'}
        </button>
      </div>

      {me.turboCount > 0 && (
        <div className="race-controls">
          <button className="race-btn small" disabled={busy || !isMyTurn} onClick={() => handleRoll(false, true)}>
            Turbo ile At
          </button>
        </div>
      )}

      <button className="race-roll-btn" disabled={busy || !isMyTurn} onClick={() => handleRoll(me.nitroActive, false)}>
        {rollButtonLabel()}
      </button>

      {isMyTurn && (
        <button
          className={`race-btn${me.fuel <= 0 ? ' primary' : ''}`}
          disabled={busy || me.raceGold < refuelPrice || me.fuel >= me.maxFuel}
          onClick={() => run('refuel', () => raceRefuel(room.id))}
        >
          {me.fuel >= me.maxFuel
            ? '⛽ Benzin Dolu'
            : atStation
              ? `⛽ Şu an istasyondasın — Benzin Doldur (${refuelPrice})`
              : `⛽ Benzin Doldur (${refuelPrice})`}
        </button>
      )}

      {error && <p className="race-error">{error}</p>}
    </div>
  );
}
