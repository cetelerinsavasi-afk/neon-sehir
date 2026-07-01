import { useEffect, useRef, useState } from 'react';
import {
  cancelRaceRoom,
  rollDice,
  autoRoll,
  raceBuyAtStation,
  raceBuyOffsiteFuel,
  raceBuyNitro,
  raceChangeGear,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import './RaceTrackScreen.css';

const RULES_TEXT =
  'Vites = atacağın zar sayısı. Her adım +1 altın, -1 benzin. Her 100 kareyi geçince +50 altın bonus. 500. kareye ilk ulaşan kazanır. Her 10 karede bir istasyon var. Benzinin biterse yarışı direkt kaybedersin. 10 saniyede bir zar otomatik atılır, istersen daha erken de atabilirsin.';

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

// Bir oyuncunun kişisel sayacı dolduğunda otomatik zar atmasını tetikler.
// Bu hook HEM kendi hem rakip için çalıştırılır — böylece rakip uygulamayı
// kapatsa bile, benim istemcim onun adına otomatik atışı tetikleyebilir.
function useAutoRollWatcher(roomId, player, uid, active) {
  const firedForDeadline = useRef(null);

  useEffect(() => {
    if (!active || !player || player.finished || player.lostByFuel) return;
    const deadline = player.nextRollAt;
    if (!deadline?.toMillis) return;

    const key = `${uid}-${deadline.toMillis()}`;
    const check = () => {
      if (deadline.toMillis() <= Date.now() && firedForDeadline.current !== key) {
        firedForDeadline.current = key;
        autoRoll(roomId, uid).catch(() => {});
      }
    };
    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [roomId, player, uid, active]);
}

export default function RaceRoom({ room, myUid, onDismissFinished }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastRoll, setLastRoll] = useState(null);

  const otherUid = room.participantUids?.find((u) => u !== myUid);
  const me = room.players?.[myUid];
  const other = otherUid ? room.players?.[otherUid] : null;
  const racing = room.status === 'racing';

  const mySecondsLeft = useCountdown(me?.nextRollAt);
  const otherSecondsLeft = useCountdown(other?.nextRollAt);

  // Hem kendim hem rakip için otomatik atış izleyicisi — ikisi de aktif
  // olmalı ki tek taraf kapansa bile diğerinin istemcisi yarışı ilerletsin.
  useAutoRollWatcher(room.id, me, myUid, racing);
  useAutoRollWatcher(room.id, other, otherUid, racing);

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
    const noContest = !room.winnerUid;
    return (
      <div className="race-screen">
        <p className={`race-result ${won ? 'win' : noContest ? '' : 'lose'}`}>
          {noContest ? 'Yarış sonuçsuz bitti.' : won ? 'Kazandın!' : 'Kaybettin.'}
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

      <div className="race-turn-banner">
        {me.fuel <= 0
          ? 'Benzinin bitti! Hemen benzin almazsan bir sonraki atışta yarışı kaybedersin.'
          : `Bir sonraki otomatik zar: ${mySecondsLeft ?? '—'}s (istersen hemen atabilirsin)`}
      </div>
      <p className="race-hint">Rakibin bir sonraki otomatik zarı: {otherSecondsLeft ?? '—'}s</p>

      <div className="race-stats-grid">
        <span>Vites {me.gear}/{me.maxGear}</span>
        <span className={me.fuel <= 0 ? 'race-stat-danger' : ''}>Benzin {me.fuel}/{me.maxFuel}</span>
        <span>Yarış altını {me.raceGold}</span>
        {me.turboCount > 0 && <span>Turbo × {me.turboCount}</span>}
      </div>

      <div className="race-section">
        <div className="race-controls">
          <button
            className="race-btn small"
            disabled={busy || me.gear <= 1}
            onClick={() => run('gear-', () => raceChangeGear(room.id, -1))}
          >
            Vites −
          </button>
          <button
            className="race-btn small"
            disabled={busy || me.gear >= me.maxGear}
            onClick={() => run('gear+', () => raceChangeGear(room.id, 1))}
          >
            Vites +
          </button>
          <button
            className="race-btn small"
            disabled={busy || me.raceGold < 20}
            onClick={() => run('nitro', () => raceBuyNitro(room.id))}
          >
            Nitro Al (20)
          </button>
        </div>
        <div className="race-controls">
          <button className="race-btn primary" disabled={busy} onClick={() => handleRoll(me.nitroActive, false)}>
            {me.nitroActive ? 'Zar At (Nitro Aktif)' : 'Zar At'}
          </button>
          {me.turboCount > 0 && (
            <button className="race-btn small" disabled={busy} onClick={() => handleRoll(false, true)}>
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

      <button
        className={`race-btn${me.fuel <= 0 ? ' primary' : ''}`}
        disabled={busy || me.raceGold < 100}
        onClick={() => run('offsite-fuel', () => raceBuyOffsiteFuel(room.id))}
      >
        İstasyon Dışı Benzin Al (100, her zaman tam dolum)
      </button>

      {lastRoll && !lastRoll.outOfFuel && (
        <p className="race-hint">
          Son atışın: {lastRoll.rolledSum} zar × {lastRoll.multiplier} = {lastRoll.steps} adım, +
          {lastRoll.goldEarned} altın
        </p>
      )}
      {error && <p className="race-error">{error}</p>}
    </div>
  );
}
