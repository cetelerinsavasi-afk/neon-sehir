import { useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import {
  applyForPolice,
  resignFromPolice,
  cancelPendingPoliceChange,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import './PoliceApplicationSection.css';

// Karakol'da polislik başvurusu/istifası — anlık değil, bir sonraki
// 00:00'da işleme alınır (anlık meslek değişimiyle soygun parası çalma
// istismarını önlemek için).
export default function PoliceApplicationSection() {
  const { player } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const isPolice = player?.profession === 'polis';
  const pending = player?.pendingPoliceChange;

  return (
    <div className="police-app-section">
      <p className="police-app-title">
        Polislik Başvurusu
        <InfoIcon text="Başvuru ya da istifa anlık değil — bir sonraki gece yarısı (00:00) işleme alınır. Başvurmak için şüphen %0 olmalı ve bir silahın olmalı." />
      </p>
      <p className="police-app-hint">
        Şu an: <strong>{isPolice ? 'Polissin' : 'Sivilsin'}</strong>
        {pending === 'apply' && ' · Başvurun bu gece işlenecek'}
        {pending === 'resign' && ' · İstifan bu gece işlenecek'}
      </p>
      <div className="police-app-controls">
        {!isPolice && !pending && (
          <button className="police-app-btn" disabled={busy} onClick={() => run(applyForPolice)}>
            Polislik Başvurusu Yap
          </button>
        )}
        {isPolice && !pending && (
          <button className="police-app-btn" disabled={busy} onClick={() => run(resignFromPolice)}>
            İstifa Et
          </button>
        )}
        {pending && (
          <button
            className="police-app-btn"
            disabled={busy}
            onClick={() => run(cancelPendingPoliceChange)}
          >
            İsteği İptal Et
          </button>
        )}
      </div>
      {error && <p className="police-app-error">{error}</p>}
    </div>
  );
}
