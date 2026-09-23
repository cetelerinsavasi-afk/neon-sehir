// Firebase bağlantısı: çete sisteminin Cloud Functions tanımları.
// functions/index.js bu dosyayı çağırıp 3 fonksiyonu export eder:
//   gangAction (callable) · gangAdmin (callable) · gangClock (5 dk schedule)
import { createGangSystem } from './system.js';

export function createGangFunctions({ onCall, onSchedule, defineSecret, HttpsError, db, FieldValue, getMaxWeaponPower, splitIncomeForDebt, catalogs, lifeDays, adminUids }) {
  // Test modu şifresi Secret Manager'da: firebase functions:secrets:set GANG_TEST_PASSWORD
  const GANG_TEST_PASSWORD = defineSecret('GANG_TEST_PASSWORD');
  const system = createGangSystem({
    db,
    FieldValue,
    HttpsError,
    getMaxWeaponPower,
    splitIncomeForDebt,
    catalogs,
    lifeDays,
    adminUids,
    getTestPassword: () => {
      try {
        return GANG_TEST_PASSWORD.value() || null;
      } catch {
        return null;
      }
    },
  });

  const gangAction = onCall({ timeoutSeconds: 60 }, (request) => system.handleAction(request));
  const gangAdmin = onCall({ secrets: [GANG_TEST_PASSWORD], timeoutSeconds: 300 }, (request) => system.handleAdmin(request));
  const gangClock = onSchedule(
    { schedule: 'every 5 minutes', timeZone: 'Europe/Istanbul', timeoutSeconds: 540, memory: '512MiB' },
    async () => {
      const res = await system.runAllClocks();
      console.log(JSON.stringify({ gang: 'clock_run', res }));
    }
  );

  return { gangAction, gangAdmin, gangClock, system };
}
