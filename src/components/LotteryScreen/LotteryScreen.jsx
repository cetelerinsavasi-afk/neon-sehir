import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useLottery } from '../../hooks/useLottery';
import { buyLotteryTicket } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './LotteryScreen.css';

const TICKET_PRICE = 100;

export default function LotteryScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { today, yesterday, myTickets } = useLottery();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Piyango bileti almak için giriş yapmalısın." />;
  }

  const prize = today?.jackpot ?? 1000;
  const totalTickets = today?.totalTickets ?? 0;
  const gold = player?.gold ?? 0;

  const handleBuy = async (qty) => {
    setBusy(qty);
    setError(null);
    try {
      await buyLotteryTicket(qty);
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
        <p className="lottery-prize-hint">Her satılan bilet ödülü büyütüyor!</p>
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
          disabled={busy || gold < TICKET_PRICE}
          onClick={() => handleBuy(1)}
        >
          🎟️ 1 Bilet Al
          <span className="lottery-buy-price">{TICKET_PRICE} altın</span>
        </button>
        <button
          className="lottery-buy-btn primary"
          disabled={busy || gold < TICKET_PRICE * 10}
          onClick={() => handleBuy(10)}
        >
          🎟️×10 Bilet Al
          <span className="lottery-buy-price">{(TICKET_PRICE * 10).toLocaleString('tr-TR')} altın</span>
        </button>
      </div>
      {error && <p className="lottery-error">{error}</p>}

      {yesterday?.winnerAmount && (
        <div className="lottery-winner-card">
          <span className="lottery-stat-emoji">🏆</span>
          <p className="lottery-hint">
            Dünün kazananı: <strong>{yesterday.winnerName || 'Bir oyuncu'}</strong> —{' '}
            {yesterday.winnerAmount.toLocaleString('tr-TR')} altın
          </p>
        </div>
      )}
    </div>
  );
}
