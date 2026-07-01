import { useEffect, useRef, useState } from 'react';
import {
  cancelRaceRoom,
  rollDice,
  resolveTurnTimeout,
  raceBuyAtStation,
  raceBuyOffsiteFuel,
  raceBuyNitro,
  raceChangeGear,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import './RaceTrackScreen.css';

const RULES_TEXT =
  'Vites = atacağın zar sayısı. Her adım +1 altın, -1 benzin kazandırır/harcar. Her 100 kareyi geçince +50 altın bonus. 500. kareye ilk ulaşan kazanır. Her 10 karede bir istasyon var. 10 saniye içinde zar atmazsan otomatik atılır.';

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

export default function RaceRoom({ room, myUid }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastRoll, setLastRoll] = useState(null);
  const timeoutFired = useRef(false);

  const secondsLeft = useCountdown(room.turnDeadline);
  const otherUid = room.participantUids?.find((u) => u !== myUid);
  const me = room.players?.[myUid];
  const other = otherUid ? room.players?.[otherUid] : null;

  // Süre dolunca (ve henüz kimse tetiklemediyse) sunucuya haber ver.
  useEffect(() => {
    timeoutFired.current = false;
  }, [room.currentTurn]);

  useEffect(() => {
    if (
      room.status === 'racing' &&
      secondsLeft === 0 &&
      !timeoutFired.current &&
      me &&
      !me.hasRolledThisTurn
    ) {
      timeoutFired.current = true;
      resolveTurnTimeout(room.id).catch(() => {});
    }
  }, [secondsLeft, room.status, room.id, me]);

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
        <button className="race-btn" disabled={busy} onClick={() => run('cancel', () => cancelRaceRoom(room.id))}>
          Odayı İptal Et
        </button>
        {error && <p className="race-error">{error}</p>}
      </div>
    );
  }

  if (room.status === 'finished') {
    const won = room.winnerUid === myUid;
    const draw = room.winnerUid === 'draw';
    return (
      <div className="race-screen">
        <p className={`race-result ${won ? 'win' : draw ? '' : 'lose'}`}>
          {draw ? 'Berabere!' : won ? 'Kazandın!' : 'Kaybettin.'}
        </p>
        <p className="race-hint">
          Kazandığın yarış-içi altın ({(me?.raceGold ?? 0).toLocaleString('tr-TR')}) ve bahis
          payın hesabına eklendi.
        </p>
      </div>
    );
  }

  if (!me || !other) {
    return <p className="race-hint">Yarış yükleniyor…</p>;
  }

  const atStation = me.position % 10 === 0;
  const myTurnDone = me.hasRolledThisTurn;

  const handleRoll = async (useNitro, useTurbo) => {
    const res = await run('roll', () => rollDice(room.id, useNitro, useTurbo));
    if (res?.data) setLastRoll(res.data);
  };

  return (
    <div className="race-screen">
      <p className="race-panel-title">
        Yarış
        <InfoIcon text={RULES_TEXT} />
      </p>

      <div className="race-track-bar">
        <div className="race-track-fill me" style={{ width: `${(me.position / 500) * 100}%` }} />
        <div
          className="race-track-fill other"
          style={{ width: `${(other.position / 500) * 100}%` }}
        />
      </div>
      <div className="race-positions">
        <span>Sen: {me.position}/500</span>
        <span>{other.displayName}: {other.position}/500</span>
      </div>

      <div className={`race-turn-banner${myTurnDone ? ' waiting' : ''}`}>
        {myTurnDone
          ? `Zar attın, rakibi bekliyoruz… (${secondsLeft ?? '—'}s)`
          : `Sıra sende! Zar atmak için ${secondsLeft ?? '—'} saniyen var.`}
      </div>

      <div className="race-stats-grid">
        <span>Vites {me.gear}/{me.maxGear}</span>
        <span>Benzin {me.fuel}/{me.maxFuel}</span>
        <span>Yarış altını {me.raceGold}</span>
        {me.turboCount > 0 && <span>Turbo × {me.turboCount}</span>}
      </div>

      <div className="race-section">
        <p className="race-section-title">1. Vites Ayarla (isteğe bağlı)</p>
        <div className="race-controls">
          <button
            className="race-btn small"
            disabled={busy || myTurnDone || me.gear <= 1}
            onClick={() => run('gear-', () => raceChangeGear(room.id, -1))}
          >
            Vites −
          </button>
          <button
            className="race-btn small"
            disabled={busy || myTurnDone || me.gear >= me.maxGear}
            onClick={() => run('gear+', () => raceChangeGear(room.id, 1))}
          >
            Vites +
          </button>
          <button
            className="race-btn small"
            disabled={busy || myTurnDone || me.raceGold < 20}
            onClick={() => run('nitro', () => raceBuyNitro(room.id))}
          >
            Nitro Al (20)
          </button>
        </div>
      </div>

      <div className="race-section">
        <p className="race-section-title">2. Zar At</p>
        <div className="race-controls">
          <button
            className="race-btn primary"
            disabled={busy || myTurnDone}
            onClick={() => handleRoll(me.nitroActive, false)}
          >
            {me.nitroActive ? 'Zar At (Nitro Aktif)' : 'Zar At'}
          </button>
          {me.turboCount > 0 && (
            <button className="race-btn small" disabled={busy || myTurnDone} onClick={() => handleRoll(false, true)}>
              Turbo ile At
            </button>
          )}
        </div>
      </div>

      {atStation && (
        <div className="race-section">
          <p className="race-section-title">Benzin İstasyonundasın</p>
          <div className="race-controls">
            <button
              className="race-btn small"
              disabled={busy || me.raceGold < 10}
              onClick={() => run('refuel', () => raceBuyAtStation(room.id, 'refuel'))}
            >
              Benzin Doldur (10)
            </button>
            <button
              className="race-btn small"
              disabled={busy || me.raceGold < 20}
              onClick={() => run('wheel', () => raceBuyAtStation(room.id, 'wheel'))}
            >
              Tekerlek Geliştir (20)
            </button>
            <button
              className="race-btn small"
              disabled={busy || me.raceGold < 30}
              onClick={() => run('saving', () => raceBuyAtStation(room.id, 'fuelSaving'))}
            >
              Benzin Tasarrufu (30)
            </button>
          </div>
        </div>
      )}

      {!atStation && me.fuel <= 0 && (
        <button
          className="race-btn"
          disabled={busy || me.raceGold < 100}
          onClick={() => run('offsite-fuel', () => raceBuyOffsiteFuel(room.id))}
        >
          Benzinin Bitti — İstasyon Dışı Benzin Al (100)
        </button>
      )}

      {lastRoll && (
        <p className="race-hint">
          Son atışın: {lastRoll.rolledSum} zar × {lastRoll.multiplier} = {lastRoll.steps} adım, +
          {lastRoll.goldEarned} altın
        </p>
      )}
      {error && <p className="race-error">{error}</p>}
    </div>
  );
}
