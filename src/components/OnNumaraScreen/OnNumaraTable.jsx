import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import {
  dealOnNumaraCards,
  onNumaraHit,
  onNumaraStand,
  onNumaraAutoStand,
  leaveOnNumaraTable,
  sendOnNumaraEmoji,
  pingOnNumaraTable,
} from '../../services/gameActions';
import { useOnNumaraTableById } from '../../hooks/useOnNumaraTableById';
import './OnNumaraTable.css';

const EMOJIS = ['😂', '😢', '😡', '😮', '👍', '🔥'];
const TARGET = 10;

function sumOf(cards) {
  return cards.reduce((a, b) => a + b, 0);
}

// deadline: Firestore Timestamp ya da ms (v93 eşzamanlı turda elin kendi süresi)
const msOf = (d) => (typeof d === 'number' ? d : d?.toMillis ? d.toMillis() : null);
function useCountdown(deadline) {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const dl = msOf(deadline);
  useEffect(() => {
    if (!dl) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [dl]);
  return secondsLeft;
}

function useAutoStandWatcher(tableId, deadline, active) {
  const firedFor = useRef(null);
  const dl = msOf(deadline);
  useEffect(() => {
    if (!active || !dl) return;
    const key = dl;
    const check = () => {
      if (key <= Date.now() && firedFor.current !== key) {
        firedFor.current = key;
        onNumaraAutoStand(tableId).catch(() => {});
      }
    };
    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [tableId, dl, active]);
}

function statusInfo(status, secret) {
  // v93: eşzamanlı turda başkasının sonucu el bitene kadar gizli
  if (secret) return status === 'playing' ? { cls: '', text: 'Düşünüyor…' } : { cls: 'stand', text: '✓ Hazır' };
  if (status === 'bust') return { cls: 'bust', text: 'Elendi' };
  if (status === 'stand') return { cls: 'stand', text: 'Pas' };
  if (status === 'won') return { cls: 'win', text: 'Kazandı' };
  return { cls: '', text: 'Oynuyor' };
}

// hideFrom: bu sıradan sonraki kartlar kapalı (v93: kurpiyerin ve diğer oyuncuların
// ilk 2 kartı açık, sonradan çekilenler el bitene kadar kapalı)
function Seat({ name, cards, status, hidden, hideFrom = null, secret = false, isActive, isDealer, reaction, secondsLeft, netChange }) {
  const cut = hidden ? 0 : hideFrom == null ? cards.length : Math.min(hideFrom, cards.length);
  const shown = cards.slice(0, cut);
  const allShown = cut >= cards.length;
  const total = allShown ? (cards.length ? sumOf(cards) : '–') : `${sumOf(shown)}+?`;
  const pct = Math.min(100, (sumOf(shown) / TARGET) * 100);
  const { cls, text } = statusInfo(status, secret);

  return (
    <div className={`onn-seat${isDealer ? ' onn-seat-dealer' : ''}${isActive ? ' onn-seat-active' : ''}`}>
      <div className="onn-seat-head">
        <span className="onn-seat-name">
          <span className="onn-chip-dot" />
          {name}
          {typeof netChange === 'number' && (
            <span className={`onn-net-change ${netChange >= 0 ? 'positive' : 'negative'}`}>
              {netChange >= 0 ? '+' : ''}
              {netChange.toLocaleString('tr-TR')}
            </span>
          )}
          {reaction && <span className="onn-reaction">{reaction}</span>}
        </span>
        <span className={`onn-status-pill ${cls}`}>{text}</span>
      </div>
      <div className="onn-cards">
        {cards.map((c, i) => (
          <span key={i} className={`onn-card${i >= cut ? ' onn-card-back' : ''}`}>
            {i >= cut ? '' : c}
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

// spectate (v82.2): yayın izleyicisi — sadece izler, butonlar yok; hostUid = yayıncı
export default function OnNumaraTable({ tableId, myUid, onLeave, spectate = false, hostUid = null }) {
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
  // v93 — eşzamanlı tur (round.simul): sıra yok, herkes kendi elini oynar
  const simul = Boolean(round?.simul);
  const myHand = round?.hands?.[myUid];
  const isMyTurn = round?.phase === 'playing' && (simul ? myHand?.status === 'playing' : round.currentTurnUid === myUid);
  const secondsLeft = useCountdown(simul ? (myHand?.status === 'playing' ? myHand.deadlineMs : null) : round?.turnDeadline);
  // otomatik pas: süresi en önce dolacak oynayan el (herhangi bir bağlı istemci tetikler)
  const nextDeadline = simul
    ? Object.values(round?.hands || {})
        .filter((h) => h?.status === 'playing' && h.deadlineMs)
        .reduce((m, h) => (m === null || h.deadlineMs < m ? h.deadlineMs : m), null)
    : round?.turnDeadline;
  useAutoStandWatcher(tableId, nextDeadline, !spectate && round?.phase === 'playing');
  // izleyici: yayıncının elini onun gördüğü gibi görür
  const viewerUid = spectate ? hostUid : myUid;
  const secretPhase = simul && round?.phase !== 'resolved';

  useEffect(() => {
    const pending = pendingConfirmRef.current;
    if (!pending) return;
    const myCardsNow = round?.hands?.[myUid]?.cards?.length || 0;
    const changed =
      myCardsNow > pending.cardsBefore ||
      round?.currentTurnUid !== pending.turnUidBefore ||
      round?.phase !== pending.phaseBefore ||
      (round?.hands?.[myUid]?.status || null) !== pending.statusBefore;
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
          statusBefore: round?.hands?.[myUid]?.status ?? null,
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
  // v93: kurpiyerin ilk 2 kartı herkese açık; sonradan çektikleri el bitince açılır
  const dealerHideFrom = round && round.phase !== 'resolved' && round.phase !== 'dealer' ? 2 : null;

  return (
    <div className={`onn-table${spectate ? ' onn-spectate' : ''}`}>
      {!spectate && (
        <div className="onn-gold-row">
          <span className="onn-gold-coin" />
          <span className="onn-gold-value">{(player?.gold ?? 0).toLocaleString('tr-TR')}</span>
        </div>
      )}
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
          hidden={false}
          hideFrom={dealerHideFrom}
          isDealer
          isActive={false}
          secondsLeft={null}
        />
        {table.seatOrder.map((uid) => {
          const seat = table.seats[uid];
          const hand = round?.hands?.[uid];
          const reaction = table.reactions?.[uid];
          const showReaction = reaction && Date.now() - reaction.at < 3000;
          const other = uid !== viewerUid;
          const secret = secretPhase && other && Boolean(hand);
          const mine = !spectate && uid === myUid;
          return (
            <Seat
              key={uid}
              name={`${spectate && uid === hostUid ? '🎥 ' : ''}${seat?.displayName || 'Oyuncu'}${!spectate && uid === myUid ? ' (Sen)' : ''}`}
              cards={hand?.cards || []}
              status={hand?.status || (round ? 'playing' : 'idle')}
              hidden={false}
              hideFrom={secret ? 2 : null}
              secret={secret}
              isDealer={false}
              isActive={simul ? round?.phase === 'playing' && hand?.status === 'playing' : round?.currentTurnUid === uid}
              reaction={showReaction ? reaction.emoji : null}
              secondsLeft={simul ? (mine && hand?.status === 'playing' ? secondsLeft : null) : round?.currentTurnUid === uid ? secondsLeft : null}
              netChange={typeof seat?.netChange === 'number' ? seat.netChange : 0}
            />
          );
        })}
      </div>

      {simul && round?.phase === 'playing' && (
        <p className="onn-log">
          {isMyTurn
            ? '⏱️ Kart çek ya da pas geç.'
            : myHand
              ? '✓ Diğer oyuncular bekleniyor…'
              : 'El oynanıyor…'}
        </p>
      )}
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

      {!spectate && (
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
      )}

      {!spectate && iAmSeated && (
        <div className="onn-emoji-row">
          {EMOJIS.map((e) => (
            <button key={e} className="onn-emoji-btn" onClick={() => sendOnNumaraEmoji(tableId, e).catch(() => {})}>
              {e}
            </button>
          ))}
          <button
            className="onn-emoji-btn onn-refresh-btn"
            onClick={() => pingOnNumaraTable(tableId).catch(() => {})}
            aria-label="Yenile"
          >
            🔄
          </button>
        </div>
      )}
      {!spectate && iAmSeated && <p className="onn-refresh-hint">Oyun donduysa 🔄 yenile butonuna bas.</p>}

      {error && <p className="onn-error">{error}</p>}
    </div>
  );
}
