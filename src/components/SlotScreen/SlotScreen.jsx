import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDailyActions } from '../../hooks/useDailyActions';
import { spinSlot } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './SlotScreen.css';

const SPIN_COST = 500;

const SYMBOL_EMOJI = {
  tamirMalzemesi: '🔧',
  silahUpgrade: '🔫',
  arabaGelistirme: '🚗',
  yasakliMadde: '💊',
};
const SYMBOL_LABEL = {
  tamirMalzemesi: 'Tamir Malzemesi',
  silahUpgrade: 'Silah Geliştirme Malzemesi',
  arabaGelistirme: 'Araba Geliştirme Malzemesi',
  yasakliMadde: 'Yasaklı Madde',
  altin: 'Altın',
};
const ALL_SYMBOLS = ['yasakliMadde', 'silahUpgrade', 'tamirMalzemesi', 'arabaGelistirme', 'altin'];

// 🪙 emojisi bazı platformlarda (masaüstü tarayıcılar, bazı iPhone
// sürümleri) hiç görünmüyor ya da gümüşi/soluk çıkıyor — bu yüzden altın
// sembolü emoji değil, oyunun her yerinde kullandığımız CSS ile çizilmiş
// sarı yuvarlak olarak gösteriliyor.
function SlotSymbol({ symbol }) {
  if (symbol === 'altin') return <span className="slot-gold-coin" />;
  if (symbol === 'placeholder') return <span>❓</span>;
  return <span>{SYMBOL_EMOJI[symbol] || '❓'}</span>;
}

export default function SlotScreen() {
  const { user } = useAuth();
  const { actions } = useDailyActions();
  const [displayed, setDisplayed] = useState(['placeholder', 'placeholder', 'placeholder']);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // "Seri" (hızlı) mod: oyuna her girişte kapalı başlar, sadece bu ekranda
  // kalındığı sürece açık kalır — kalıcı olarak saklanmıyor.
  const [fastMode, setFastMode] = useState(false);
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

  const FREE_SPINS_PER_DAY = 3;
  const freeSpinsUsed = actions.slotFreeSpinsUsed || 0;
  const freeSpinsLeft = Math.max(0, FREE_SPINS_PER_DAY - freeSpinsUsed);
  const hasFreeSpin = freeSpinsLeft > 0;

  const handleSpin = async () => {
    setBusy(true);
    setError(null);
    setResult(null);

    intervalsRef.current.forEach(clearInterval);
    timeoutsRef.current.forEach(clearTimeout);
    setSpinning([true, true, true]);

    const intervals = [0, 1, 2].map((i) =>
      setInterval(
        () => {
          setDisplayed((prev) => {
            const next = [...prev];
            next[i] = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
            return next;
          });
        },
        // Seri modda makaralar daha hızlı karışsın ki kısa sürede bile
        // gerçekten "dönüyor" gibi hissettirsin (sabit son kareye yapışıp
        // kalmasın).
        fastMode ? 40 : 80
      )
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
          next[index] = reels[index];
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

    // Seri mod: makaralar hâlâ görünür şekilde dönüyor ama toplam ~1
    // saniyede art arda hızlıca duruyor — tamamen animasyonsuz "anında
    // sonuç" slot hissini bozuyordu, bu yüzden kısa ama gerçek bir dönüş
    // bırakıldı. Normal modda ise klasik yavaş/gerilimli duruş sırası
    // korunuyor.
    const [d0, d1, d2] = fastMode ? [300, 650, 1000] : [1200, 2200, 3200];
    stopReel(0, d0, false);
    stopReel(1, d1, false);
    stopReel(2, d2, true);
  };

  return (
    <div className="slot-screen">
      <div className="slot-header">
        <p className="slot-title">
          Slot
        </p>
        <button
          type="button"
          className={`slot-fast-toggle${fastMode ? ' active' : ''}`}
          onClick={() => setFastMode((v) => !v)}
          disabled={busy}
          title="Aktifken çevirme animasyonu olmadan sonucu anında gösterir"
        >
          Seri
        </button>
      </div>

      <div className="slot-reels">
        {displayed.map((sym, i) => (
          <div key={i} className={`slot-reel${spinning[i] ? ' spinning' : ''}`}>
            <SlotSymbol symbol={sym} />
          </div>
        ))}
      </div>

      <p className="slot-cost-hint">
        {hasFreeSpin
          ? `Bugün kalan ücretsiz çevirme hakkın: ${freeSpinsLeft}`
          : `Çevirme ücreti: ${SPIN_COST.toLocaleString('tr-TR')} altın`}
      </p>

      <button className="slot-spin-btn" disabled={busy} onClick={handleSpin}>
        {busy ? 'Çevriliyor…' : hasFreeSpin ? 'Ücretsiz Çevir' : `Çevir (${SPIN_COST.toLocaleString('tr-TR')} altın)`}
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
