// v103 — Şüpheli Adam satış şekilleri (sunucu: functions/index.js sellContrabandAtPark)
export const RISKY_PRICE = 5000;
export const SAFE_PRICE = 2500; // v117 (eskiden 2.000)
export const SAFE_GANG_CUT = 500;
export const SAFE_DAILY_LIMIT = 10;

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

// Satış sonucu penceresi metni (iki ekran da aynı)
export function shadyResultView(r) {
  if (!r) return null;
  if (r.caught) {
    return { title: 'Yakalandın!', tone: 'fail', message: `${fmt(r.penalty)} altın devlete borç yazıldı.` };
  }
  const debt = r.debtRepaid > 0 ? ` · ${fmt(r.debtRepaid)} borcuna gitti` : '';
  if (r.mode === 'safe') {
    const gang = r.gangCredited ? `🤝 Çetene +${fmt(r.gangCut)}` : `Çeten olmadığı için ${fmt(r.gangCut)} haraç kimseye gitmedi`;
    return {
      title: 'Sessizce satıldı 🛡️',
      tone: 'success',
      message: `+${fmt(r.earned)} altın${debt} · ${gang} · Bugün ${r.safeUsed}/${r.safeLimit}`,
    };
  }
  return { title: 'Satış Başarılı! 🎉', tone: 'success', message: `+${fmt(r.earned)} altın${debt}` };
}
