import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLottery } from '../../hooks/useLottery';
import { buyLotteryTicket } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import '../CasinoScreen/CasinoScreen.css';

const TICKET_PRICE = 100;

export default function LotteryScreen() {
  const { user } = useAuth();
  const { today, yesterday, myTickets } = useLottery();
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message="Piyango bileti almak için giriş yapmalısın." />;
  }

  const jackpot = today?.jackpot ?? 1000;
  const totalTickets = today?.totalTickets ?? 0;

  const handleBuy = async () => {
    const qty = Number(quantity);
    if (!qty || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await buyLotteryTicket(qty);
      setQuantity('');
    } catch (err) {
      setError(err.message || 'Bilet alınamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="casino-screen">
      <div className="casino-jackpot-card">
        <p className="casino-jackpot-label">Bugünkü Jackpot</p>
        <p className="casino-jackpot-value">{jackpot.toLocaleString('tr-TR')} altın</p>
        <p className="casino-hint">Bugün satılan bilet: {totalTickets}</p>
        <p className="casino-hint">Bugün elindeki bilet: <strong>{myTickets}</strong></p>
      </div>

      <div className="casino-row">
        <input
          type="number"
          min="1"
          placeholder="Adet"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="casino-input"
        />
        <button className="casino-btn" disabled={busy || !quantity} onClick={handleBuy}>
          {busy ? '…' : `Bilet Al (${TICKET_PRICE} altın/adet)`}
        </button>
      </div>
      {error && <p className="casino-error">{error}</p>}

      {yesterday?.winnerAmount && (
        <div className="casino-winner-card">
          <p className="casino-hint">Dünün kazananı</p>
          <p className="casino-winner-name">
            {yesterday.winnerName || 'Bir oyuncu'} —{' '}
            {yesterday.winnerAmount.toLocaleString('tr-TR')} altın
          </p>
        </div>
      )}
    </div>
  );
}
