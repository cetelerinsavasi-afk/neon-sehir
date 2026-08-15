import { useEffect, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { currentPrayerWindow } from '../../hooks/useMosqueAttendance';
import { WINDOW_HOURS } from '../MosqueScreen/MosqueScreen';
import { prayAtMosque, bribePolice, buyFromVendor } from '../../services/gameActions';
import { regionEmojis, regionLabels } from '../../data/regions';
import { msUntilIstanbulMidnight, msUntilNextPrayerWindow, formatCountdown } from '../../lib/istanbulTime';
import GuestOverlay from '../GuestOverlay/GuestOverlay';
import './SuspicionTab.css';

const BRIBE_COST = 3000;
const VENDOR_COST = 500;
const VENDOR_IDS = ['seyyar_satici_1', 'seyyar_satici_2', 'seyyar_satici_3', 'seyyar_satici_4'];

// SuspicionTab (Şüphe) — yeni istek: "şüphe düşürebileceğimiz mekanlar
// olacak, buradan o mekanlara gitmeden şüphemizi düşürebileceğiz... camii
// kısmında sonraki vakit için bi sayaç olacak, ya da rüşveti direkt
// oradan tıklayarak verebileceğiz." Üç mevcut şüphe-düşürme mekaniği
// (Camii ibadet, Karakol rüşvet, Seyyar Satıcı alışverişi — bkz.
// functions/index.js prayAtMosque/bribePolice/buyFromVendor) burada
// DOĞRUDAN, mekana hiç girmeden tetiklenebiliyor. Sıralama: hâlâ
// kullanılabilenler üstte, kullanım dışı olanlar sayaçları en yakın
// (kalan süresi en az) olandan başlayarak sıralı.
export default function SuspicionTab() {
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const [tick, setTick] = useState(0);
  const [busyKey, setBusyKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Sayaçların canlı (saniyede bir) akması için — her tick'te ms-kalan
  // yeniden hesaplanır (Date.now() render anında okunuyor).
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const win = currentPrayerWindow();

  const runAction = async (key, fn) => {
    setBusyKey(key);
    setErrorMsg(null);
    try {
      await fn();
    } catch (err) {
      setErrorMsg(err.message || 'İşlem başarısız.');
    } finally {
      setBusyKey(null);
    }
  };

  const nextWindowHour = WINDOW_HOURS[(win % 5) + 1]?.split('-')[0] || '';

  const items = [
    {
      key: 'camii',
      emoji: regionEmojis.camii,
      name: regionLabels.camii,
      actionLabel: 'İbadet Et',
      costLabel: 'Ücretsiz',
      suspicionDelta: 5,
      available: !actions.prayedWindows?.[win],
      unavailableNote: `Sıradaki vakit ${nextWindowHour ? `(${nextWindowHour})` : ''}`,
      msRemaining: msUntilNextPrayerWindow(win),
      onAction: () => runAction('camii', prayAtMosque),
    },
    {
      key: 'karakol',
      emoji: regionEmojis.karakol,
      name: regionLabels.karakol,
      actionLabel: `Rüşvet Ver (${BRIBE_COST.toLocaleString('tr-TR')} altın)`,
      costLabel: `${BRIBE_COST.toLocaleString('tr-TR')} altın`,
      suspicionDelta: 20,
      available: !actions.bribed,
      unavailableNote: 'Bugün zaten rüşvet verdin',
      msRemaining: msUntilIstanbulMidnight(),
      onAction: () => runAction('karakol', bribePolice),
    },
    ...VENDOR_IDS.map((vendorId) => {
      const alreadyBought = Boolean(actions.vendorPurchases?.[vendorId]);
      const blockedByHeist = !alreadyBought && Boolean(actions.heist?.[vendorId]);
      return {
        key: vendorId,
        emoji: regionEmojis[vendorId],
        name: regionLabels[vendorId],
        actionLabel: `Alışveriş Yap (${VENDOR_COST.toLocaleString('tr-TR')} altın)`,
        costLabel: `${VENDOR_COST.toLocaleString('tr-TR')} altın`,
        suspicionDelta: 5,
        available: !alreadyBought && !blockedByHeist,
        unavailableNote: blockedByHeist ? 'Bugün buradan haraç kestin' : 'Bugün zaten alışveriş yaptın',
        msRemaining: msUntilIstanbulMidnight(),
        onAction: () => runAction(vendorId, () => buyFromVendor(vendorId)),
      };
    }),
  ];

  // "en üstte hala kullanabileceklerimiz, kullanım dışı olanlarda ise
  // vakti en yakın olan" — önce kullanılabilirlik, sonra (kullanılamayanlar
  // arasında) kalan süre artan sırada.
  const sorted = [...items].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (!a.available) return a.msRemaining - b.msRemaining;
    return 0;
  });

  return (
    <div className="suspicion-tab">
      <p className="suspicion-current">
        🕵️ Şüphe Puanın: <strong>%{player?.suspicion ?? 0}</strong>
      </p>
      <p className="suspicion-hint">
        Aşağıdaki mekanlara hiç gitmeden, doğrudan buradan şüpheni düşürebilirsin.
      </p>
      <GuestOverlay>
        <div className="suspicion-list">
          {sorted.map((item) => (
            <div key={item.key} className={`suspicion-card ${item.available ? 'available' : ''}`}>
              <div className="suspicion-card-main">
                <span className="suspicion-card-emoji">{item.emoji}</span>
                <div className="suspicion-card-info">
                  <span className="suspicion-card-name">{item.name}</span>
                  <span className="suspicion-card-meta">
                    Şüphe -{item.suspicionDelta} · {item.costLabel}
                  </span>
                </div>
              </div>
              {item.available ? (
                <button
                  className="suspicion-card-btn"
                  disabled={busyKey === item.key}
                  onClick={item.onAction}
                >
                  {busyKey === item.key ? '…' : item.actionLabel}
                </button>
              ) : (
                <div className="suspicion-card-cooldown">
                  <span className="suspicion-card-countdown">⏳ {formatCountdown(item.msRemaining)}</span>
                  <span className="suspicion-card-note">{item.unavailableNote}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </GuestOverlay>
      {errorMsg && <p className="suspicion-error">{errorMsg}</p>}
    </div>
  );
}
