import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding, ONBOARDING_TASKS, ONBOARDING_TASK_COUNT, reminderTarget } from '../../hooks/useOnboarding';
import { checkOnboardingProgress, completeOnboardingChecklist } from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import './OnboardingPanel.css';

// OnboardingPanel — anasayfada ChatsApp butonunun tam simetriği (sol alt,
// aynı boyut/konum), yeni oyunculara oyunu öğreten 15 adımlık sıralı görev
// listesi. Kullanıcı revizesi: ARTIK ALTIN ÖDÜLÜ YOK — tüm görevler
// bitince "Görevler Tamamlandı!" ekranı gelir, "Tamam" butonuna
// basıldığında panel kalıcı olarak "hatırlatıcı" moduna geçer ve sadece
// o an geçerli olan hatırlatmalar varsa görünür kalır.
// Oyuncu bu göreve geldiğinde şart zaten sağlanıyorsa sunucu otomatik geçirir
const STATUS_TASK_IDS = [5, 9, 11, 12, 13, 14, 16, 19, 20]; // v168: 14 — aktif kredisi varsa

export default function OnboardingPanel({ gangReminders = null, gangChans = null, slotBottom = null, onVisibleChange = null, inline = false, onGo = null, inStadium = false, listenOpen = false }) {
  const { user } = useAuth();
  const {
    loading,
    onboardingStep,
    currentTaskId,
    onboardingRewardClaimed,
    checklistDone,
    storyPre,
    reminders,
    shouldHideButton,
  } = useOnboarding(gangReminders, gangChans, { inStadium }); // v163

  const [open, setOpen] = useState(false);
  // v168: şehirde üstteki senaryo şeridine (Rıza Amca) dokununca liste açılır
  useEffect(() => {
    if (!listenOpen) return undefined;
    const on = () => setOpen(true);
    window.addEventListener('neon-onboarding-open', on);
    return () => window.removeEventListener('neon-onboarding-open', on);
  }, [listenOpen]);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [justCompletedStep, setJustCompletedStep] = useState(null);
  const prevStepRef = useRef(onboardingStep);

  // Panel açıkken adım 5/9/11/12/13 gibi "durum" görevlerinin (silahın
  // zaten varsa / şüphen zaten ≥20 ise / arabanız zaten varsa /
  // antrenmanın 1. seviyesini zaten geçtiysen / şampiyonaya zaten
  // girdiysen) anında tamamlanmış sayılmasını tetikle. Adım 13 — bug fix
  // (bkz. functions/index.js checkOnboardingProgress'teki NOT): önceden
  // doCreateChampionshipRace içinde DOĞRUDAN ilerletiliyordu, ama bu
  // yarış başlatma isteğini yavaşlatıp bazen zaman aşımına uğratıyordu
  // ("yarışa katıl dedim, başlamadı" bug'ı) — artık diğer durum görevleri
  // gibi burada kontrol ediliyor.
  useEffect(() => {
    if (!open || onboardingRewardClaimed) return;
    // v124: görev KİMLİKLERİ (sıra değişti, kimlik değişmedi — functions/onboardingData.js)
    if (STATUS_TASK_IDS.includes(currentTaskId)) {
      checkOnboardingProgress().catch((err) => {
        console.error('checkOnboardingProgress hatası:', err);
      });
    }
  }, [open, currentTaskId, onboardingRewardClaimed]);

  // Tamamlanan görev animasyonu — adım ilerlediğinde kısa süreliğine
  // az önce biten görevin satırını vurgula.
  useEffect(() => {
    if (onboardingStep > prevStepRef.current) {
      const completedStep = prevStepRef.current;
      setJustCompletedStep(completedStep);
      const timer = setTimeout(() => setJustCompletedStep(null), 1800);
      prevStepRef.current = onboardingStep;
      return () => clearTimeout(timer);
    }
    prevStepRef.current = onboardingStep;
  }, [onboardingStep]);

  // v136: sol alt sütun (Görevler → CANLI → Seçim) boşlukları alta kaydırır
  const visible = Boolean(user) && !loading && !shouldHideButton && !storyPre;
  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  if (!user || loading) return null;
  if (shouldHideButton || storyPre) return null; // v168.1

  const remainingTasks = Math.max(0, ONBOARDING_TASK_COUNT - onboardingStep + 1);
  const rewardReady = checklistDone && !onboardingRewardClaimed;

  let badgeContent = null;
  if (!onboardingRewardClaimed) {
    badgeContent = rewardReady ? '✅' : remainingTasks;
  } else if (reminders.length > 0) {
    badgeContent = reminders.length;
  }

  const handleComplete = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      await completeOnboardingChecklist();
    } catch (err) {
      setClaimError(err?.message || 'İşlem başarısız.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${inline ? 'hs-side-btn onboarding-inline' : 'onboarding-btn'}${!onboardingRewardClaimed ? ' onboarding-btn-attention' : ''}${
          rewardReady ? ' onboarding-btn-reward-ready' : ''
        }`}
        style={slotBottom && !inline ? { bottom: slotBottom } : undefined}
        onClick={() => setOpen(true)}
        aria-label="Görevler"
        title="Görevler"
      >
        📋
        {badgeContent !== null && <span className="onboarding-badge">{badgeContent}</span>}
      </button>

      {/* v157.9: panel gövdeye taşınır — şehirde alt çubuk (Sohbet · Çeteler…) son satırları örtmesin */}
      {open &&
        createPortal(
        <div className="onboarding-panel-backdrop" onClick={() => setOpen(false)}>
          <div className="onboarding-panel" onClick={(e) => e.stopPropagation()}>
            <div className="onboarding-panel-header">
              <p className="onboarding-panel-title">
                {onboardingRewardClaimed
                  ? '🔔 Hatırlatıcılar'
                  : checklistDone
                    ? '🎉 Tamamlandı'
                    : '📋 Görevler'}
              </p>
              <button
                type="button"
                className="onboarding-panel-close"
                onClick={() => setOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="onboarding-panel-body">
              {!onboardingRewardClaimed && checklistDone && (
                <div className="onboarding-complete-screen">
                  <span className="onboarding-complete-emoji">🎉</span>
                  <p className="onboarding-complete-title">Görevler Tamamlandı!</p>
                  <p className="onboarding-complete-text">
                    Tüm görevleri başarıyla bitirdin. Artık bu panel sadece o anki hatırlatmalarını
                    gösterecek.
                  </p>
                  <button
                    type="button"
                    className="onboarding-complete-btn"
                    disabled={claiming}
                    onClick={handleComplete}
                  >
                    {claiming ? '...' : 'Tamam'}
                  </button>
                  {claimError && <p className="onboarding-claim-error">{claimError}</p>}
                </div>
              )}

              {!onboardingRewardClaimed && !checklistDone && (
                <div className="onboarding-tasklist">
                  {ONBOARDING_TASKS.map((task) => {
                    const state =
                      task.step < onboardingStep
                        ? 'done'
                        : task.step === onboardingStep
                          ? 'current'
                          : 'locked';
                    // v168: hikâyenin son sahnesi sırası gelene kadar gizli
                    const hidden = task.secret && state === 'locked';
                    return (
                      <div key={task.step} className={`onboarding-task onboarding-task-${state}`}>
                        <div className="onboarding-task-marker">
                          {state === 'done' ? '✓' : state === 'locked' ? '🔒' : task.step}
                        </div>
                        <div className="onboarding-task-content">
                          <span className="onboarding-task-emoji">{hidden ? '❔' : task.emoji}</span>
                          <span className="onboarding-task-title">{hidden ? '???' : task.title}</span>
                          {!hidden && <InfoIcon text={task.info} />}
                        </div>
                        {justCompletedStep === task.step && (
                          <span className="onboarding-task-flash">✅ Tamamlandı!</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {onboardingRewardClaimed && (
                <div className="onboarding-reminder-list">
                  {reminders.length === 0 && (
                    <p className="onboarding-reminder-empty">
                      Şu an hatırlatacak bir şey yok, harika gidiyorsun! 🎉
                    </p>
                  )}
                  {reminders.map((r) => (
                    <div key={r.id} className="onboarding-reminder-item">
                      <span className="onboarding-reminder-emoji">{r.emoji}</span>
                      <span className="onboarding-reminder-text">{r.text}</span>
                      {/* v158: "Git" — ilgili yere ışınlanır (fabrika, cami, pist…) ya da paneli açar */}
                      {onGo && reminderTarget(r.id) && (
                        <button
                          type="button"
                          className="onboarding-reminder-go"
                          onClick={() => {
                            setOpen(false);
                            onGo(reminderTarget(r.id), r);
                          }}
                        >
                          Git ➜
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
