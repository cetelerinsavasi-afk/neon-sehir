import { useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import { usePoliceClaimPool } from '../../hooks/usePoliceClaimPool';
import {
  applyForPolice,
  resignFromPolice,
  cancelPendingPoliceChange,
  claimPoliceSalary,
} from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import PoliceBooklet from '../PoliceBooklet/PoliceBooklet';
import './PoliceApplicationSection.css';

// Karakol'da polislik başvurusu/istifası — hem BAŞVURU hem İSTİFA bir
// sonraki 00:00'da işleme alınır (havuz/kadro sayımlarının gün içinde
// tutarlı kalması için, bkz. functions/index.js dailyReset).
export default function PoliceApplicationSection() {
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const { pool } = usePoliceClaimPool();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showBooklet, setShowBooklet] = useState(false);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const [salarySuccess, setSalarySuccess] = useState(null);

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

  const handleClaimSalary = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await claimPoliceSalary();
      setSalarySuccess(res.data?.share ?? pool?.perOfficerShare ?? 0);
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const isPolice = player?.profession === 'polis';
  const pending = player?.pendingPoliceChange;
  const salaryClaimed = Boolean(actions.policeSalaryClaimed);
  const canClaimSalary = isPolice && (player?.suspicion || 0) === 0 && Boolean(pool);

  return (
    <div className="police-app-section">
      <div className="police-app-header">
        <p className="police-app-title">
          Polislik Başvurusu
          <InfoIcon text="Başvuru ve istifa anlık değil — bir sonraki gece yarısı (00:00) işleme alınır. Başvurmak için şüphen %0 olmalı ve bir silahın olmalı." />
        </p>
        <button className="police-app-booklet-btn" onClick={() => setShowBooklet(true)}>
          📖 Kitapçık
        </button>
      </div>
      <p className="police-app-hint">
        Şu an: <strong>{isPolice ? 'Polissin' : 'Sivilsin'}</strong>
        {pending === 'apply' && ' · Başvurun bu gece işlenecek'}
        {pending === 'resign' && ' · İstifan bu gece işlenecek'}
      </p>

      {isPolice && pending !== 'resign' && (
        <div className="police-salary-box">
          <span className="police-salary-emoji">💰</span>
          <div className="police-salary-info">
            <span className="police-salary-title">Bugünkü Rüşvet Havuzu</span>
            {pool ? (
              <>
                <span className="police-salary-amount">
                  {(pool.totalPool || 0).toLocaleString('tr-TR')} altın havuz ·{' '}
                  {(pool.policeCount || 0)} polis
                </span>
                <span className="police-salary-share">
                  Payına düşen: <strong>{(pool.perOfficerShare || 0).toLocaleString('tr-TR')} altın</strong>
                </span>
              </>
            ) : (
              <span className="police-salary-amount">Havuz henüz oluşmadı</span>
            )}
          </div>
          <button
            className="police-app-btn primary"
            disabled={busy || salaryClaimed || !canClaimSalary}
            onClick={handleClaimSalary}
          >
            {salaryClaimed
              ? 'Bugün Alındı'
              : (player?.suspicion || 0) !== 0
                ? 'Şüphen 0 Olmalı'
                : !pool
                  ? 'Havuz Bekleniyor'
                  : 'Maaşı Al'}
          </button>
        </div>
      )}
      {salarySuccess != null && (
        <p className="police-salary-success">
          +{salarySuccess.toLocaleString('tr-TR')} altın hesabına eklendi! Havuzdan artan kısım varsa, bu
          gece 00:00'da bugün maaş alan polislere bonus olarak otomatik dağıtılacak.
        </p>
      )}

      {confirmingResign ? (
        <div className="police-app-confirm">
          <p className="police-app-hint">
            İstifa etmek istediğine emin misin? İstifan ANINDA gerçekleşmez — bu gece 00:00'da işleme
            alınır, o zamana kadar polis olarak kalır, görevlerini sürdürürsün.
          </p>
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
              Evet, İstifa Talebi Gönder
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
          {isPolice && !pending && (
            <button className="police-app-btn" disabled={busy} onClick={() => setConfirmingResign(true)}>
              İstifa Et
            </button>
          )}
          {(pending === 'apply' || pending === 'resign') && (
            <button
              className="police-app-btn"
              disabled={busy}
              onClick={() => run(cancelPendingPoliceChange)}
            >
              {pending === 'apply' ? 'Başvuruyu İptal Et' : 'İstifa Talebini İptal Et'}
            </button>
          )}
        </div>
      )}

      {error && <p className="police-app-error">{error}</p>}
      {showBooklet && <PoliceBooklet onClose={() => setShowBooklet(false)} />}
    </div>
  );
}
