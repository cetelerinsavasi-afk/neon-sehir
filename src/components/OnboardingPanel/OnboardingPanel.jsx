import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOnboarding, ONBOARDING_TASKS, ONBOARDING_TASK_COUNT } from '../../hooks/useOnboarding';
import { checkOnboardingProgress, claimOnboardingReward } from '../../services/gameActions';
import InfoIcon from '../InfoIcon/InfoIcon';
import './OnboardingPanel.css';

// OnboardingPanel — anasayfada ChatsApp butonunun tam simetriği (sol alt,
// aynı boyut/konum), yeni oyunculara oyunu öğreten 10 adımlık sıralı görev
// listesi. 5000 altınlık ödül alınana kadar dikkat çekici (pulsing) durur;
// ödül alındıktan sonra kalıcı olarak "hatırlatıcı" moduna geçer ve sadece
// o an geçerli olan hatırlatmalar varsa görünür kalır.
export default function OnboardingPanel() {
  const { user } = useAuth();
  const {
    loading,
    onboardingStep,
    onboardingRewardClaimed,
    checklistDone,
    reminders,
    shouldHideButton,
  } = useOnboarding();

  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [justCompletedStep, setJustCompletedStep] = useState(null);
  const prevStepRef = useRef(onboardingStep);

  // Panel açıkken adım 5/9 gibi "durum" görevlerinin (silahın zaten varsa /
  // şüphen zaten ≥20 ise) anında tamamlanmış sayılmasını tetikle.
  useEffect(() => {
    if (!open || onboardingRewardClaimed) return;
    if (onboardingStep === 5 || onboardingStep === 9) {
      checkOnboardingProgress().catch((err) => {
        console.error('checkOnboardingProgress hatası:', err);
      });
    }
  }, [open, onboardingStep, onboardingRewardClaimed]);

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

  if (!user || loading) return null;
  if (shouldHideButton) return null;

  const remainingTasks = Math.max(0, ONBOARDING_TASK_COUNT - onboardingStep + 1);
  const rewardReady = checklistDone && !onboardingRewardClaimed;

  let badgeContent = null;
  if (!onboardingRewardClaimed) {
    badgeContent = rewardReady ? '🎁' : remainingTasks;
  } else if (reminders.length > 0) {
    badgeContent = reminders.length;
  }

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      await claimOnboardingReward();
    } catch (err) {
      setClaimError(err?.message || 'Ödül alınamadı.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`onboarding-btn${!onboardingRewardClaimed ? ' onboarding-btn-attention' : ''}${
          rewardReady ? ' onboarding-btn-reward-ready' : ''
        }`}
        onClick={() => setOpen(true)}
        aria-label="Görevler"
        title="Görevler"
      >
        📋
        {badgeContent !== null && <span className="onboarding-badge">{badgeContent}</span>}
      </button>

      {open && (
        <div className="onboarding-panel-backdrop" onClick={() => setOpen(false)}>
          <div className="onboarding-panel" onClick={(e) => e.stopPropagation()}>
            <div className="onboarding-panel-header">
              <p className="onboarding-panel-title">
                {onboardingRewardClaimed ? '🔔 Hatırlatıcılar' : '📋 Görevler'}
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
              {!onboardingRewardClaimed && (
                <div className="onboarding-tasklist">
                  {ONBOARDING_TASKS.map((task) => {
                    const state =
                      task.step < onboardingStep
                        ? 'done'
                        : task.step === onboardingStep
                          ? 'current'
                          : 'locked';
                    return (
                      <div key={task.step} className={`onboarding-task onboarding-task-${state}`}>
                        <div className="onboarding-task-marker">
                          {state === 'done' ? '✓' : state === 'locked' ? '🔒' : task.step}
                        </div>
                        <div className="onboarding-task-content">
                          <span className="onboarding-task-emoji">{task.emoji}</span>
                          <span className="onboarding-task-title">{task.title}</span>
                          <InfoIcon text={task.info} />
                        </div>
                        {justCompletedStep === task.step && (
                          <span className="onboarding-task-flash">✅ Tamamlandı!</span>
                        )}
                      </div>
                    );
                  })}

                  {checklistDone && (
                    <div className="onboarding-reward-box">
                      <p className="onboarding-reward-text">
                        🎉 Tüm görevleri tamamladın! Ödülünü almayı unutma.
                      </p>
                      <button
                        type="button"
                        className="onboarding-claim-btn"
                        disabled={claiming}
                        onClick={handleClaim}
                      >
                        {claiming ? '...' : '🎁 Ödülü Al (5000 altın)'}
                      </button>
                      {claimError && <p className="onboarding-claim-error">{claimError}</p>}
                    </div>
                  )}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
