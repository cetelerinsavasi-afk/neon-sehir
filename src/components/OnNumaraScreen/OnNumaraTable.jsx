import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import {
  dealOnNumaraCards,
  onNumaraHit,
  onNumaraStand,
  onNumaraAutoStand,
  leaveOnNumaraTable,
  sendOnNumaraEmoji,
} from '../../services/gameActions';
import { useOnNumaraTableById } from '../../hooks/useOnNumaraTableById';
import './OnNumaraTable.css';

const EMOJIS = ['😂', '😢', '😡', '😮', '👍', '🔥'];
const TARGET = 10;

function sumOf(cards) {
  return cards.reduce((a, b) => a + b, 0);
}

function useCountdown(deadline) {
  const [secondsLeft, setSecondsLeft] = useState(null);
  useEffect(() => {
    if (!deadline?.toMillis) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline.toMillis() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);
  return secondsLeft;
}

function useAutoStandWatcher(tableId, deadline, active) {
  const firedFor = useRef(null);
  useEffect(() => {
    if (!active || !deadline?.toMillis) return;
    const key = deadline.toMillis();
    const check = () => {
      if (key <= Date.now() && firedFor.current !== key) {
        firedFor.current = key;
        onNumaraAutoStand(tableId).catch(() => {});
      }
    };
    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [tableId, deadline, active]);
}

function statusInfo(status) {
  if (status === 'bust') return { cls: 'bust', text: 'Elendi' };
  if (status === 'stand') return { cls: 'stand', text: 'Pas' };
  if (status === 'won') return { cls: 'win', text: 'Kazandı' };
  return { cls: '', text: 'Oynuyor' };
}

function Seat({ name, cards, status, hidden, isActive, isDealer, reaction, secondsLeft }) {
  const revealed = !hidden;
  const total = revealed ? sumOf(cards) : cards.length ? '?' : '–';
  const pct = revealed ? Math.min(100, (sumOf(cards) / TARGET) * 100) : 0;
  const { cls, text } = statusInfo(status);

  return (
    <div className={`onn-seat${isDealer ? ' onn-seat-dealer' : ''}${isActive ? ' onn-seat-active' : ''}`}>
      <div className="onn-seat-head">
        <span className="onn-seat-name">
          <span className="onn-chip-dot" />
          {name}
          {reaction && <span className="onn-reaction">{reaction}</span>}
        </span>
        <span className={`onn-status-pill ${cls}`}>{text}</span>
      </div>
      <div className="onn-cards">
        {cards.map((c, i) => (
          <span key={i} className={`onn-card${hidden ? ' onn-card-back' : ''}`}>
            {hidden ? '' : c}
          </span>
        ))}
      </div>
      <div className="onn-sum-row">
        <span className="onn-sum">
          Toplam: <strong>{total}</strong>
        </span>
        {isActive && secondsLeft !== null && <span className="onn-seat-timer">{secondsLeft}s</span>}
        <div className="onn-gauge">
          <div className="onn-gauge-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function OnNumaraTable({ tableId, myUid, onLeave }) {
  const { table } = useOnNumaraTableById(tableId);
  const { player } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // "Kart Çek" sunucuda işlendikten hemen sonra buton tekrar aktif olursa,
  // ama Firestore dinleyicisi (onSnapshot) henüz yeni kart sayısını
  // yansıtmadıysa, oyuncu "hiçbir şey olmadı" sanıp tekrar basıyor ve
  // GERÇEKTEN 2. bir kart çekiliyordu. Çözüm: hamle sonrası, dinleyici
  // gerçekten yeni durumu (kart sayısı arttı / sıra değişti / faz
  // değişti) yansıtana kadar butonu kilitli tutuyoruz.
  const pendingConfirmRef = useRef(null);

  const round = table?.round;
  const isMyTurn = round?.phase === 'playing' && round.currentTurnUid === myUid;
  const secondsLeft = useCountdown(round?.turnDeadline);
  useAutoStandWatcher(tableId, round?.turnDeadline, round?.phase === 'playing');

  useEffect(() => {
    const pending = pendingConfirmRef.current;
    if (!pending) return;
    const myCardsNow = round?.hands?.[myUid]?.cards?.length || 0;
    const changed =
      myCardsNow > pending.cardsBefore ||
      round?.currentTurnUid !== pending.turnUidBefore ||
      round?.phase !== pending.phaseBefore;
    if (changed) {
      pendingConfirmRef.current = null;
      setBusy(false);
    }
  }, [round, myUid]);

  const run = async (key, fn, { waitForConfirm = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (waitForConfirm) {
        pendingConfirmRef.current = {
          cardsBefore: round?.hands?.[myUid]?.cards?.length || 0,
          turnUidBefore: round?.currentTurnUid ?? null,
          phaseBefore: round?.phase ?? null,
        };
        // Güvenlik: dinleyici 4 saniyede hâlâ güncellenmediyse yine de
        // kilidi aç — oyuncu ekranda sonsuza dek kilitli kalmasın.
        setTimeout(() => {
          if (pendingConfirmRef.current) {
            pendingConfirmRef.current = null;
            setBusy(false);
          }
        }, 4000);
        return;
      }
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      if (!waitForConfirm) setBusy(false);
    }
  };

  if (!table) {
    return <p className="onn-hint">Masa yükleniyor…</p>;
  }

  const isCreator = table.creatorUid === myUid;
  const iAmSeated = table.seatOrder.includes(myUid);
  const canDeal = isCreator && (!round || round.phase === 'resolved');
  const dealerHidden = round && round.phase !== 'resolved' && round.phase !== 'dealer';

  return (
    <div className="onn-table">
      <div className="onn-gold-row">
        <span className="onn-gold-coin" />
        <span className="onn-gold-value">{(player?.gold ?? 0).toLocaleString('tr-TR')}</span>
      </div>
      <div className="onn-pot-row">
        <div className="onn-pot-badge">POT: {(round?.pot || 0).toLocaleString('tr-TR')}</div>
      </div>
      <p className="onn-table-meta">
        {table.capacity} kişilik masa · Bahis {table.betAmount.toLocaleString('tr-TR')} altın
      </p>

      <div className="onn-seats">
        <Seat
          name="Kurpiyer"
          cards={round?.dealerCards || []}
          status={round?.dealerStatus || 'playing'}
          hidden={Boolean(dealerHidden)}
          isDealer
          isActive={false}
          secondsLeft={null}
        />
        {table.seatOrder.map((uid) => {
          const seat = table.seats[uid];
          const hand = round?.hands?.[uid];
          const reaction = table.reactions?.[uid];
          const showReaction = reaction && Date.now() - reaction.at < 3000;
          return (
            <Seat
              key={uid}
              name={`${seat?.displayName || 'Oyuncu'}${uid === myUid ? ' (Sen)' : ''}`}
              cards={hand?.cards || []}
              status={hand?.status || (round ? 'playing' : 'idle')}
              hidden={false}
              isDealer={false}
              isActive={round?.currentTurnUid === uid}
              reaction={showReaction ? reaction.emoji : null}
              secondsLeft={round?.currentTurnUid === uid ? secondsLeft : null}
            />
          );
        })}
      </div>

      {round?.phase === 'resolved' && round.result && (
        <p className="onn-log">
          {round.result.draw
            ? 'Berabere! Kurpiyer de sen de elendiniz — bahsin iade edildi.'
            : round.result.dealerWon
              ? 'Kurpiyer kazandı, pot kimseye ödenmedi.'
              : round.result.winners.length > 0
                ? `Kazanan: ${round.result.winners
                    .map((u) => table.seats[u]?.displayName || 'Oyuncu')
                    .join(', ')} · Pay: ${round.result.share.toLocaleString('tr-TR')} altın${
                    round.result.dealerTied ? ' (kurpiyerle berabere, pot bölündü)' : ''
                  }`
                : 'Herkes elendi, pot kimseye ödenmedi.'}
        </p>
      )}

      <div className="onn-controls">
        {canDeal && iAmSeated && (
          <button className="onn-btn-deal" disabled={busy} onClick={() => run('deal', () => dealOnNumaraCards(tableId))}>
            Kart Dağıt
          </button>
        )}
        {isMyTurn && (
          <>
            <button className="onn-btn-hit" disabled={busy} onClick={() => run('hit', () => onNumaraHit(tableId), { waitForConfirm: true })}>
              {busy ? 'Çekiliyor…' : 'Kart Çek'}
            </button>
            <button className="onn-btn-stand" disabled={busy} onClick={() => run('stand', () => onNumaraStand(tableId), { waitForConfirm: true })}>
              Pas
            </button>
          </>
        )}
        <button
          className="onn-btn-leave"
          disabled={busy}
          onClick={() =>
            run('leave', async () => {
              await leaveOnNumaraTable(tableId);
              onLeave();
            })
          }
        >
          Masadan Ayrıl
        </button>
      </div>

      {iAmSeated && (
        <div className="onn-emoji-row">
          {EMOJIS.map((e) => (
            <button key={e} className="onn-emoji-btn" onClick={() => sendOnNumaraEmoji(tableId, e).catch(() => {})}>
              {e}
            </button>
          ))}
        </div>
      )}

      {error && <p className="onn-error">{error}</p>}
    </div>
  );
}
