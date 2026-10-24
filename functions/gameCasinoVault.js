// =============================================================================
// gameCasinoVault.js — v126 OYUNUN GAZİNOSU KASALARI → DEVLET
// -----------------------------------------------------------------------------
// Oyunun kendi gazinosunun kârının TAMAMI devlete gider (kullanıcı kararı).
// Devlet gazinoya para yatırmaz; gazino zarar ederse devletten para çıkmaz.
//
//   SLOT     : çevirme 1.600 altın → 200 devlet kârı, 1.400 maliyet (çöp).
//              200'ler gün boyu "slot" kasasında birikir, 00:00'da devlete yatar.
//   PİYANGO  : bilet 100 → 90 havuza (maliyet), 10 devlet kârı. Gece çekilişte
//              günün bilet kârı devlete yatar (index.js — çekiliş). Kazananın
//              ödülünden %10 piyango vergisi (değişmedi). Gazinoya ayrıca vergi yok.
//   RULET    : her çevirmede kasanın neti (bahis − ödeme) "rulet" kasasına yazılır.
//   10 NUMARA: dağıtımda kesilen bahisler (+) ve el sonunda ödenenler (−)
//              "onNumara" kasasına yazılır (kurpiyerin payı gerçek para değildir).
//
// RULET ve 10 NUMARA kasaları AYRI tutulur. Gece 00:00:
//   • kasa ARTIDAYSA → tamamı devlete yatar, kasa 0'dan devam eder;
//   • kasa EKSİDEYSE (ya da 0) → devlete bir şey gitmez, devletten de çıkmaz;
//     kasa kaldığı eksiden yeni günde devam eder (önce zararını kapatır).
//     Zararlar birikir: −3.000 ile kapanan kasa ertesi gün −4.000 daha yaparsa
//     −7.000 ile kapanır; sonra +10.000 yaparsa devlete 3.000 yatar.
// Oyuncu gözünde kasada hep para vardır (ödemeler kasa bakiyesine bakmaz);
// bu bakiye yalnızca devletin kârını hesaplamak için tutulan bir sayaçtır.
//
// Veri (yazma SADECE sunucudan; firestore.rules varsayılan: kapalı):
//   gameCasinoVault/{kasa}_s{0..N}  — { kind, balance, in, out, updatedAtMs }
//       (çok oyuncu aynı anda yazsın diye parça/shard; okuma tarafı toplar)
//   gameCasinoVault/{kasa}          — { lastSettledDay, lastSettle:{…}, totalDeposited }
//   gameCasinoVault/{kasa}/settles/{gün} — gece kapanış kaydı
// =============================================================================
import { stateWrite } from './stateTreasury.js';

export const VAULT_SHARDS = 10;
export const VAULT_KINDS = ['slot', 'rulet', 'onNumara'];
// kasa → devlet kasası (stateTreasury STATE_IN) kalemi
export const VAULT_STATE_CAT = {
  slot: 'gazino_slot',
  rulet: 'gazino_rulet',
  onNumara: 'gazino_onNumara',
};

const COL = 'gameCasinoVault';

// Kasaya artış yaz (transaction ya da batch). delta: + kasaya giren, − kasadan çıkan.
//   gross: { in, out } — rapor için ayrı toplamlar (opsiyonel)
// Hiçbir OKUMA gerektirmez (işlemlere çakışma eklemez).
export function vaultWrite(writer, db, FieldValue, kind, { delta = 0, gross = null, atMs = Date.now(), shard = null } = {}) {
  if (!VAULT_KINDS.includes(kind)) return 0;
  const d = Math.round(Number(delta) || 0);
  const gin = Math.max(0, Math.round(Number(gross?.in) || 0));
  const gout = Math.max(0, Math.round(Number(gross?.out) || 0));
  if (!d && !gin && !gout) return 0;
  const s = shard == null ? Math.floor(Math.random() * VAULT_SHARDS) : Math.abs(Number(shard) || 0) % VAULT_SHARDS;
  const patch = { kind, balance: FieldValue.increment(d), updatedAtMs: atMs };
  if (gin) patch.in = FieldValue.increment(gin);
  if (gout) patch.out = FieldValue.increment(gout);
  writer.set(db.collection(COL).doc(`${kind}_s${s}`), patch, { merge: true });
  return d;
}

// Gece 00:00 (dailyReset): her kasayı ayrı transaction'da kapatır.
//   dateKey: YENİ gün (devlet raporunda gelir bu güne yazılır).
//   İdempotent: kasa belgesindeki lastSettledDay === dateKey ise atlar.
export async function settleGameCasinoVaults(db, FieldValue, { dateKey, atMs = Date.now() } = {}) {
  const out = {};
  for (const kind of VAULT_KINDS) {
    const metaRef = db.collection(COL).doc(kind);
    const shardRefs = Array.from({ length: VAULT_SHARDS }, (_, i) => db.collection(COL).doc(`${kind}_s${i}`));
    out[kind] = await db.runTransaction(async (tx) => {
      const [meta, ...shards] = await Promise.all([tx.get(metaRef), ...shardRefs.map((r) => tx.get(r))]);
      const m = meta.data() || {};
      if (m.lastSettledDay === dateKey) return { skipped: true };
      let balance = 0;
      let gin = 0;
      let gout = 0;
      shards.forEach((s) => {
        const v = s.data() || {};
        balance += Number(v.balance || 0);
        gin += Number(v.in || 0);
        gout += Number(v.out || 0);
      });
      const deposit = balance > 0 ? Math.floor(balance) : 0;
      if (deposit > 0) {
        stateWrite(tx, db, FieldValue, { kind: 'in', cat: VAULT_STATE_CAT[kind], amount: deposit, atMs, dayKey: dateKey });
      }
      // Kasa sıfırlanır: artıdaysa 0'dan, eksideyse kaldığı eksiden devam (tek parçada tutulur).
      // in/out günlük toplamlardır → her gece sıfırlanır.
      const carry = deposit > 0 ? 0 : balance;
      shards.forEach((s, i) => {
        if (s.exists || i === 0) tx.set(shardRefs[i], { kind, balance: i === 0 ? carry : 0, in: 0, out: 0, updatedAtMs: atMs });
      });
      const rec = { dayKey: dateKey, balance, deposit, carry, in: gin, out: gout, atMs };
      tx.set(metaRef.collection('settles').doc(dateKey), rec);
      tx.set(
        metaRef,
        { kind, lastSettledDay: dateKey, lastSettle: rec, totalDeposited: FieldValue.increment(deposit), updatedAtMs: atMs },
        { merge: true }
      );
      return rec;
    });
  }
  return out;
}
