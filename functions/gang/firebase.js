// Firebase bağlantısı: çete sisteminin Cloud Functions tanımları.
// functions/index.js bu dosyayı çağırıp 2 fonksiyonu export eder:
//   gangAction (callable) · gangClock (5 dk schedule)
// v32: admin paneli / test şifresi kaldırıldı — çeteler oyunculara açık.
// Canlı dünya ilk oyuncu işleminde ya da ilk saat turunda otomatik kurulur
// (bkz. system.js ensureLiveWorld). Secret gerekmez.
import { createGangSystem } from './system.js';

export function createGangFunctions({ onCall, onSchedule, HttpsError, db, FieldValue, getMaxWeaponPower, splitIncomeForDebt, catalogs, lifeDays, onGangJoined, onGangMarketBought }) {
  const system = createGangSystem({
    db,
    FieldValue,
    HttpsError,
    getMaxWeaponPower,
    splitIncomeForDebt,
    catalogs,
    lifeDays,
    adminUids: [], // admin/test modu canlıda kapalı
    getTestPassword: () => null,
    onGangJoined,
    onGangMarketBought,
  });

  const gangAction = onCall({ timeoutSeconds: 60 }, (request) => system.handleAction(request));
  const gangClock = onSchedule(
    { schedule: 'every 5 minutes', timeZone: 'Europe/Istanbul', timeoutSeconds: 540, memory: '512MiB' },
    async () => {
      const res = await system.runAllClocks();
      console.log(JSON.stringify({ gang: 'clock_run', res }));
    }
  );

  return { gangAction, gangClock, system };
}
