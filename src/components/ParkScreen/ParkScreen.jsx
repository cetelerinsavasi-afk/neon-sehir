import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { sellContrabandAtPark } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './ParkScreen.css';

const PARK_SELL_PRICE = 5000;

export default function ParkScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!user) {
    return <SignInPrompt message="Park'ta satış yapmak için giriş yapmalısın." />;
  }

  const contrabandQty = inventory.yasakliMadde || 0;
  const suspicion = player?.suspicion || 0;

  const handleSell = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await sellContrabandAtPark();
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Satış başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="park-screen">
      <p className="park-hint">
        Sahip olduğun kaçak mal: <strong>{contrabandQty} adet</strong> · Satış fiyatı{' '}
        {PARK_SELL_PRICE.toLocaleString('tr-TR')} altın/adet
        <InfoIcon text="Her satışta o anki şüphe yüzden kadar ihtimalle polis seni yakalayabilir (örn. şüphen %40 ise %40 ihtimalle). Yakalanırsan kazanacağın altın yerine aynı miktar devlete borç yazılır. Her satış (yakalansan da yakalanmasan da) şüpheni +5 artırır." />
      </p>
      <p className="park-suspicion-hint">Şu anki yakalanma riskin: %{suspicion}</p>

      <button className="park-btn primary" disabled={busy || contrabandQty < 1} onClick={handleSell}>
        {busy ? 'Satılıyor…' : contrabandQty < 1 ? 'Malın yok' : 'Sokakta Sat (1 adet)'}
      </button>

      {result && (
        <p className={`park-result ${result.caught ? 'caught' : 'success'}`}>
          {result.caught
            ? `Yakalandın! ${result.penalty.toLocaleString('tr-TR')} altın devlete borç yazıldı.`
            : `Satıldı! +${result.earned.toLocaleString('tr-TR')} altın kazandın.`}
        </p>
      )}
      {error && <p className="park-error">{error}</p>}
    </div>
  );
}
