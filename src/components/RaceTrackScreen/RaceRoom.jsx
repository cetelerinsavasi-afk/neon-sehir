import { useEffect, useRef, useState } from 'react';
import {
  cancelRaceRoom,
  declineOpponent,
  leaveRaceRoomAsJoiner,
  startRace,
  rollDice,
  trainingRollDice,
  championshipRollDice,
  autoRoll,
  raceRefuel,
  raceBuyNitro,
  raceChangeGear,
  sendRaceEmoji,
  pingRaceRoom,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import DiceRoll from './DiceRoll';
import './RaceTrackScreen.css';

const RACE_EMOJIS = ['😂', '😢', '😡', '😮', '👍', '🔥'];

const RULES_TEXT =
  '300 karelik pisti ilk tamamlayan bahsi kazanır. Benzinin biterse direkt kaybedersin, benzin istasyonlarında benzin oldukça ucuzdur, geldiysen benzin almadan geçme.';

const CHAMPIONSHIP_RULES_TEXT =
  '300 karelik pisti tek başına tamamlıyorsun, amacın en az turda (en az zar atışında) bitirmek. Benzinin biterse o araçla bugünlük elenirsin. Pisti tamamlarsan, o gün aynı araçla en az turu yapan oyuncu gece 00:00\'da büyük ödülü kazanır.';

// Yardımcı ipucu — birden fazla durum aynı anda geçerli olabileceği için
// öncelik sırasına göre TEK bir mesaj seçilir (en acil/işe yarar olan üstte).
function getHintInfo(me, other, atStation) {
  if (me.position === 0) return { text: '🏁 Bitiş çizgisini ilk geçen kazanır!', tone: 'info' };
  if (atStation) return { text: '📍 İstasyondasın — ucuza benzin alabilirsin!', tone: 'info' };
  if (me.fuel < 20) return { text: '⚠️ Benzinin azalıyor, doldurmalısın!', tone: 'warning' };
  if (me.hasRolledOnce && me.gear < me.maxGear) return { text: '⬆️ Vites arttırabilirsin.', tone: 'info' };
  if (me.raceGold > 150) return { text: '🔥 Nitro kullanabilirsin!', tone: 'info' };
  if (me.position > other.position) return { text: 'Şu an öndesin.', tone: 'good' };
  if (me.position < other.position) return { text: 'Şu an geridesin.', tone: 'neutral' };
  return { text: 'Berabersiniz.', tone: 'neutral' };
}

function getSoloHintInfo(me, atStation) {
  if (me.position === 0) return { text: '🏁 Amacın en az turda bitiş çizgisini geçmek!', tone: 'info' };
  if (atStation) return { text: '📍 İstasyondasın — ucuza benzin alabilirsin!', tone: 'info' };
  if (me.fuel < 20) return { text: '⚠️ Benzinin azalıyor, doldurmalısın!', tone: 'warning' };
  if (me.hasRolledOnce && me.gear < me.maxGear) return { text: '⬆️ Vites arttırabilirsin.', tone: 'info' };
  if (me.raceGold > 150) return { text: '🔥 Nitro kullanabilirsin — daha az turda bitirirsin!', tone: 'info' };
  return { text: `Şu ana kadar ${me.turnsUsed || 0} tur kullandın.`, tone: 'neutral' };
}

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
  // 10 Numara'da yaşadığımız aynı sorun burada da vardı: zar atıldıktan
  // hemen sonra buton tekrar aktif oluyordu ama Firestore dinleyicisi
  // henüz yeni pozisyonu/sırayı yansıtmamışken oyuncu tekrar basıp
  // GERÇEKTEN 2. kez zar atabiliyordu. Aynı "onaylanana kadar kilitli
  // kal" çözümünü burada da uyguluyoruz.
  const pendingConfirmRef = useRef(null);

  const otherUid = room.participantUids?.find((u) => u !== myUid);
  const me = room.players?.[myUid];
  const other = otherUid ? room.players?.[otherUid] : null;
  const myReactionData = room.reactions?.[myUid];
  const myReaction =
    myReactionData && Date.now() - myReactionData.at < 3000 ? myReactionData.emoji : null;
  const otherReactionData = otherUid ? room.reactions?.[otherUid] : null;
  const otherReaction =
    otherReactionData && Date.now() - otherReactionData.at < 3000 ? otherReactionData.emoji : null;
  const racing = room.status === 'racing';
  const isMyTurn = room.currentTurnUid === myUid || room.finalTurnFor === myUid;
  const isFinalTurnForMe = room.finalTurnFor === myUid;

  const secondsLeft = useCountdown(room.turnDeadline);
  useAutoRollWatcher(room.id, room.turnDeadline, racing);

  useEffect(() => {
    const pending = pendingConfirmRef.current;
    if (!pending) return;
    const changed =
      room.status !== 'racing' ||
      room.currentTurnUid !== pending.turnUidBefore ||
      room.finalTurnFor !== pending.finalTurnForBefore ||
      (me && me.position !== pending.positionBefore) ||
      (me && me.fuel !== pending.fuelBefore);
    if (changed) {
      pendingConfirmRef.current = null;
      setBusy(false);
    }
  }, [room, me]);

  const run = async (key, fn, { waitForConfirm = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (waitForConfirm) {
        pendingConfirmRef.current = {
          turnUidBefore: room.currentTurnUid,
          finalTurnForBefore: room.finalTurnFor,
          positionBefore: me?.position,
          fuelBefore: me?.fuel,
        };
        setTimeout(() => {
          if (pendingConfirmRef.current) {
            pendingConfirmRef.current = null;
            setBusy(false);
          }
        }, 4000);
        return res;
      }
      return res;
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
      return null;
    } finally {
      if (!waitForConfirm) setBusy(false);
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
          <button
            className="race-btn"
            disabled={busy}
            onClick={() =>
              run('leave-joiner', () => leaveRaceRoomAsJoiner(room.id).then(onDismissFinished))
            }
          >
            Odadan Ayrıl
          </button>
          {error && <p className="race-error">{error}</p>}
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
    if (room.isChampionship) {
      const completed = room.championshipResult === 'completed';
      const turns = room.championshipTurns ?? me?.turnsUsed;
      return (
        <div className="race-screen">
          <p className={`race-result ${completed ? 'win' : 'lose'}`}>
            {completed ? 'Pisti tamamladın! 🏁' : 'Benzinin bitti, bugünlük elendin.'}
          </p>
          {completed && (
            <p className="race-result-turns">
              {turns} turda bitirdin. Bugünün en az turunu yaparsan gece 00:00'da ödülü kazanırsın.
            </p>
          )}
          {!completed && (
            <p className="race-hint">Bu araçla yarın tekrar deneyebilirsin.</p>
          )}
          <button className="race-btn primary" onClick={onDismissFinished}>
            Şampiyonaya Dön
          </button>
        </div>
      );
    }

    const won = room.winnerUid === myUid;
    const isDraw = room.winnerUid === 'draw';
    const noContest = !room.winnerUid;
    const bet = room.betAmount || 0;
    return (
      <div className="race-screen">
        <p className={`race-result ${won ? 'win' : isDraw || noContest ? '' : 'lose'}`}>
          {isDraw
            ? 'Berabere! Bahisleriniz iade edildi.'
            : noContest
              ? 'Yarış sonuçsuz bitti.'
              : won
                ? room.isTraining
                  ? `Seviye ${room.trainingLevel} tamamlandı! 🎉`
                  : 'Yarışı kazandın!'
                : room.isTraining
                  ? 'Bot kazandı, tekrar dene!'
                  : 'Yarışı kaybettin.'}
        </p>
        {me?.lostByFuel && <p className="race-hint">Benzinin bitti ve yarışı kaybettin.</p>}
        {!room.isTraining && !isDraw && !noContest && (
          <p className={`race-result-amount ${won ? 'win' : 'lose'}`}>
            {won ? `+${(bet * 2).toLocaleString('tr-TR')}` : `-${bet.toLocaleString('tr-TR')}`} altın
          </p>
        )}
        <button className="race-btn primary" onClick={onDismissFinished}>
          Lobiye Dön
        </button>
      </div>
    );
  }

  if (!me || (!room.isChampionship && !other)) {
    return <p className="race-hint">Yarış yükleniyor…</p>;
  }

  const atStation = me.position % 10 === 0;
  const refuelPrice = atStation ? 10 : 100;
  const hintInfo = room.isChampionship ? getSoloHintInfo(me, atStation) : getHintInfo(me, other, atStation);

  const handleRoll = async (useNitro, useTurbo) => {
    const rollFn = room.isChampionship ? championshipRollDice : room.isTraining ? trainingRollDice : rollDice;
    await run('roll', () => rollFn(room.id, useNitro, useTurbo), { waitForConfirm: true });
  };

  const rollButtonLabel = () => {
    const timeSuffix = room.isTraining || room.isChampionship ? '' : ` (${secondsLeft ?? '—'}s)`;
    if (!isMyTurn) return `${other.displayName}'in sırası…${timeSuffix}`;
    if (busy) return 'Atılıyor…';
    if (isFinalTurnForMe) return `Son hamlen! Zar At${timeSuffix}`;
    return me.nitroActive ? `Zar At — Nitro Aktif${timeSuffix}` : `Zar At${timeSuffix}`;
  };

  return (
    <div className="race-screen">
      <p className="race-panel-title">
        Yarış
        <InfoIcon text={room.isChampionship ? CHAMPIONSHIP_RULES_TEXT : RULES_TEXT} />
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
        {other && (
          <div
            className="race-car other"
            style={{ left: `${Math.min(96, (other.position / 300) * 100)}%` }}
          >
            🚙
          </div>
        )}
      </div>
      <div className="race-positions">
        <span className="race-position-label">
          Sen: {me.position}/300
          {myReaction && <span className="race-reaction">{myReaction}</span>}
        </span>
        {other ? (
          <span className="race-position-label">
            {other.displayName}: {other.position}/300
            {otherReaction && <span className="race-reaction">{otherReaction}</span>}
          </span>
        ) : (
          <span className="race-position-label">Tur: {me.turnsUsed || 0}</span>
        )}
      </div>

      <div className="race-stat-boxes">
        <div
          className={`race-stat-box-combo${
            me.fuel <= 0 ? ' danger' : me.fuel < 20 ? ' warning' : ''
          }`}
        >
          <div className="race-stat-combo-row">
            <span className="race-stat-emoji">⛽</span>
            <span className="race-stat-value">{me.fuel}/{me.maxFuel}</span>
          </div>
          <div className="race-fuel-bar">
            <div
              className="race-fuel-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, (me.fuel / me.maxFuel) * 100))}%` }}
            />
          </div>
          <div className="race-stat-combo-row">
            <span className="race-stat-coin" />
            <span className="race-stat-value">{me.raceGold}</span>
          </div>
        </div>

        <div className={`race-hint-box ${hintInfo.tone}`}>
          <p>{hintInfo.text}</p>
          {me.turboCount > 0 && <span className="race-hint-turbo">🚀 Turbo ×{me.turboCount}</span>}
        </div>
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
        {other && (
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
        )}
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
          disabled={busy || !isMyTurn || me.raceGold < 50 || me.nitroActive}
          onClick={() => run('nitro', () => raceBuyNitro(room.id))}
        >
          {me.nitroActive ? '🔥 Nitro Alındı' : '🔥 Nitro (50)'}
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
          className={`race-btn${me.fuel <= 0 ? ' primary' : ''}${atStation && me.fuel < me.maxFuel ? ' station' : ''}`}
          disabled={busy || me.raceGold < refuelPrice || me.fuel >= me.maxFuel}
          onClick={() => run('refuel', () => raceRefuel(room.id))}
        >
          {me.fuel >= me.maxFuel
            ? '⛽ Benzin Dolu'
            : atStation
              ? `⛽ İSTASYONDASIN — Benzin Doldur (${refuelPrice})`
              : `⛽ Benzin Doldur (${refuelPrice})`}
        </button>
      )}

      {error && <p className="race-error">{error}</p>}

      <div className="race-emoji-row">
        {RACE_EMOJIS.map((e) => (
          <button
            key={e}
            className="race-emoji-btn"
            onClick={() => sendRaceEmoji(room.id, e).catch(() => {})}
          >
            {e}
          </button>
        ))}
        <button
          className="race-emoji-btn race-refresh-btn"
          onClick={() => pingRaceRoom(room.id).catch(() => {})}
          aria-label="Yenile"
        >
          🔄
        </button>
      </div>
      <p className="race-refresh-hint">Oyun donduysa 🔄 yenile butonuna bas.</p>
    </div>
  );
}
