import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useLottery } from '../../hooks/useLottery';
import { buyLotteryTicket } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './LotteryScreen.css';
import { LOTTERY_TICKET, GAME_LOTTERY_CUT } from '../../../functions/casinoRules.js';


// v124 Faz 6: casinoId + cut + price — oyuncu gazinosunun kendi piyangosu (bilet = 90
// havuza + sahibin kârı 1–10). blocked: alımı engelleyen sebep.
export default function LotteryScreen({ casinoId = 'game', cut = GAME_LOTTERY_CUT, price = LOTTERY_TICKET, blocked = null }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { today, yesterday, myTickets } = useLottery(casinoId);
  const TICKET_PRICE = price; // v124: oyuncu gazinosunda 90 + kâr (91–100)
  const POOL_PER_TICKET = TICKET_PRICE - cut;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Piyango bileti almak için giriş yapmalısın." />;
  }

  const prize = today?.jackpot ?? 0; // v124: havuz 0'dan başlar
  const totalTickets = today?.totalTickets ?? 0;
  const gold = player?.gold ?? 0;

  const handleBuy = async (qty) => {
    setBusy(qty);
    setError(null);
    try {
      await buyLotteryTicket(qty, casinoId, casinoId === 'game' ? null : TICKET_PRICE);
    } catch (err) {
      setError(err.message || 'Bilet alınamadı.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="lottery-screen">
      <div className="lottery-prize-card">
        <span className="lottery-prize-emoji">🎟️</span>
        <p className="lottery-prize-label">Bugünkü Ödül</p>
        <p className="lottery-prize-value">{prize.toLocaleString('tr-TR')} altın</p>
        <p className="lottery-prize-hint">Her bilet havuza {POOL_PER_TICKET} altın ekliyor! Çekiliş her gece 00:00'da.</p>
      </div>

      <div className="lottery-stats-row">
        <div className="lottery-stat-box">
          <span className="lottery-stat-emoji">🎫</span>
          <span className="lottery-stat-value">{totalTickets}</span>
          <span className="lottery-stat-label">Bugün satılan</span>
        </div>
        <div className="lottery-stat-box mine">
          <span className="lottery-stat-emoji">✋</span>
          <span className="lottery-stat-value">{myTickets}</span>
          <span className="lottery-stat-label">Sende olan</span>
        </div>
      </div>

      <div className="lottery-buy-row">
        <button
          className="lottery-buy-btn"
          disabled={Boolean(blocked) || busy || gold < TICKET_PRICE}
          onClick={() => handleBuy(1)}
        >
          🎟️ 1 Bilet Al
          <span className="lottery-buy-price">{TICKET_PRICE} altın</span>
        </button>
        <button
          className="lottery-buy-btn primary"
          disabled={Boolean(blocked) || busy || gold < TICKET_PRICE * 10}
          onClick={() => handleBuy(10)}
        >
          🎟️×10 Bilet Al
          <span className="lottery-buy-price">{(TICKET_PRICE * 10).toLocaleString('tr-TR')} altın</span>
        </button>
        <button
          className="lottery-buy-btn primary"
          disabled={Boolean(blocked) || busy || gold < TICKET_PRICE * 100}
          onClick={() => handleBuy(100)}
        >
          🎟️×100 Bilet Al
          <span className="lottery-buy-price">{(TICKET_PRICE * 100).toLocaleString('tr-TR')} altın</span>
        </button>
      </div>
      {blocked && <p className="lottery-error">{blocked}</p>}
      {error && <p className="lottery-error">{error}</p>}

      {yesterday?.winnerAmount && (
        <div className="lottery-winner-card">
          <span className="lottery-stat-emoji">🏆</span>
          <p className="lottery-hint">
            Dünün kazananı: <strong>{yesterday.winnerName || 'Bir oyuncu'}</strong> —{' '}
            {yesterday.winnerAmount.toLocaleString('tr-TR')} altın
            {yesterday.winnerTax ? ` (vergi sonrası ${(yesterday.winnerNet || 0).toLocaleString('tr-TR')})` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
