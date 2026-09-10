import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from './usePlayer';
import { useDailyActions } from './useDailyActions';
import { useVehicles } from './useVehicles';
import { useMyFactory } from './useMyFactory';
import { useMyFutbolTeam } from './useMyFutbolTeam';
import { currentPrayerWindow } from './useMosqueAttendance';

// Görev listesi/hatırlatıcı paneli — bkz. functions/index.js ONBOARDING
// bölümü. Sayaç (onboardingStep, 1-10) ve ödül bayrağı
// (onboardingRewardClaimed) users/{uid} dokümanında tutuluyor; bu hook
// sadece OKUR — ilerleme SUNUCUDA (advanceOnboardingStep) yapılıyor.
export const ONBOARDING_TASK_COUNT = 10;
const SLOT_FREE_SPINS_PER_DAY = 3;

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Görevlerin sırayla, sabit metinleriyle tanımı — kullanıcının verdiği
// başlık ve (i) açıklama metinleri BİREBİR kullanılıyor.
export const ONBOARDING_TASKS = [
  { step: 1, emoji: '🏭', title: 'Fabrikada çalış', info: 'Maaşı yüksek olan bi fabrikada çalışarak her gün para kazanabilirsin.' },
  { step: 2, emoji: '📱', title: "Telefon'dan Amazor'dan 1 adet yasaklı madde satın al", info: '2. el satış uygulamasında daha ucuza yasaklı madde bulabilirsin.' },
  { step: 3, emoji: '🌳', title: 'Parktaki gizemli adama 1 adet yasaklı madde sat', info: 'Yasaklı madde alıp parkta satarsan, çok hızlı para kazanabilirsin.' },
  { step: 4, emoji: '🕌', title: "Camii'ye gidip ibadet et", info: 'Günde 5 vakit ibadet ederek şüphe miktarını düşük tut, şüphen yüksekken polise yakalanırsın.' },
  { step: 5, emoji: '🔫', title: 'Herhangi bir silah al', info: 'Silah alıp güçlenebilir ve seyyar satıcılardan haraç kesebilirsin.' },
  { step: 6, emoji: '💸', title: 'Bir seyyar satıcıdan haraç kes', info: 'Seyyar satıcılardan haraç kesip para kazanabilirsin.' },
  { step: 7, emoji: '🛒', title: 'Bir seyyar satıcıyla alışveriş yap', info: 'Seyyar satıcılarla alışveriş yaparak şüpheni azaltabilirsin.' },
  { step: 8, emoji: '🎰', title: "Casino'da slot oyna", info: "Casino'da günlük 3 kere ücretsiz slot hakkın var." },
  { step: 9, emoji: '🚨', title: "Şüpheni 20'ye çıkart", info: 'Şüphen yükseldikçe yakalanma riskin artar, yakalanırsan para cezası yersin.' },
  { step: 10, emoji: '🤝', title: 'Polise rüşvet ver', info: 'Rüşvet vermek şüpheyi 20 düşürür.' },
];

/**
 * useOnboarding — anasayfadaki 📋 butonunun tüm verisini tek yerde toplar:
 * - Ödül alınana kadar: 10 görevlik sıralı checklist (onboardingStep).
 * - Ödül alındıktan sonra: koşulları o an sağlananları gösteren 8 maddelik
 *   hatırlatıcı listesi.
 */
export function useOnboarding() {
  const { user } = useAuth();
  const { player, loading: playerLoading } = usePlayer();
  const { actions, loading: actionsLoading } = useDailyActions();
  const { vehicles } = useVehicles();
  const { factory, machines } = useMyFactory();
  const { team } = useMyFutbolTeam();

  // Kullanıcının işveren fabrikasındaki (kendi fabrikası olsun olmasın)
  // ATANDIĞI makinenin lastProducedDateKey'ini dinlemek için ayrı bir
  // dinleyici gerekiyor — useMyFactory sadece KENDİ fabrikasını getiriyor.
  const employment = player?.employment || null;
  const [employmentMachine, setEmploymentMachine] = useState(null);

  useEffect(() => {
    if (!employment?.factoryId || !employment?.machineId) {
      setEmploymentMachine(null);
      return;
    }
    const ref = doc(db, 'factories', employment.factoryId, 'machines', employment.machineId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setEmploymentMachine(snap.exists() ? snap.data() : null),
      (err) => console.error('useOnboarding (employmentMachine) dinleme hatası:', err)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employment?.factoryId, employment?.machineId]);

  const todayKey = istanbulDateKey();
  const win = currentPrayerWindow();

  const onboardingStep = player?.onboardingStep || 1;
  const onboardingRewardClaimed = Boolean(player?.onboardingRewardClaimed);
  const checklistDone = onboardingStep > ONBOARDING_TASK_COUNT;

  // Hatırlatıcı listesi — SADECE ödül alındıktan sonra anlamlı, ama
  // hesaplaması ucuz olduğu için her zaman üretiliyor.
  const reminders = useMemo(() => {
    if (!player) return [];
    const list = [];

    if ((actions.slotFreeSpinsUsed || 0) < SLOT_FREE_SPINS_PER_DAY) {
      list.push({ id: 'slot', emoji: '🎰', text: 'Ücretsiz slot haklarını kullan' });
    }

    if (!actions.prayedWindows?.[win]) {
      list.push({ id: 'pray', emoji: '🕌', text: 'İbadet et' });
    }

    const hasUnracedVehicleToday = vehicles.some(
      (v) => !actions[`championship_${v.catalogId}`]
    );
    if (vehicles.length > 0 && hasUnracedVehicleToday) {
      list.push({ id: 'championship', emoji: '🏁', text: 'Şampiyonaya katıl' });
    }

    // Kullanıcı revizesi: "maça girmediysek kadroyu düzenlemeye gerek yok
    // çünkü oyuncuların formu düşmemiş olacak" — bu yüzden takımın BUGÜN
    // gerçekten bir maç (lig ya da kupa) oynadığı doğrulanmadan bu
    // hatırlatıcı gösterilmiyor. lastMatchPlayedDateKey, sunucuda
    // applyFutbolMatchResult/applyFutbolCupMatchResult tarafından her
    // maç sonrası yazılıyor (bkz. functions/index.js).
    if (team && team.lastMatchPlayedDateKey === todayKey && team.lineupUpdatedDateKey !== todayKey) {
      list.push({ id: 'lineup', emoji: '⚽', text: 'Kadronu düzenle' });
    }

    if (employment && employmentMachine && employmentMachine.lastProducedDateKey !== todayKey) {
      list.push({ id: 'work', emoji: '🏭', text: 'Fabrikada çalış' });
    }

    if (factory) {
      const hasUntriggeredMining = machines.some(
        (m) => m.type === 'mining' && m.miningTriggeredDateKey !== todayKey
      );
      const hasUntriggeredWorkerMachine = machines.some(
        (m) =>
          m.type !== 'mining' &&
          m.lastProducedDateKey !== todayKey &&
          m.ownerTriggeredDateKey !== todayKey
      );
      if (hasUntriggeredMining || hasUntriggeredWorkerMachine) {
        list.push({ id: 'machines', emoji: '⚙️', text: 'Makineleri çalıştır' });
      }
    }

    if (player.profession === 'polis' && !actions.policeSalaryClaimed) {
      list.push({ id: 'police-salary', emoji: '👮', text: 'Karakoldan maaşını al' });
    }

    if (player.isImam && !actions.imamSalaryClaimed) {
      list.push({ id: 'imam-salary', emoji: '🕌', text: 'Camiiden maaşını al' });
    }

    return list;
  }, [player, actions, vehicles, team, employment, employmentMachine, factory, machines, todayKey, win]);

  return {
    loading: playerLoading || actionsLoading,
    player,
    onboardingStep,
    onboardingRewardClaimed,
    checklistDone,
    reminders,
    // Butonun tamamen gizlenmesi gereken durum: ödül alınmış VE aktif
    // hiçbir hatırlatıcı yok.
    shouldHideButton: Boolean(user) && onboardingRewardClaimed && reminders.length === 0,
  };
}
