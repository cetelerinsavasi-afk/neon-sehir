import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDailyActions } from '../../hooks/useDailyActions';
import { spinSlot } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import InfoIcon from '../InfoIcon/InfoIcon';
import './SlotScreen.css';

const SPIN_COST = 750;

const SYMBOL_EMOJI = {
  yasakliMadde: '💊',
  silahUpgrade: '🔧',
  depoUpgrade: '🛢️',
  vitesUpgrade: '⚙️',
  altin: '🪙',
};
const SYMBOL_LABEL = {
  yasakliMadde: 'Yasaklı Madde',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  depoUpgrade: 'Depo Geliştirme Malzemesi',
  vitesUpgrade: 'Vites Geliştirme Malzemesi',
  altin: 'Altın',
};
const ALL_EMOJIS = Object.values(SYMBOL_EMOJI);

const RULES_TEXT =
  "3 makarada 5 farklı sembol (Yasaklı Madde, Silah/Depo/Vites Geliştirme Malzemesi, Altın) tamamen rastgele çıkar. Hepsi farklıysa ödül yok. 2 aynı sembol gelirse küçük, 3 aynı sembol gelirse büyük ödül kazanırsın. Günün ilk çevirmesi ücretsiz, sonrası 750 altın.";

export default function SlotScreen() {
  const { user } = useAuth();
  const { actions } = useDailyActions();
  const [displayed, setDisplayed] = useState(['❓', '❓', '❓']);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timeoutsRef = useRef([]);
  const intervalsRef = useRef([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
    };
  }, []);

  if (!user) {
    return <SignInPrompt message="Slot oynamak için giriş yapmalısın." />;
  }

  const freeUsed = Boolean(actions.slotFreeSpinUsed);

  const handleSpin = async () => {
    setBusy(true);
    setError(null);
    setResult(null);

    intervalsRef.current.forEach(clearInterval);
    timeoutsRef.current.forEach(clearTimeout);
    setSpinning([true, true, true]);

    const intervals = [0, 1, 2].map((i) =>
      setInterval(() => {
        setDisplayed((prev) => {
          const next = [...prev];
          next[i] = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
          return next;
        });
      }, 80)
    );
    intervalsRef.current = intervals;

    let res;
    try {
      res = await spinSlot();
    } catch (err) {
      intervals.forEach(clearInterval);
      setSpinning([false, false, false]);
      setError(err.message || 'Çevirme başarısız.');
      setBusy(false);
      return;
    }

    const { reels, matchCount, prizeSymbol, prizeAmount, free } = res.data;

    const stopReel = (index, delay, isLast) => {
      const t = setTimeout(() => {
        clearInterval(intervals[index]);
        setDisplayed((prev) => {
          const next = [...prev];
          next[index] = SYMBOL_EMOJI[reels[index]];
          return next;
        });
        setSpinning((prev) => {
          const next = [...prev];
          next[index] = false;
          return next;
        });
        if (isLast) {
          setResult({ matchCount, prizeSymbol, prizeAmount, free });
          setBusy(false);
        }
      }, delay);
      timeoutsRef.current.push(t);
    };

    stopReel(0, 1200, false);
    stopReel(1, 2200, false);
    stopReel(2, 3200, true);
  };

  return (
    <div className="slot-screen">
      <p className="slot-title">
        Slot
        <InfoIcon text={RULES_TEXT} />
      </p>

      <div className="slot-reels">
        {displayed.map((sym, i) => (
          <div key={i} className={`slot-reel${spinning[i] ? ' spinning' : ''}`}>
            {sym}
          </div>
        ))}
      </div>

      <p className="slot-cost-hint">
        {freeUsed ? `Çevirme ücreti: ${SPIN_COST.toLocaleString('tr-TR')} altın` : 'İlk çevirme bugün ücretsiz!'}
      </p>

      <button className="slot-spin-btn" disabled={busy} onClick={handleSpin}>
        {busy ? 'Çevriliyor…' : freeUsed ? `Çevir (${SPIN_COST.toLocaleString('tr-TR')} altın)` : 'Ücretsiz Çevir'}
      </button>

      {result && (
        <p className={`slot-result ${result.prizeSymbol ? 'win' : ''}`}>
          {result.prizeSymbol
            ? `🎉 ${result.matchCount} aynı sembol! +${result.prizeAmount.toLocaleString('tr-TR')} ${SYMBOL_LABEL[result.prizeSymbol]}`
            : 'Bu sefer olmadı, tekrar dene!'}
        </p>
      )}
      {error && <p className="slot-error">{error}</p>}
    </div>
  );
}
