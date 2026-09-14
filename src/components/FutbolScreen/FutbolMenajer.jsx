import { useEffect, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import {
  getFutbolTeamDetail,
  fireFutbolManager,
  resignFutbolManager,
  respondFutbolManagerHandover,
  respondFutbolManagerApplication,
  listFutbolManagerApplications,
  listFutbolTeamForManagers,
  cancelFutbolManagerListing,
  emptyFutbolTreasuryAndReclaim,
  withdrawFutbolTreasury20Percent,
  openFutbolTreasuryWithdrawRequest,
  respondFutbolTreasuryWithdrawRequest,
  donateFutbolTreasury,
} from '../../services/gameActions';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import FutbolLevelBar from './FutbolLevelBar';
import './FutbolTakimim.css';

const DONATE_QUICK_AMOUNTS = [1000, 10000, 100000];

function levelThreshold(level) {
  return 10 * Math.pow(2, Math.abs(level || 0));
}

// FutbolMenajer — Bölüm 10/16 role-aware panel: takımın başkanı VEYA
// menajeri buradan takımın kasa/destek durumunu, maaş/borç bilgisini ve
// devir araçlarını (%20 çekim, bağış, işten atma/istifa, ilan/başvuru
// yönetimi, oto-bot geri alma) yönetir.
export default function FutbolMenajer({ team, role }) {
  const { player } = usePlayer();
  const [detail, setDetail] = useState(null);
  const [applications, setApplications] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // 'fire' | 'resign'
  const [donateAmount, setDonateAmount] = useState(0);
  const [showDonate, setShowDonate] = useState(false);
  const [showExtraRequest, setShowExtraRequest] = useState(false);
  const [extraAmount, setExtraAmount] = useState(0);
  const [extraNote, setExtraNote] = useState('');

  const isManaged = Boolean(team.managerUid);
  const isAutoManaged = !isManaged && Boolean(team.autoManaged);
  const isOwnerActiveNoManager = role === 'owner' && !isManaged && !isAutoManaged;
  const hasPendingHandover = Boolean(team.pendingHandoverUid);
  const handoverAwaitingApproval = hasPendingHandover && !team.pendingHandoverApproved;

  const loadDetail = () => {
    getFutbolTeamDetail(team.id)
      .then((res) => setDetail(res?.data?.team || null))
      .catch(() => {});
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, team.managerUid, team.ownerUid]);

  const loadApplications = () => {
    if (role !== 'owner' || !team.managerListingOpen) {
      setApplications(null);
      return;
    }
    listFutbolManagerApplications(team.id)
      .then((res) => setApplications(res?.data?.applications || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, team.managerListingOpen]);

  const runAction = async (fn, successMsg) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      if (successMsg) setMessage(successMsg);
    } catch (err) {
      setError(err?.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'fire') {
      await runAction(
        () => fireFutbolManager(team.id),
        'Karar kuyruğa alındı — menajer bugün 19:00\'da işten çıkarılacak.'
      );
    } else if (action === 'resign') {
      await runAction(() => resignFutbolManager(team.id), 'İstifa ettin.');
    }
  };

  const withdrawAllowance = Math.max(
    0,
    Math.floor((team.treasuryWithdrawBase || 0) * 0.2) - (team.treasuryWithdrawnToday || 0)
  );

  const level = player?.futbolManagerLevel || 0;
  const streak = player?.futbolManagerLevelStreak || 0;
  const threshold = levelThreshold(level);

  return (
    <div className="futbol-buy-list">
      {error && <p className="futbol-admin-error">{error}</p>}
      {message && <p className="futbol-placeholder">{message}</p>}

      {/* --- Bekleyen devralma onayı (SADECE başkan, henüz onaylanmamışsa) --- */}
      {role === 'owner' && handoverAwaitingApproval && (
        <div className="futbol-my-team-finance">
          <p className="futbol-kadro-section-title">Devralma Talebi Bekliyor</p>
          <p className="futbol-placeholder">
            Seviye {team.pendingHandoverLevel ?? 0} bir menajer takımını devralmak istiyor.
          </p>
          <div className="futbol-transfer-actions">
            <button
              className="futbol-admin-submit"
              disabled={busy}
              onClick={() => runAction(() => respondFutbolManagerHandover(team.id, true), 'Devralma onaylandı.')}
            >
              Onayla
            </button>
            <button
              className="futbol-admin-reset"
              disabled={busy}
              onClick={() => runAction(() => respondFutbolManagerHandover(team.id, false), 'Devralma reddedildi.')}
            >
              Reddet
            </button>
          </div>
        </div>
      )}

      {/* --- Onaylanmış ama henüz yürütülmemiş devralma bilgisi --- */}
      {hasPendingHandover && team.pendingHandoverApproved && (
        <p className="futbol-placeholder">
          {role === 'manager'
            ? `Seviye ${team.pendingHandoverLevel ?? 0} bir menajer yarın 19:00'da seni devralacak.`
            : `Yeni menajer yarın 19:00'da göreve başlayacak.`}
        </p>
      )}

      {/* --- Genel bilgi satırı --- */}
      <div className="futbol-my-team-finance">
        <p className="futbol-buy-meta">
          Başkan: {detail?.chairman || '...'}
          {isManaged && (
            <>
              {' '}
              · Menajer: {detail?.managerName || '...'} (seviye {detail?.managerLevel ?? 0})
            </>
          )}
        </p>
        {(isManaged || isAutoManaged) && (
          <p className="futbol-transfer-balance">
            💰 Kasa: {(team.treasury || 0).toLocaleString('tr-TR')} altın · Destek:{' '}
            {(team.transferSupport || 0).toLocaleString('tr-TR')} altın
            {team.salaryDebt > 0 && (
              <> · Maaş Borcu: {team.salaryDebt.toLocaleString('tr-TR')} altın</>
            )}
          </p>
        )}
        {(role === 'manager' || !isManaged) && <FutbolLevelBar level={level} streak={streak} threshold={threshold} />}
      </div>

      {/* --- OTO-BOT (başkan 5+ gün pasif) --- */}
      {isAutoManaged && role === 'owner' && (
        <div className="futbol-my-team-finance">
          <p className="futbol-placeholder">🤖 5+ gündür pasif olduğun için takım geçici olarak oto-bot modunda.</p>
          <button
            className="futbol-admin-submit"
            disabled={busy}
            onClick={() => runAction(() => emptyFutbolTreasuryAndReclaim(team.id), 'Takımı geri aldın.')}
          >
            Kasayı Boşalt ve Takımı Geri Al
          </button>
        </div>
      )}

      {/* --- MANAGED: başkan araçları --- */}
      {isManaged && role === 'owner' && (
        <div className="futbol-my-team-finance">
          <p className="futbol-kadro-section-title">Kasa İşlemleri</p>
          <p className="futbol-buy-meta">Bugün çekebileceğin kalan pay: {withdrawAllowance.toLocaleString('tr-TR')} altın</p>
          <div className="futbol-transfer-actions">
            <button
              className="futbol-admin-submit"
              disabled={busy || withdrawAllowance <= 0}
              onClick={() =>
                runAction(
                  () => withdrawFutbolTreasury20Percent(team.id, withdrawAllowance),
                  'Günlük hakkını çektin.'
                )
              }
            >
              %20 Payını Çek
            </button>
            <button className="futbol-admin-reset" onClick={() => setShowDonate((v) => !v)}>
              Kasaya Bağış Yap
            </button>
          </div>
          {showDonate && (
            <>
              <QuantityStepper value={donateAmount} onChange={setDonateAmount} quickAmounts={DONATE_QUICK_AMOUNTS} />
              <button
                className="futbol-admin-submit"
                disabled={busy || donateAmount <= 0}
                onClick={() =>
                  runAction(() => donateFutbolTreasury(team.id, donateAmount), 'Bağışın kasaya eklendi.').then(() =>
                    setDonateAmount(0)
                  )
                }
              >
                Bağışı Onayla
              </button>
            </>
          )}
          {team.pendingTreasuryWithdrawRequest ? (
            <p className="futbol-placeholder">
              {team.pendingTreasuryWithdrawRequest.amount.toLocaleString('tr-TR')} altınlık fazla çekim talebin
              menajerinin onayını bekliyor.
            </p>
          ) : (
            <>
              <button className="futbol-admin-reset" onClick={() => setShowExtraRequest((v) => !v)}>
                %20 Üstü Çekim Talep Et
              </button>
              {showExtraRequest && (
                <>
                  <QuantityStepper value={extraAmount} onChange={setExtraAmount} max={team.treasury || 0} />
                  <input
                    className="futbol-admin-input"
                    placeholder="Not (isteğe bağlı)"
                    value={extraNote}
                    onChange={(e) => setExtraNote(e.target.value)}
                  />
                  <button
                    className="futbol-admin-submit"
                    disabled={busy || extraAmount <= 0}
                    onClick={() =>
                      runAction(
                        () => openFutbolTreasuryWithdrawRequest(team.id, extraAmount, extraNote),
                        'Talebin menajerine iletildi.'
                      )
                    }
                  >
                    Talebi Gönder
                  </button>
                </>
              )}
            </>
          )}
          {team.managerFirePending ? (
            <p className="futbol-placeholder">
              Menajeri işten atma kararın kuyruğa alındı — bugün 19:00'da yürütülecek. Menajer bu karardan henüz
              haberdar değil.
            </p>
          ) : (
            <button className="futbol-admin-reset" disabled={busy} onClick={() => setConfirmAction('fire')}>
              Menajeri İşten At
            </button>
          )}
        </div>
      )}

      {/* --- MANAGED: menajer araçları --- */}
      {isManaged && role === 'manager' && (
        <div className="futbol-my-team-finance">
          <p className="futbol-kadro-section-title">Kasaya Bağış Yap</p>
          <button className="futbol-admin-reset" onClick={() => setShowDonate((v) => !v)}>
            Kasaya Bağış Yap
          </button>
          {showDonate && (
            <>
              <QuantityStepper value={donateAmount} onChange={setDonateAmount} quickAmounts={DONATE_QUICK_AMOUNTS} />
              <button
                className="futbol-admin-submit"
                disabled={busy || donateAmount <= 0}
                onClick={() =>
                  runAction(() => donateFutbolTreasury(team.id, donateAmount), 'Bağışın kasaya eklendi.').then(() =>
                    setDonateAmount(0)
                  )
                }
              >
                Bağışı Onayla
              </button>
            </>
          )}
          {team.pendingTreasuryWithdrawRequest && (
            <>
              <p className="futbol-kadro-section-title">Fazla Çekim Talebi</p>
              <p className="futbol-buy-meta">
                Başkan {team.pendingTreasuryWithdrawRequest.amount.toLocaleString('tr-TR')} altın çekmek istiyor.
                {team.pendingTreasuryWithdrawRequest.note ? ` Not: ${team.pendingTreasuryWithdrawRequest.note}` : ''}
              </p>
              <div className="futbol-transfer-actions">
                <button
                  className="futbol-admin-submit"
                  disabled={busy}
                  onClick={() =>
                    runAction(() => respondFutbolTreasuryWithdrawRequest(team.id, true), 'Talebi onayladın.')
                  }
                >
                  Onayla
                </button>
                <button
                  className="futbol-admin-reset"
                  disabled={busy}
                  onClick={() =>
                    runAction(() => respondFutbolTreasuryWithdrawRequest(team.id, false), 'Talebi reddettin.')
                  }
                >
                  Reddet
                </button>
              </div>
            </>
          )}
          <button className="futbol-admin-reset" disabled={busy} onClick={() => setConfirmAction('resign')}>
            İstifa Et
          </button>
        </div>
      )}

      {/* --- OWNER_ACTIVE: menajerlik ilanı --- */}
      {isOwnerActiveNoManager && (
        <div className="futbol-my-team-finance">
          <p className="futbol-kadro-section-title">Menajerlik İlanı</p>
          {team.managerListingOpen ? (
            <>
              <p className="futbol-placeholder">🟢 Takımın menajerliğe açık.</p>
              <button
                className="futbol-admin-reset"
                disabled={busy}
                onClick={() =>
                  runAction(() => cancelFutbolManagerListing(team.id), 'İlanı iptal ettin.').then(loadApplications)
                }
              >
                İlanı İptal Et
              </button>
              <p className="futbol-kadro-section-title">Başvurular</p>
              {applications === null && <p className="futbol-placeholder">Yükleniyor...</p>}
              {applications?.length === 0 && <p className="futbol-placeholder">Henüz başvuru yok.</p>}
              {applications?.map((a) => (
                <div key={a.id} className="futbol-buy-row">
                  <div className="futbol-buy-info">
                    <p className="futbol-buy-name">{a.applicantName}</p>
                    <p className="futbol-buy-meta">Seviye {a.applicantLevel}</p>
                  </div>
                  <div className="futbol-transfer-actions">
                    <button
                      className="futbol-admin-submit"
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          () => respondFutbolManagerApplication(team.id, a.applicantUid, true),
                          'Başvuru kabul edildi.'
                        ).then(loadApplications)
                      }
                    >
                      Kabul Et
                    </button>
                    <button
                      className="futbol-admin-reset"
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          () => respondFutbolManagerApplication(team.id, a.applicantUid, false),
                          'Başvuru reddedildi.'
                        ).then(loadApplications)
                      }
                    >
                      Reddet
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <button
              className="futbol-admin-submit"
              disabled={busy}
              onClick={() =>
                runAction(() => listFutbolTeamForManagers(team.id), 'Takım menajerliğe açıldı.').then(loadApplications)
              }
            >
              Menajerliğe Aç
            </button>
          )}
        </div>
      )}

      {confirmAction === 'fire' && (
        <ConfirmModal
          title="Menajeri İşten At"
          message="Menajer anında değil, bugün 19:00'da işten çıkarılacak — o ana kadar bu karardan haberi olmayacak. Devam etmek istediğine emin misin?"
          confirmLabel="Evet, Kuyruğa Al"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'resign' && (
        <ConfirmModal
          title="İstifa Et"
          message="Bu takımdan istifa etmek istediğine emin misin? Bu sezon bu takıma tekrar başvuramazsın."
          confirmLabel="Evet, İstifa Et"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
