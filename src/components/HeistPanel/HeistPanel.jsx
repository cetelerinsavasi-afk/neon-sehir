import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDailyActions } from '../../hooks/useDailyActions';
import { attemptHeist } from '../../services/gameActions';
import './HeistPanel.css';

const LABELS = {
  banka: { title: 'Banka Soygunu', risk: 'Çok yüksek şüphe artışı (+50)' },
  'araba-galerisi': { title: 'Galeri Soygunu', risk: 'Yüksek şüphe artışı (+25)' },
  'silah-magazasi': { title: 'Mağaza Soygunu', risk: 'Yüksek şüphe artışı (+25)' },
};

/**
 * HeistPanel — tek oyunculu, anlık sonuçlanan basitleştirilmiş soygun.
 * Başarı şansı sahip olunan en güçlü silaha ve mevcut şüpheye göre sunucuda
 * hesaplanır (bkz. functions/index.js attemptHeist). Polis oyuncularının
 * canlı müdahalesi (Bölüm 14) sonraki bir fazda eklenecek.
 */
export default function HeistPanel({ target }) {
  const { user } = useAuth();
  const { actions } = useDailyActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!user) return null;

  const meta = LABELS[target];
  const done = Boolean(actions.heist?.[target]);

  const handleAttempt = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await attemptHeist(target);
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Soygun başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="heist-panel">
      <p className="heist-panel-title">{meta.title}</p>
      <p className="heist-panel-risk">{meta.risk}</p>
      <button className="heist-panel-btn" disabled={done || busy} onClick={handleAttempt}>
        {done ? 'Bugün zaten denedin' : busy ? 'Soyuluyor…' : 'Soygunu Dene'}
      </button>
      {result && (
        <p className={`heist-panel-result ${result.success ? 'success' : 'fail'}`}>
          {result.success
            ? `Başarılı! ${result.reward.toLocaleString('tr-TR')} altın kazandın (şans: %${result.chance}).`
            : `Yakalandın, boşuna gitti (şans: %${result.chance}).`}
        </p>
      )}
      {error && <p className="heist-panel-error">{error}</p>}
    </div>
  );
}
