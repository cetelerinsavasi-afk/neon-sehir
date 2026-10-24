import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { spinSlot } from '../../services/gameActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import { SLOT_GAME_COST, SLOT_SYMBOLS } from '../../../functions/casinoRules.js';
import './SlotScreen.css';

// v124 — 3 sembol: boş · yasaklı madde · altın (kurallar functions/casinoRules.js)
const SYMBOL_EMOJI = { bos: '✖️', yasakliMadde: '💊' };
const ALL_SYMBOLS = SLOT_SYMBOLS;
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

// 🪙 emojisi bazı platformlarda (masaüstü tarayıcılar, bazı iPhone
// sürümleri) hiç görünmüyor ya da gümüşi/soluk çıkıyor — bu yüzden altın
// sembolü emoji değil, oyunun her yerinde kullandığımız CSS ile çizilmiş
// sarı yuvarlak olarak gösteriliyor.
function SlotSymbol({ symbol }) {
  if (symbol === 'altin') return <span className="slot-gold-coin" />;
  if (symbol === 'placeholder') return <span>❓</span>;
  return <span>{SYMBOL_EMOJI[symbol] || '❓'}</span>;
}

// casinoId / price: oyuncu gazinoları için (v124 Faz 6). Varsayılan oyunun gazinosu.
// blocked: çevirmeyi engelleyen sebep (ör. "slot çalışmıyor") · onResult: sonuç
// onState: v124 Faz 7 yayın — ({ id, s: dönüyor mu, r: makaralar, res }) → izleyicide SlotMirror
export default function SlotScreen({ casinoId = 'game', price = SLOT_GAME_COST, blocked = null, onResult, onState }) {
  const { user } = useAuth();
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

  const handleSpin = async () => {
    setBusy(true);
    setError(null);
    setResult(null);

    intervalsRef.current.forEach(clearInterval);
    timeoutsRef.current.forEach(clearTimeout);
    setSpinning([true, true, true]);
    const spinId = Date.now();
    onState?.({ id: spinId, s: 1 });

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
      res = await spinSlot(casinoId, casinoId === 'game' ? null : price);
    } catch (err) {
      intervals.forEach(clearInterval);
      setSpinning([false, false, false]);
      setError(err.message || 'Çevirme başarısız.');
      setBusy(false);
      onState?.({ id: spinId, s: 0, r: null, res: null });
      return;
    }

    const { reels, matchCount, matchSymbol, gold, yasakliMadde } = res.data;

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
          setResult({ matchCount, matchSymbol, gold: gold || 0, yasakliMadde: yasakliMadde || 0 });
          setBusy(false);
          onResult?.({ reels, matchCount, matchSymbol, gold: gold || 0, yasakliMadde: yasakliMadde || 0, cost: res.data.cost ?? price });
          onState?.({ id: spinId, s: 0, r: reels, res: { matchCount, matchSymbol, gold: gold || 0, yasakliMadde: yasakliMadde || 0 } });
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

      <p className="slot-cost-hint">Çevirme ücreti: {fmt(price)} altın</p>

      {blocked && <p className="slot-error">{blocked}</p>}
      <button className="slot-spin-btn" disabled={busy || Boolean(blocked)} onClick={handleSpin}>
        {busy ? 'Çevriliyor…' : `Çevir (${fmt(price)} altın)`}
      </button>

      {result && (
        <p className={`slot-result ${result.gold || result.yasakliMadde ? 'win' : ''}`}>
          {result.gold > 0
            ? `🎉 ${result.matchCount} altın! +${fmt(result.gold)} altın`
            : result.yasakliMadde > 0
              ? `🎉 ${result.matchCount} yasaklı madde! +${result.yasakliMadde} yasaklı madde`
              : result.matchSymbol === 'bos'
                ? `${result.matchCount} boş — ödül yok, tekrar dene!`
                : 'Bu sefer olmadı, tekrar dene!'}
        </p>
      )}

      <div className="slot-paytable" aria-label="Ödül tablosu">
        <div className="slot-pay-row head">
          <span>Sembol</span>
          <span>2 aynı</span>
          <span>3 aynı</span>
        </div>
        <div className="slot-pay-row">
          <span>✖️ Boş</span>
          <span>0</span>
          <span>0</span>
        </div>
        <div className="slot-pay-row">
          <span>💊 Yasaklı madde</span>
          <span>1 adet</span>
          <span>3 adet</span>
        </div>
        <div className="slot-pay-row">
          <span>
            <span className="slot-gold-coin small" /> Altın
          </span>
          <span>1.000</span>
          <span>10.000</span>
        </div>
      </div>
      {error && <p className="slot-error">{error}</p>}
    </div>
  );
}

// v124 Faz 7 — yayın izleyicisi: yayıncının slotu (butonsuz). mirror: SlotScreen onState çıktısı
export function SlotMirror({ mirror, price = SLOT_GAME_COST }) {
  const [shown, setShown] = useState(['placeholder', 'placeholder', 'placeholder']);
  const spinning = Boolean(mirror?.s);
  useEffect(() => {
    if (!spinning) {
      if (mirror?.r) setShown(mirror.r);
      return undefined;
    }
    const iv = setInterval(() => setShown([0, 1, 2].map(() => ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)])), 80);
    return () => clearInterval(iv);
  }, [spinning, mirror?.id, mirror?.r]);
  const res = !spinning ? mirror?.res : null;
  return (
    <div className="slot-screen">
      <div className="slot-header">
        <p className="slot-title">Slot</p>
      </div>
      <div className="slot-reels">
        {shown.map((sym, i) => (
          <div key={i} className={`slot-reel${spinning ? ' spinning' : ''}`}>
            <SlotSymbol symbol={sym} />
          </div>
        ))}
      </div>
      <p className="slot-cost-hint">{fmt(price)} altın</p>
      {res && (
        <p className={`slot-result ${res.gold || res.yasakliMadde ? 'win' : ''}`}>
          {res.gold > 0 ? `🎉 +${fmt(res.gold)} altın` : res.yasakliMadde > 0 ? `🎉 +${res.yasakliMadde} yasaklı madde` : 'Bu sefer olmadı'}
        </p>
      )}
    </div>
  );
}
