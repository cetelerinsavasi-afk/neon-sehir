import { useEffect, useRef, useState } from 'react';
import {
  dealOnNumaraCards,
  onNumaraHit,
  onNumaraStand,
  onNumaraAutoStand,
  leaveOnNumaraTable,
  sendOnNumaraEmoji,
} from '../../services/gameActions';
import { useOnNumaraTableById } from '../../hooks/useOnNumaraTableById';
import './OnNumaraScreen.css';

const EMOJIS = ['😂', '😢', '😡', '😮', '👍', '🔥'];

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

function CardsRow({ cards, hidden }) {
  return (
    <div className="onnumara-cards">
      {cards.map((c, i) => (
        <span key={i} className="onnumara-card">
          {hidden ? '🂠' : c}
        </span>
      ))}
    </div>
  );
}

export default function OnNumaraTable({ tableId, myUid, onLeave }) {
  const { table } = useOnNumaraTableById(tableId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const round = table?.round;
  const isMyTurn = round?.phase === 'playing' && round.currentTurnUid === myUid;
  const secondsLeft = useCountdown(round?.turnDeadline);
  useAutoStandWatcher(tableId, round?.turnDeadline, round?.phase === 'playing');

  const run = async (key, fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  if (!table) {
    return <p className="onnumara-hint">Masa yükleniyor…</p>;
  }

  const isCreator = table.creatorUid === myUid;
  const iAmSeated = table.seatOrder.includes(myUid);
  const canDeal = isCreator && (!round || round.phase === 'resolved');
  const dealerHidden = round && round.phase !== 'resolved' && round.phase !== 'dealer';

  return (
    <div className="onnumara-screen">
      <div className="onnumara-section">
        <div className="onnumara-table-header">
          <span>
            {table.capacity} kişilik · Bahis {table.betAmount.toLocaleString('tr-TR')} altın
            {round?.pot ? ` · Pot: ${round.pot.toLocaleString('tr-TR')}` : ''}
          </span>
          <button className="onnumara-btn" disabled={busy} onClick={() => run('leave', async () => { await leaveOnNumaraTable(tableId); onLeave(); })}>
            Masadan Ayrıl
          </button>
        </div>
      </div>

      <div className="onnumara-section">
        <p className="onnumara-section-title">Kurpiyer</p>
        {round ? (
          <CardsRow cards={round.dealerCards} hidden={dealerHidden} />
        ) : (
          <p className="onnumara-hint">Henüz el başlamadı.</p>
        )}
        {round?.phase === 'resolved' && (
          <p className="onnumara-hint">
            Toplam: {round.dealerCards.reduce((a, b) => a + b, 0)} ({round.dealerStatus === 'bust' ? 'Elendi' : 'Durdu'})
          </p>
        )}
      </div>

      {table.seatOrder.map((uid) => {
        const seat = table.seats[uid];
        const hand = round?.hands?.[uid];
        const reaction = table.reactions?.[uid];
        const showReaction = reaction && Date.now() - reaction.at < 4000;
        return (
          <div key={uid} className={`onnumara-seat${round?.currentTurnUid === uid ? ' active' : ''}`}>
            <div className="onnumara-seat-head">
              <span className="onnumara-seat-name">
                {seat?.displayName || 'Oyuncu'} {uid === myUid && '(Sen)'}
                {showReaction && <span className="onnumara-reaction">{reaction.emoji}</span>}
              </span>
              {hand && (
                <span className={`onnumara-status-pill ${hand.status}`}>
                  {hand.status === 'bust'
                    ? 'Elendi'
                    : hand.status === 'won'
                      ? 'Kazandı'
                      : hand.status === 'stand'
                        ? 'Pas'
                        : 'Oynuyor'}
                </span>
              )}
            </div>
            {hand && <CardsRow cards={hand.cards} hidden={false} />}
            {hand && <p className="onnumara-hint">Toplam: {hand.cards.reduce((a, b) => a + b, 0)}</p>}
          </div>
        );
      })}

      {round?.phase === 'resolved' && round.result && (
        <div className="onnumara-section">
          <p className="onnumara-section-title">Sonuç</p>
          <p className="onnumara-hint">
            {round.result.dealerWon
              ? 'Kurpiyer kazandı, pot kimseye ödenmedi.'
              : round.result.winners.length > 0
                ? `Kazanan(lar): ${round.result.winners
                    .map((u) => table.seats[u]?.displayName || 'Oyuncu')
                    .join(', ')} · Pay: ${round.result.share.toLocaleString('tr-TR')} altın`
                : 'Herkes elendi, pot kimseye ödenmedi.'}
          </p>
        </div>
      )}

      {isMyTurn && (
        <div className="onnumara-turn-banner">
          Sıra sende! ({secondsLeft ?? '—'}s)
        </div>
      )}

      <div className="onnumara-controls">
        {canDeal && iAmSeated && (
          <button className="onnumara-btn primary" disabled={busy} onClick={() => run('deal', () => dealOnNumaraCards(tableId))}>
            Kart Dağıt
          </button>
        )}
        {isMyTurn && (
          <>
            <button className="onnumara-btn primary" disabled={busy} onClick={() => run('hit', () => onNumaraHit(tableId))}>
              Kart Çek
            </button>
            <button className="onnumara-btn" disabled={busy} onClick={() => run('stand', () => onNumaraStand(tableId))}>
              Pas
            </button>
          </>
        )}
      </div>

      {iAmSeated && (
        <div className="onnumara-emoji-row">
          {EMOJIS.map((e) => (
            <button key={e} className="onnumara-emoji-btn" onClick={() => sendOnNumaraEmoji(tableId, e).catch(() => {})}>
              {e}
            </button>
          ))}
        </div>
      )}

      {error && <p className="onnumara-error">{error}</p>}
    </div>
  );
}
