import { useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import {
  applyForPolice,
  resignFromPolice,
  cancelPendingPoliceChange,
  claimPoliceSalary,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import PoliceBooklet from '../PoliceBooklet/PoliceBooklet';
import './PoliceApplicationSection.css';

// Karakol'da polislik başvurusu/istifası — BAŞVURU bir sonraki 00:00'da
// işleme alınır (anlık meslek değişimiyle soygun parası çalma istismarını
// önlemek için), ama İSTİFA artık ANLIK (onay istenerek).
export default function PoliceApplicationSection() {
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showBooklet, setShowBooklet] = useState(false);
  const [confirmingResign, setConfirmingResign] = useState(false);

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
  const salaryClaimed = Boolean(actions.policeSalaryClaimed);
  const canClaimSalary = isPolice && (player?.suspicion || 0) === 0;

  return (
    <div className="police-app-section">
      <div className="police-app-header">
        <p className="police-app-title">
          Polislik Başvurusu
          <InfoIcon text="Başvuru anlık değil — bir sonraki gece yarısı (00:00) işleme alınır. Başvurmak için şüphen %0 olmalı ve bir silahın olmalı. İstifa ise anlık." />
        </p>
        <button className="police-app-booklet-btn" onClick={() => setShowBooklet(true)}>
          📖 Kitapçık
        </button>
      </div>
      <p className="police-app-hint">
        Şu an: <strong>{isPolice ? 'Polissin' : 'Sivilsin'}</strong>
        {pending === 'apply' && ' · Başvurun bu gece işlenecek'}
      </p>

      {isPolice && (
        <div className="police-salary-box">
          <span className="police-salary-emoji">💰</span>
          <div className="police-salary-info">
            <span className="police-salary-title">Günlük Maaş</span>
            <span className="police-salary-amount">1000 altın</span>
          </div>
          <button
            className="police-app-btn primary"
            disabled={busy || salaryClaimed || !canClaimSalary}
            onClick={() => run(claimPoliceSalary)}
          >
            {salaryClaimed ? 'Bugün Alındı' : canClaimSalary ? 'Maaşı Al' : 'Şüphen 0 Olmalı'}
          </button>
        </div>
      )}

      {confirmingResign ? (
        <div className="police-app-confirm">
          <p className="police-app-hint">İstifa etmek istediğine emin misin? Bu işlem anında gerçekleşir.</p>
          <div className="police-app-controls">
            <button
              className="police-app-btn danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await resignFromPolice();
                  setConfirmingResign(false);
                })
              }
            >
              Evet, İstifa Et
            </button>
            <button className="police-app-btn" disabled={busy} onClick={() => setConfirmingResign(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <div className="police-app-controls">
          {!isPolice && !pending && (
            <button className="police-app-btn" disabled={busy} onClick={() => run(applyForPolice)}>
              Polislik Başvurusu Yap
            </button>
          )}
          {isPolice && (
            <button className="police-app-btn" disabled={busy} onClick={() => setConfirmingResign(true)}>
              İstifa Et
            </button>
          )}
          {pending === 'apply' && (
            <button
              className="police-app-btn"
              disabled={busy}
              onClick={() => run(cancelPendingPoliceChange)}
            >
              Başvuruyu İptal Et
            </button>
          )}
        </div>
      )}

      {error && <p className="police-app-error">{error}</p>}
      {showBooklet && <PoliceBooklet onClose={() => setShowBooklet(false)} />}
    </div>
  );
}
