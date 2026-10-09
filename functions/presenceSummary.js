// =============================================================================
// v79 — Presence özeti (maliyet)
// "Mekânda/evde kaç kişi var" sayıları için istemciler eskiden 30 sn'de bir
// park/iç mekân/ev presence koleksiyonlarının TÜM aktif kayıtlarını okuyordu
// (her izleyici ayrı ayrı → izleyici × oyuncu okuma). Artık sunucu 2 dakikada
// bir sayar ve tek bir belgeye yazar; istemciler sadece bu belgeyi dinler.
// Sayılar değişmediyse yazmaz (izleyicilere boşuna okuma yazdırmaz); 10 dakikada
// bir yine de yazar ki istemci özetin canlı olduğunu bilsin.
//   stats/presence = { park: n, int: { locationId: n }, house: { houseId: n }, atMs }
// =============================================================================
// v81: aktiflik penceresi 90 → 60 sn (istemci presence'ı ~15–20 sn'de bir tazeler)
export const PRESENCE_SUMMARY_ACTIVE_MS = 60_000;
// v81 — ANINDA GÜNCELLEME: biri mekâna girince (presence belgesi oluşur) ya da
// çıkınca (silinir) özet hemen yeniden sayılır; art arda girişlerde en fazla
// PRESENCE_NUDGE_GAP_MS'de bir sayılır (maliyet sınırlı). Zamanlanmış iş (2 dk)
// sadece uygulaması kapanıp nabzı kesilenleri düşürmek için kalır.
export const PRESENCE_NUDGE_GAP_MS = 8_000;
export const PRESENCE_SUMMARY_KEEPALIVE_MS = 10 * 60 * 1000;

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export function createPresenceSummary({ db, Timestamp, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const lockRef = () => db.collection('stats').doc('presenceRun');
  async function run() {
    const t = now();
    await lockRef().set({ lastRunMs: t }, { merge: true }).catch(() => {});
    const since = Timestamp.fromMillis(t - PRESENCE_SUMMARY_ACTIVE_MS);
    const q = (name) => db.collection(name).where('updatedAt', '>', since).limit(3000).get();
    const [park, inter, house] = await Promise.all([q('parkPresence'), q('interiorPresence'), q('housePresence')]);
    const int = {};
    inter.forEach((d) => {
      const l = d.data().locationId;
      if (typeof l === 'string' && l) int[l] = (int[l] || 0) + 1;
    });
    const hs = {};
    house.forEach((d) => {
      const h = d.data().houseId;
      if (typeof h === 'string' && h) hs[h] = (hs[h] || 0) + 1;
    });
    const out = { park: park.size, int: sorted(int), house: sorted(hs) };
    const ref = db.collection('stats').doc('presence');
    const cur = (await ref.get()).data() || null;
    const same = cur && JSON.stringify({ park: cur.park, int: sorted(cur.int || {}), house: sorted(cur.house || {}) }) === JSON.stringify(out);
    if (same && t - Number(cur.atMs || 0) < PRESENCE_SUMMARY_KEEPALIVE_MS) return { written: false, ...out };
    await ref.set({ ...out, atMs: t });
    return { written: true, ...out };
  }
  // Giriş/çıkış olayı: bu olayı kapsayan bir sayım zaten yapıldıysa ya da planlandıysa
  // hiçbir şey yapma; değilse (en erken GAP sonra) sayımı bu çağrı yapar.
  async function nudge(eventMs = now()) {
    let runAt = null;
    await db.runTransaction(async (tx) => {
      const d = (await tx.get(lockRef())).data() || {};
      const last = Number(d.lastRunMs || 0);
      const sched = Number(d.scheduledMs || 0);
      if (last >= eventMs || sched >= eventMs) {
        runAt = null;
        return;
      }
      runAt = Math.max(now(), last + PRESENCE_NUDGE_GAP_MS, eventMs);
      tx.set(lockRef(), { scheduledMs: runAt }, { merge: true });
    });
    if (runAt === null) return { skipped: true };
    const wait = runAt - now();
    if (wait > 0) await sleep(wait);
    return run();
  }
  return { run, nudge };
}
