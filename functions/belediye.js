// =============================================================================
// belediye.js — v127 BELEDİYE YÖNETİMİ
// -----------------------------------------------------------------------------
// Kadro: 1 Belediye Başkanı · 2 Başkan Yardımcısı · 4 Bakan (Sanayi, Ticaret,
// Teşkilat, Kültür ve Spor). Seçim yok — şimdilik başkanlığı yönetici hesabı
// devralır ("Başkanlığı devral").
//
//   • Davet: başkan (ve "davet" yetkisi olan yardımcı — sadece bakanlıklara)
//     ARKADAŞINI davet eder. SMS + hatırlatma; davetli Belediye binasında
//     kabul / red eder. 24 saatte cevaplanmayan davet düşer. Bir koltuk için
//     aynı anda tek davet. Kabul için başka devlet görevi olmamalı (polis /
//     imam önce istifa eder). Göreve başlayan ilk 24 saat görevden alınamaz.
//   • Yetkiler: başkan her şeyi yapar. Bakan kendi bakanlığının ayarlarını
//     yapar, diğer panelleri sadece görür. Yardımcı: başkanın verdiği
//     bakanlıklar + (isteğe bağlı) bakan görevden alma / bakan davet etme.
//     Yardımcı yardımcıyı atamaz/davet edemez. Bakan kimseyi atamaz.
//     Borç ödeme yetkisi başkan ve yardımcılarda HER ZAMAN vardır.
//     Kadro maaşlarını sadece başkan belirler.
//   • Vergi / maaş ayarı: functions/belediyeRates.js (gün içinde ±1 adım,
//     00:00'da yürürlüğe girer). 00:00'da değişiklikler Toplu Rapor'a işlenir ve
//     Sixtagram'da Belediye hesabından duyurulur (değişiklik yoksa paylaşım yok).
//   • İmam: Kültür ve Spor yetkisi olan, gerekçe yazarak imamı görevden alabilir
//     (imam göreve başladıktan sonraki ilk 24 saat alınamaz).
//   • Gece maaşları (polis + imam + belediye kadrosu): kasa yetmezse HİÇBİRİ
//     ödenmez, o günün maaşları borç olarak yazılır (functions/belediyeKasa.js).
//     Polislerin rüşvet payı her durumda yatar.
//   • Bağış: oyuncular (ve çeteler — Çetem › Çeteye gönder › Belediye) belediye
//     kasasına bağış yapar; günün en çok bağış yapan 3'ü raporda.
//   • Sohbet: Belediye (tüm kadro) · Koordinasyon (kadro + polisin en üst 3
//     rütbesi; polisler kod adıyla görünür).
// =============================================================================
import {
  MINISTRIES,
  MINISTRY_IDS,
  RATE_BY_ID,
  RATE_ITEMS,
  resolveRates,
  validateNext,
  rateChanges,
  rateDayKey,
  addDayKey,
  seatSalary,
  policeSalary,
  ministryOfCat,
  isGoodChange,
  ratesOfMinistry,
} from './belediyeRates.js';
import { stateWrite, STATE_IN, STATE_OUT } from './stateTreasury.js';
import { createKasa } from './belediyeKasa.js';
import { gazeteNews } from './belediyeGazete.js';

export const SEATS = {
  bsk: { id: 'bsk', title: 'Belediye Başkanı', kind: 'bsk' },
  yrd1: { id: 'yrd1', title: 'Belediye Başkan Yardımcısı', kind: 'yrd' },
  yrd2: { id: 'yrd2', title: 'Belediye Başkan Yardımcısı', kind: 'yrd' },
  san: { id: 'san', title: 'Sanayi Bakanı', kind: 'bakan', m: 'sanayi' },
  tic: { id: 'tic', title: 'Ticaret Bakanı', kind: 'bakan', m: 'ticaret' },
  guv: { id: 'guv', title: 'Teşkilat Bakanı', kind: 'bakan', m: 'guvenlik' },
  kul: { id: 'kul', title: 'Kültür ve Spor Bakanı', kind: 'bakan', m: 'kultur' },
};
export const SEAT_IDS = Object.keys(SEATS);
export const YRD_PERMS = ['sanayi', 'ticaret', 'guvenlik', 'kultur', 'fire', 'invite'];
export const BELEDIYE = {
  INVITE_TTL_MS: 24 * 3600_000,
  GUARD_MS: 24 * 3600_000, // ilk 24 saat görevden alınamaz (kadro ve imam)
  IMAM_GUARD_MS: 24 * 3600_000,
  IMAM_REAPPLY_COOLDOWN_MS: 24 * 3600_000,
  MIN_DONATION: 100,
  CHAT_MAX: 300,
  CHAT_MIN_INTERVAL_MS: 1500,
  REASON_MIN: 3,
  REASON_MAX: 200,
  LOG_MAX: 30,
  // Gün sonu kilidi: 23:59:30 – 24:00 arası ayar yapılamaz (gece devriyle yarışmasın)
  DAY_END_LOCK_MS: 30_000,
  POLICE_CHAT_RANKS: ['baskan', 'sef', 'uzman'],
  // v127 gazete: başkan ve yardımcılar günde TEK yazı (yenisi eskisinin yerine geçer)
  GAZETE_SEATS: ['bsk', 'yrd1', 'yrd2'],
  GAZETE_MIN: 20,
  GAZETE_MAX: 1200,
  // v127 şikâyet kutusu
  SIKAYET_MIN: 10,
  SIKAYET_MAX: 300,
  SIKAYET_PER_DAY: 3,
  SIKAYET_TTL_MS: 7 * 24 * 3600_000,
};
const ROLE_CAT = { polis: 'maas_polis', imam: 'maas_imam', belediye: 'maas_belediye' };
const POLICE_RANK_LABEL = { baskan: 'Emniyet Genel Müdürü', sef: 'Emniyet Amiri', uzman: 'Başkomiser', ajan: 'Komiser', muhbir: 'Polis Memuru' };
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const midnightMsOf = (dayKey) => Date.parse(`${dayKey}T00:00:00+03:00`);
const dayLabel = (k) => (k ? `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}` : '');

// --- saf yardımcılar (testler de kullanır) -----------------------------------
export function seatOfUid(main, uid) {
  if (!uid) return null;
  for (const id of SEAT_IDS) if (main?.seats?.[id]?.uid === uid) return id;
  return null;
}
export function canMinistry(main, seat, m) {
  if (!seat) return false;
  if (seat === 'bsk') return true;
  if (m === 'yonetim') return false;
  if (SEATS[seat]?.kind === 'yrd') return Boolean(main?.seats?.[seat]?.perms?.[m]);
  return SEATS[seat]?.m === m;
}
export function canFireSeat(main, actorSeat, targetSeat) {
  if (!actorSeat || !targetSeat || actorSeat === targetSeat) return false;
  if (targetSeat === 'bsk') return false;
  if (actorSeat === 'bsk') return true;
  if (SEATS[actorSeat]?.kind === 'yrd') return Boolean(main?.seats?.[actorSeat]?.perms?.fire) && SEATS[targetSeat]?.kind === 'bakan';
  return false;
}
export function canInviteSeat(main, actorSeat, targetSeat) {
  if (!actorSeat || !SEATS[targetSeat] || targetSeat === 'bsk') return false;
  if (actorSeat === 'bsk') return true;
  if (SEATS[actorSeat]?.kind === 'yrd') return Boolean(main?.seats?.[actorSeat]?.perms?.invite) && SEATS[targetSeat]?.kind === 'bakan';
  return false;
}
export const canPayDebts = (seat) => seat === 'bsk' || SEATS[seat]?.kind === 'yrd';
export const inviteActive = (inv, nowMs) => Boolean(inv?.uid) && Number(inv.expiresAtMs || 0) > nowMs;
export const ratesEqual = (a, b) => RATE_ITEMS.every((it) => Number(a?.[it.id]) === Number(b?.[it.id]));

// Gece raporu: devlet defteri gününü bakanlıklara böl
export function ministryReport(day) {
  const by = Object.fromEntries([...MINISTRY_IDS, 'yonetim'].map((m) => [m, { m, in: 0, out: 0, lines: [] }]));
  for (const [cat, v] of Object.entries(day?.in || {})) {
    const n = Math.round(Number(v) || 0);
    if (!n) continue;
    const r = by[ministryOfCat('in', cat)];
    r.in += n;
    r.lines.push({ kind: 'in', cat, label: STATE_IN[cat] || cat, amount: n });
  }
  for (const [cat, v] of Object.entries(day?.out || {})) {
    const n = Math.round(Number(v) || 0);
    if (!n) continue;
    const r = by[ministryOfCat('out', cat)];
    r.out += n;
    r.lines.push({ kind: 'out', cat, label: STATE_OUT[cat] || cat, amount: n });
  }
  for (const r of Object.values(by)) r.lines.sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'in' ? -1 : 1));
  const inTotal = Object.values(by).reduce((a, r) => a + r.in, 0);
  const outTotal = Object.values(by).reduce((a, r) => a + r.out, 0);
  return { ministries: by, inTotal, outTotal, net: inTotal - outTotal };
}

export function createBelediye({
  db,
  FieldValue,
  HttpsError,
  requireAuth,
  onCall,
  splitIncomeForDebt,
  goldTag = (s) => s,
  isAdmin = async () => false,
  liveMembership = async () => null, // uid → { worldId, ms } (canlı çete dünyası üyelik belgesi)
  assertCanSpeak = async () => {},
  postSixtagram = async () => {},
  rates: ratesApi, // { loadRates, ratesFor }
  now = () => Date.now(),
}) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const inc = (n) => FieldValue.increment(n);
  const kasa = createKasa({ db, FieldValue, now });
  const mainRef = db.doc('belediye/main');
  const ratesRef = db.doc('belediye/rates');
  const pendingRef = db.doc('belediye/pending');
  const publicRef = db.doc('belediye/public');
  const userRef = (uid) => db.collection('users').doc(uid);
  const staffRef = (uid) => db.collection('belediyeStaff').doc(uid);
  const payrollRef = (day) => db.collection('belediyePayroll').doc(day);
  const debtRef = (id) => db.collection('belediyeDebts').doc(id);
  const donationsRef = (day) => db.collection('belediyeDonations').doc(day);
  const draftRef = db.doc('belediye/gazeteDraft'); // sadece sunucu (kadro panel çağrısıyla görür)
  const govRef = db.doc('belediye/gov'); // mevcut başkanın göreve geldiği gündeki oranlar
  const gazeteRef = (day) => db.collection('belediyeGazete').doc(day);
  const sikayetCol = db.collection('belediyeSikayet');
  const smsTo = (tx, uid, text, type = 'belediye') =>
    tx.set(userRef(uid).collection('messages').doc(), { text, createdAt: FieldValue.serverTimestamp(), read: false, type });
  const logLine = (main, text) => [{ atMs: now(), text }, ...(Array.isArray(main?.log) ? main.log : [])].slice(0, BELEDIYE.LOG_MAX);
  const today = () => rateDayKey(now());
  const ratesToday = () => (ratesApi?.ratesFor ? ratesApi.ratesFor(today()) : resolveRates(null, today()));

  // Süresi dolmuş davetleri ayıkla. Dönüş: { invites (geçerliler), expired }
  function splitInvites(main) {
    const invites = {};
    const expired = [];
    const t = now();
    for (const [seat, inv] of Object.entries(main?.invites || {})) {
      if (inviteActive(inv, t)) invites[seat] = inv;
      else if (inv?.uid) expired.push({ seat, ...inv });
    }
    return { invites, expired };
  }
  // Düşen davetlerin oyuncu işaretini kaldır (aynı işlemde; o belgeyi zaten
  // yazan çağıranın uid'leri atlanır — bir belgeye işlemde tek yazma).
  function clearExpired(tx, expired, skip = []) {
    const seen = new Set(skip);
    for (const inv of expired) {
      if (seen.has(inv.uid)) continue;
      seen.add(inv.uid);
      tx.set(userRef(inv.uid), { belediyeInvite: FieldValue.delete() }, { merge: true });
    }
  }
  // belediye/main TAM yazılır (işlem içinde okunduktan sonra) — iç içe haritalarda
  // merge silinen anahtarları bırakmasın diye.
  function writeMain(tx, main, patch) {
    tx.set(mainRef, { seats: main.seats || {}, invites: main.invites || {}, log: main.log || [], ...patch, updatedAtMs: now() });
  }

  // Oyuncunun başka devlet görevi var mı? (polis / bekleyen polislik / imam)
  async function stateJobBlock(tx, uid, user) {
    if (user?.isImam) return 'İmamlık yapan biri belediyede görev alamaz. Önce imamlıktan istifa etmelisin.';
    if (user?.profession === 'polis' || user?.pendingPoliceChange === 'apply') return 'Polisler belediyede görev alamaz. Önce polislikten istifa etmelisin.';
    const lm = await liveMembership(uid, tx).catch(() => null);
    if (lm?.ms?.intelRosterId) return 'Polisler belediyede görev alamaz. Önce polislikten istifa etmelisin.';
    if (lm?.ms?.intelAppId) return 'Bekleyen bir polislik başvurun var — önce onu geri çekmelisin.';
    return null;
  }

  // ===========================================================================
  // Oran ayarı (gün içinde ±1 adım, 00:00'da yürürlüğe girer)
  // ===========================================================================
  // pending.nextDay ≤ bugün ise o set artık yürürlükte → byDay'e işlenir.
  function rollPatch(ratesDoc, pending, dayKey) {
    if (!pending?.next || !pending?.nextDay || pending.nextDay > dayKey) return null;
    const prev = resolveRates(ratesDoc, addDayKey(pending.nextDay, -1));
    const byDay = { ...(ratesDoc?.byDay || {}) };
    if (!ratesEqual(prev, pending.next)) byDay[pending.nextDay] = resolveRates({ byDay: { [pending.nextDay]: pending.next } }, pending.nextDay);
    // en fazla son 12 değişiklik tutulur (en yenisi her zaman kalır)
    const keys = Object.keys(byDay).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 12))) delete byDay[k];
    return { byDay };
  }

  async function setRate(uid, { id, value }) {
    const it = RATE_BY_ID[id];
    if (!it) fail('invalid-argument', 'Geçersiz kalem.');
    const v = Math.round(Number(value));
    if (!Number.isFinite(v)) fail('invalid-argument', 'Geçersiz değer.');
    const t = now();
    const day = rateDayKey(t);
    if (midnightMsOf(addDayKey(day, 1)) - t <= BELEDIYE.DAY_END_LOCK_MS) fail('failed-precondition', "Gün bitmek üzere — 00:00'dan sonra tekrar dene.");
    let result = null;
    await db.runTransaction(async (tx) => {
      const [ms, rs, ps, us] = await Promise.all([tx.get(mainRef), tx.get(ratesRef), tx.get(pendingRef), tx.get(userRef(uid))]);
      const main = ms.data() || {};
      const seat = seatOfUid(main, uid);
      if (!canMinistry(main, seat, it.m)) fail('permission-denied', it.m === 'yonetim' ? 'Kadro maaşlarını sadece belediye başkanı belirler.' : 'Bu bakanlığın ayarlarını yapma yetkin yok.');
      let ratesDoc = rs.data() || {};
      let pending = ps.data() || null;
      const roll = rollPatch(ratesDoc, pending, day);
      let rolled = {};
      if (roll) {
        ratesDoc = { ...ratesDoc, ...roll };
        tx.set(ratesRef, { byDay: roll.byDay, updatedAtMs: t });
        rolled = { rolledDay: pending.nextDay, lastBy: pending.by || {} };
        pending = null;
      } else if (pending?.rolledDay) rolled = { rolledDay: pending.rolledDay, lastBy: pending.lastBy || {} };
      const cur = resolveRates(ratesDoc, day);
      const tomorrow = addDayKey(day, 1);
      const base = pending?.nextDay === tomorrow ? resolveRates({ byDay: { [tomorrow]: pending.next } }, tomorrow) : { ...cur };
      const next = { ...base, [id]: v };
      const err = validateNext(cur, next);
      if (err) fail('failed-precondition', err);
      const name = us.data()?.displayName || 'Oyuncu';
      const by = { ...(pending?.nextDay === tomorrow ? pending.by || {} : {}) };
      if (v === cur[id]) delete by[id];
      else by[id] = { name, seat, atMs: t };
      if (ratesEqual(cur, next)) tx.set(pendingRef, { next: null, nextDay: null, by: {}, ...rolled, updatedAtMs: t });
      else tx.set(pendingRef, { next, nextDay: tomorrow, by, ...rolled, updatedAtMs: t });
      result = { ok: true, id, value: v, current: cur[id], nextDay: tomorrow };
    });
    return result;
  }

  // 00:00 — bekleyen ayar yürürlüğe girer; bugünün değişiklikleri rapora + Sixtagram'a
  async function nightlyRoll(dayKey) {
    const pub = (await publicRef.get()).data() || {};
    if (pub.changesDay === dayKey) return { skipped: true, changes: pub.changes || [] };
    await db.runTransaction(async (tx) => {
      const [rs, ps] = await Promise.all([tx.get(ratesRef), tx.get(pendingRef)]);
      const roll = rollPatch(rs.data() || {}, ps.data() || null, dayKey);
      if (!roll) return;
      tx.set(ratesRef, { byDay: roll.byDay, updatedAtMs: now() });
      tx.set(pendingRef, { next: null, nextDay: null, by: {}, rolledDay: dayKey, lastBy: ps.data()?.by || {}, updatedAtMs: now() });
    });
    const [rs, ps] = await Promise.all([ratesRef.get(), pendingRef.get()]);
    const ratesDoc = rs.data() || {};
    const prev = resolveRates(ratesDoc, addDayKey(dayKey, -1));
    const cur = resolveRates(ratesDoc, dayKey, ps.data());
    const by = ps.data()?.rolledDay === dayKey ? ps.data()?.lastBy || {} : {};
    const changes = rateChanges(prev, cur).map((c) => ({ ...c, by: by[c.id]?.name || null, good: isGoodChange(c.unit, c.id, c.to - c.from) }));
    await publicRef.set({ changesDay: dayKey, changes, updatedAtMs: now() }, { merge: true });
    if (ratesApi?.loadRates) await ratesApi.loadRates(db, { force: true }).catch(() => {});
    // v127: zam / indirim duyurusu artık Sixtagram'da değil, gecenin gazetesinde (buildGazete)
    return { changes };
  }

  // ===========================================================================
  // Kadro
  // ===========================================================================
  async function claimMayor(uid) {
    const t = now();
    await db.runTransaction(async (tx) => {
      const [ms, us] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid))]);
      const main = ms.data() || {};
      const user = us.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (!(await isAdmin(uid, user))) fail('permission-denied', 'Başkanlığı sadece yönetici hesabı devralabilir.');
      if (main.seats?.bsk?.uid) fail('failed-precondition', 'Belediyenin zaten bir başkanı var.');
      if (seatOfUid(main, uid)) fail('failed-precondition', 'Zaten belediyede görevlisin.');
      const block = await stateJobBlock(tx, uid, user);
      if (block) fail('failed-precondition', block);
      const { invites, expired } = splitInvites(main);
      // kendine gelmiş bir davet varsa düşer
      for (const s2 of Object.keys(invites)) if (invites[s2].uid === uid) delete invites[s2];
      const seat = { uid, name: user.displayName || 'Oyuncu', avatar: user.avatar || null, sinceMs: t, guardUntilMs: t + BELEDIYE.GUARD_MS };
      writeMain(tx, main, { seats: { ...(main.seats || {}), bsk: seat }, invites, log: logLine(main, `👑 ${seat.name} belediye başkanı oldu`) });
      clearExpired(tx, expired, [uid]);
      tx.set(userRef(uid), { belediyeSeat: 'bsk', belediyeInvite: FieldValue.delete() }, { merge: true });
      tx.set(staffRef(uid), { seat: 'bsk', sinceMs: t });
      smsTo(tx, uid, '🏛️ Neon Şehir Belediyesinin başkanı oldun. Kadronu Belediye › Başkanlık sekmesinden kurabilirsin.');
    });
    return { ok: true };
  }

  async function invite(uid, { seat, targetUid }) {
    if (!SEATS[seat] || seat === 'bsk') fail('invalid-argument', 'Geçersiz görev.');
    const target = String(targetUid || '');
    if (!target || target === uid) fail('invalid-argument', 'Geçersiz oyuncu.');
    const t = now();
    let res = null;
    await db.runTransaction(async (tx) => {
      const [ms, me, tu, fr] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid)), tx.get(userRef(target)), tx.get(db.collection('friendships').doc(uid))]);
      const main = ms.data() || {};
      const actorSeat = seatOfUid(main, uid);
      if (!canInviteSeat(main, actorSeat, seat)) fail('permission-denied', SEATS[seat].kind === 'yrd' ? 'Başkan yardımcılığına sadece belediye başkanı davet edebilir.' : 'Bu göreve davet etme yetkin yok.');
      if (main.seats?.[seat]?.uid) fail('failed-precondition', 'Bu görev dolu.');
      const { invites, expired } = splitInvites(main);
      if (invites[seat]) fail('failed-precondition', 'Bu görev için zaten cevap bekleyen bir davet var.');
      if (!fr.data()?.friends?.[target]) fail('failed-precondition', 'Sadece arkadaşlarını davet edebilirsin.');
      const tuser = tu.data();
      if (!tuser) fail('not-found', 'Oyuncu bulunamadı.');
      if (seatOfUid(main, target)) fail('failed-precondition', 'Bu oyuncu zaten belediyede görevli.');
      if (Object.values(invites).some((inv) => inv.uid === target)) fail('failed-precondition', 'Bu oyuncunun cevap bekleyen başka bir belediye daveti var.');
      const salary = seatSalary(ratesToday(), seat);
      const byName = me.data()?.displayName || 'Oyuncu';
      const inv = { uid: target, name: tuser.displayName || 'Oyuncu', avatar: tuser.avatar || null, byUid: uid, byName, bySeat: actorSeat, atMs: t, expiresAtMs: t + BELEDIYE.INVITE_TTL_MS };
      invites[seat] = inv;
      writeMain(tx, main, { invites, log: logLine(main, `✉️ ${inv.name} → ${SEATS[seat].title} için davet edildi`) });
      clearExpired(tx, expired, [target]);
      tx.set(userRef(target), { belediyeInvite: { seat, title: SEATS[seat].title, salary, byName, bySeat: actorSeat, atMs: t, expiresAtMs: inv.expiresAtMs } }, { merge: true });
      const who = actorSeat === 'bsk' ? 'Belediye başkanı' : `Belediye başkan yardımcısı ${byName}`;
      const job = SEATS[seat].kind === 'bakan' ? `${MINISTRIES[SEATS[seat].m].label} görevine` : 'başkan yardımcılığı görevine';
      smsTo(tx, target, `🏛️ ${who} seni ${job} davet ediyor. Maaş ${fmt(salary)} altın. Kabul etmek için belediyeye uğra.`, 'belediye_invite');
      res = { ok: true, expiresAtMs: inv.expiresAtMs };
    });
    return res;
  }

  async function cancelInvite(uid, { seat }) {
    await db.runTransaction(async (tx) => {
      const ms = await tx.get(mainRef);
      const main = ms.data() || {};
      const actorSeat = seatOfUid(main, uid);
      const { invites, expired } = splitInvites(main);
      const inv = invites[seat];
      if (!inv) fail('failed-precondition', 'Bekleyen davet yok.');
      if (!(inv.byUid === uid || canInviteSeat(main, actorSeat, seat))) fail('permission-denied', 'Bu daveti geri çekemezsin.');
      delete invites[seat];
      writeMain(tx, main, { invites, log: logLine(main, `↩️ ${inv.name} için ${SEATS[seat].title} daveti geri çekildi`) });
      clearExpired(tx, expired, [inv.uid]);
      tx.set(userRef(inv.uid), { belediyeInvite: FieldValue.delete() }, { merge: true });
      smsTo(tx, inv.uid, `🏛️ ${SEATS[seat].title} daveti geri çekildi.`, 'belediye_invite');
    });
    return { ok: true };
  }

  async function respondInvite(uid, { accept }) {
    const t = now();
    let res = null;
    await db.runTransaction(async (tx) => {
      const [ms, us] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid))]);
      const main = ms.data() || {};
      const user = us.data() || {};
      const { invites, expired } = splitInvites(main);
      const seat = Object.keys(invites).find((s2) => invites[s2].uid === uid);
      if (!seat) {
        if (user.belediyeInvite) tx.set(userRef(uid), { belediyeInvite: FieldValue.delete() }, { merge: true });
        res = { ok: false, expired: true };
        return;
      }
      const inv = invites[seat];
      if (!accept) {
        delete invites[seat];
        writeMain(tx, main, { invites, log: logLine(main, `✖️ ${inv.name} ${SEATS[seat].title} davetini reddetti`) });
        clearExpired(tx, expired, [uid]);
        tx.set(userRef(uid), { belediyeInvite: FieldValue.delete() }, { merge: true });
        smsTo(tx, inv.byUid, `🏛️ ${inv.name}, ${SEATS[seat].title} davetini reddetti.`);
        res = { ok: true, accepted: false };
        return;
      }
      if (main.seats?.[seat]?.uid) fail('failed-precondition', 'Bu görev artık dolu.');
      if (seatOfUid(main, uid)) fail('failed-precondition', 'Zaten belediyede görevlisin.');
      const block = await stateJobBlock(tx, uid, user);
      if (block) fail('failed-precondition', block);
      const holder = { uid, name: user.displayName || inv.name, avatar: user.avatar || null, sinceMs: t, guardUntilMs: t + BELEDIYE.GUARD_MS };
      if (SEATS[seat].kind === 'yrd') holder.perms = Object.fromEntries(YRD_PERMS.map((p) => [p, false]));
      delete invites[seat];
      writeMain(tx, main, { seats: { ...(main.seats || {}), [seat]: holder }, invites, log: logLine(main, `✅ ${holder.name} ${SEATS[seat].title} oldu`) });
      clearExpired(tx, expired, [uid]);
      tx.set(userRef(uid), { belediyeSeat: seat, belediyeInvite: FieldValue.delete() }, { merge: true });
      tx.set(staffRef(uid), { seat, sinceMs: t });
      smsTo(tx, uid, `🏛️ ${SEATS[seat].title} olarak göreve başladın. Maaşın her gece 00:00'da belediye kasasından yatar.`);
      smsTo(tx, inv.byUid, `🏛️ ${holder.name}, ${SEATS[seat].title} davetini kabul etti.`);
      res = { ok: true, accepted: true, seat };
    });
    return res;
  }

  function removeFromSeat(tx, main, seat, logText) {
    const h = main.seats?.[seat];
    const { invites, expired } = splitInvites(main);
    writeMain(tx, main, { seats: { ...(main.seats || {}), [seat]: null }, invites, log: logLine(main, logText) });
    clearExpired(tx, expired, [h.uid]);
    tx.set(userRef(h.uid), { belediyeSeat: FieldValue.delete() }, { merge: true });
    tx.delete(staffRef(h.uid));
  }

  async function fire(uid, { seat, reason }) {
    const why = String(reason || '').trim().slice(0, BELEDIYE.REASON_MAX);
    if (why.length < BELEDIYE.REASON_MIN) fail('invalid-argument', 'Görevden alma nedenini yaz.');
    const t = now();
    await db.runTransaction(async (tx) => {
      const [ms, me] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid))]);
      const main = ms.data() || {};
      const actorSeat = seatOfUid(main, uid);
      const h = main.seats?.[seat];
      if (!h?.uid) fail('failed-precondition', 'Bu görev zaten boş.');
      if (!canFireSeat(main, actorSeat, seat)) fail('permission-denied', 'Bu görevliyi görevden alma yetkin yok.');
      if (Number(h.guardUntilMs || 0) > t) {
        const hrs = Math.max(1, Math.ceil((h.guardUntilMs - t) / 3_600_000));
        fail('failed-precondition', `Göreve yeni başladı — ${hrs} saat daha görevden alınamaz.`);
      }
      const byName = me.data()?.displayName || 'Oyuncu';
      removeFromSeat(tx, main, seat, `⛔ ${h.name} ${SEATS[seat].title} görevinden alındı (${byName}): ${why}`);
      smsTo(tx, h.uid, `🏛️ ${SEATS[actorSeat].title} ${byName} seni ${SEATS[seat].title} görevinden aldı. Neden: ${why}`);
    });
    return { ok: true };
  }

  async function resign(uid) {
    await db.runTransaction(async (tx) => {
      const ms = await tx.get(mainRef);
      const main = ms.data() || {};
      const seat = seatOfUid(main, uid);
      if (!seat) fail('failed-precondition', 'Belediyede görevli değilsin.');
      const h = main.seats[seat];
      removeFromSeat(tx, main, seat, `🚪 ${h.name} ${SEATS[seat].title} görevinden istifa etti`);
      const bsk = main.seats?.bsk;
      if (bsk?.uid && seat !== 'bsk') smsTo(tx, bsk.uid, `🏛️ ${h.name}, ${SEATS[seat].title} görevinden istifa etti.`);
      smsTo(tx, uid, `🏛️ ${SEATS[seat].title} görevinden istifa ettin.`);
    });
    return { ok: true };
  }

  async function setPerms(uid, { seat, perms }) {
    if (SEATS[seat]?.kind !== 'yrd') fail('invalid-argument', 'Yetki sadece başkan yardımcılarına verilir.');
    await db.runTransaction(async (tx) => {
      const ms = await tx.get(mainRef);
      const main = ms.data() || {};
      if (seatOfUid(main, uid) !== 'bsk') fail('permission-denied', 'Yetkileri sadece belediye başkanı verir.');
      const h = main.seats?.[seat];
      if (!h?.uid) fail('failed-precondition', 'Bu görev boş.');
      const clean = Object.fromEntries(YRD_PERMS.map((p) => [p, Boolean(perms?.[p])]));
      const on = YRD_PERMS.filter((p) => clean[p]).length;
      writeMain(tx, main, { seats: { ...main.seats, [seat]: { ...h, perms: clean } }, log: logLine(main, `🔑 ${h.name}: ${on} yetki`) });
    });
    return { ok: true };
  }

  // ===========================================================================
  // İmam (Kültür ve Spor yetkisi)
  // ===========================================================================
  async function fireImam(uid, { reason }) {
    const why = String(reason || '').trim().slice(0, BELEDIYE.REASON_MAX);
    if (why.length < BELEDIYE.REASON_MIN) fail('invalid-argument', 'Görevden alma nedenini yaz.');
    const t = now();
    await db.runTransaction(async (tx) => {
      const curRef = db.collection('imamState').doc('current');
      const metaRef = db.collection('imamState').doc('meta');
      const [ms, me, cur] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid)), tx.get(curRef)]);
      const main = ms.data() || {};
      const seat = seatOfUid(main, uid);
      if (!canMinistry(main, seat, 'kultur')) fail('permission-denied', 'İmamı görevden almak için Kültür ve Spor yetkisi gerekir.');
      const im = cur.data();
      if (!im?.uid) fail('failed-precondition', 'Şu an imam yok.');
      const became = im.becameImamAt?.toMillis?.() ?? Number(im.becameImamAtMs || 0);
      if (became && t - became < BELEDIYE.IMAM_GUARD_MS) {
        const hrs = Math.max(1, Math.ceil((became + BELEDIYE.IMAM_GUARD_MS - t) / 3_600_000));
        fail('failed-precondition', `İmam göreve yeni başladı — ${hrs} saat daha görevden alınamaz.`);
      }
      const byName = me.data()?.displayName || 'Oyuncu';
      tx.delete(curRef);
      tx.set(metaRef, { lastFiredUid: im.uid, lastFiredAt: FieldValue.serverTimestamp(), lastFiredBy: 'belediye', lastFiredReason: why }, { merge: true });
      tx.set(userRef(im.uid), { isImam: false, imamCooldownUntilMs: t + BELEDIYE.IMAM_REAPPLY_COOLDOWN_MS }, { merge: true });
      smsTo(tx, im.uid, `🕌 ${SEATS[seat].title} ${byName} seni imamlık görevinden aldı. Neden: ${why}`, 'imam_fired');
      writeMain(tx, main, { log: logLine(main, `🕌 İmam ${im.displayName || ''} görevden alındı (${byName}): ${why}`) });
    });
    return { ok: true };
  }

  // ===========================================================================
  // Bağış (oyuncu + çete)
  // ===========================================================================
  // İşlem içinde, okumalardan sonra çağrılır (gün belgesi önceden okunmalı)
  function donationTx(tx, dayDoc, { day, key, name, kind, logo = null, amount }) {
    const donors = { ...(dayDoc?.donors || {}) };
    const cur = donors[key] || { name, kind, amount: 0 };
    donors[key] = { name, kind, ...(logo ? { logo } : {}), amount: Number(cur.amount || 0) + amount };
    const top = Object.entries(donors)
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    tx.set(donationsRef(day), { dayKey: day, donors, top, total: inc(amount), count: inc(1), updatedAtMs: now() }, { merge: true });
    stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'bagis', amount, atMs: now(), dayKey: day, stat: { bagis_n: 1 } });
  }

  async function donate(uid, { amount }) {
    const amt = Math.floor(Number(amount) || 0);
    if (!(amt >= BELEDIYE.MIN_DONATION)) fail('invalid-argument', `En az ${fmt(BELEDIYE.MIN_DONATION)} altın bağışlanabilir.`);
    const day = today();
    await db.runTransaction(async (tx) => {
      const [us, ds] = await Promise.all([tx.get(userRef(uid)), tx.get(donationsRef(day))]);
      const u = us.data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      if (Number(u.gold || 0) < amt) fail('failed-precondition', 'Yeterli altının yok.');
      tx.update(userRef(uid), { gold: inc(-amt), goldTag: goldTag('belediyeBagis') });
      donationTx(tx, ds.data(), { day, key: `p_${uid}`, name: u.displayName || 'Oyuncu', kind: 'player', amount: amt });
    });
    return { ok: true, amount: amt };
  }

  // Çete kasasından bağış — functions/gang/actions/treasury.js (aynı işlem içinde)
  async function gangDonationReadTx(tx) {
    return (await tx.get(donationsRef(today()))).data() || null;
  }
  function gangDonationWriteTx(tx, dayDoc, { gangId, name, logo, amount }) {
    donationTx(tx, dayDoc, { day: today(), key: `g_${gangId}`, name, kind: 'gang', logo, amount });
  }

  // ===========================================================================
  // Sohbet
  // ===========================================================================
  async function chat(uid, { channel, text }) {
    const ch = channel === 'koord' ? 'koord' : 'genel';
    const msg = String(text || '').trim().slice(0, BELEDIYE.CHAT_MAX);
    if (!msg) fail('invalid-argument', 'Mesaj boş.');
    await assertCanSpeak(uid, { text: msg });
    const t = now();
    const limRef = db.collection('belediyeChatLimits').doc(uid);
    await db.runTransaction(async (tx) => {
      const [ms, us, lim] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid)), tx.get(limRef)]);
      const main = ms.data() || {};
      const seat = seatOfUid(main, uid);
      let author = null;
      if (seat) {
        const u = us.data() || {};
        author = { authorKind: 'belediye', uid, name: u.displayName || 'Oyuncu', avatar: u.avatar || null, title: SEATS[seat].title, seat };
      } else if (ch === 'koord') {
        const lm = await liveMembership(uid, tx).catch(() => null);
        const rank = lm?.ms?.intelRank;
        if (lm?.ms?.intelRosterId && BELEDIYE.POLICE_CHAT_RANKS.includes(rank)) {
          // rosterId + worldId: yalnızca bildirim (moderasyon) için — kimlik sunucuda çözülür
          author = { authorKind: 'polis', name: lm.ms.intelCodeName || 'Polis', title: POLICE_RANK_LABEL[rank] || 'Polis', rank, rosterId: lm.ms.intelRosterId, worldId: lm.worldId || null };
        }
      }
      if (!author) fail('permission-denied', ch === 'koord' ? 'Bu sohbete sadece belediye kadrosu ve polisin rütbelileri yazabilir.' : 'Bu sohbete sadece belediye kadrosu yazabilir.');
      if (t - Number(lim.data()?.atMs || 0) < BELEDIYE.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş.');
      tx.set(limRef, { atMs: t });
      tx.set(db.collection(`belediyeChat_${ch}`).doc(), { ...author, text: msg, createdAtMs: t });
    });
    return { ok: true };
  }

  // ===========================================================================
  // GECE MAAŞLARI (polis + imam + belediye kadrosu)
  // ===========================================================================
  // Polis listesi: functions/gang/actions/roles.js (gece turunda, biten günün rütbesiyle)
  async function setPolicePayroll(dayKey, { worldId, payees, bribe }) {
    const clean = (payees || []).map((p) => ({ key: p.uid, uid: p.uid, role: 'polis', rid: p.rid, rank: p.rank, salary: Math.max(0, Math.round(Number(p.salary) || 0)), bribe: Math.max(0, Math.floor(Number(p.bribe) || 0)), name: POLICE_RANK_LABEL[p.rank] || 'Polis' }));
    await db.runTransaction(async (tx) => {
      const s = await tx.get(payrollRef(dayKey));
      if (s.data()?.police?.ready) return;
      tx.set(payrollRef(dayKey), { dayKey, police: { ready: true, worldId: worldId || null, payees: clean, bribe: bribe || null, atMs: now() } }, { merge: true });
    });
  }

  // Kadro + imam (dailyReset, imam kontrolünden SONRA). Rates: biten günün maaşları.
  async function snapshotStaffAndImam(dayKey) {
    const ref = payrollRef(dayKey);
    const cur = (await ref.get()).data() || {};
    if (cur.staff?.ready && cur.imam?.ready) return;
    const midnight = midnightMsOf(dayKey);
    const workDay = addDayKey(dayKey, -1);
    const r = ratesApi?.ratesFor ? ratesApi.ratesFor(workDay) : resolveRates(null, workDay);
    const main = (await mainRef.get()).data() || {};
    const staff = [];
    for (const seat of SEAT_IDS) {
      const h = main.seats?.[seat];
      if (!h?.uid || Number(h.sinceMs || 0) >= midnight) continue;
      staff.push({ key: h.uid, uid: h.uid, role: 'belediye', seat, name: SEATS[seat].title, salary: seatSalary(r, seat), bribe: 0 });
    }
    const im = (await db.doc('imamState/current').get()).data();
    const imam = [];
    const became = im?.becameImamAt?.toMillis?.() ?? 0;
    if (im?.uid && became && became < midnight) imam.push({ key: im.uid, uid: im.uid, role: 'imam', name: 'İmam', salary: Math.max(0, Math.round(Number(r.imam) || 0)), bribe: 0 });
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(ref)).data() || {};
      const patch = { dayKey };
      if (!s.staff?.ready) patch.staff = { ready: true, payees: staff, atMs: now() };
      if (!s.imam?.ready) patch.imam = { ready: true, payees: imam, atMs: now() };
      tx.set(ref, patch, { merge: true });
    });
  }

  async function liveWorldInfo() {
    const cfg = (await db.doc('gangSystem/config').get()).data() || {};
    return cfg.liveOpen && cfg.liveWorldId ? cfg.liveWorldId : null;
  }

  const payeesOf = (p) => [...(p.police?.payees || []), ...(p.imam?.payees || []), ...(p.staff?.payees || [])];

  // Hazırsa karar ver + öde. Tekrar çağrılabilir (yarıda kalırsa kaldığı yerden).
  async function tryRunPayroll(dayKey) {
    const ref = payrollRef(dayKey);
    let p = (await ref.get()).data();
    if (!p) return { waiting: 'none' };
    if (!p.police?.ready) {
      const w = await liveWorldInfo();
      if (w) return { waiting: 'police' };
      await ref.set({ police: { ready: true, worldId: null, payees: [], atMs: now() } }, { merge: true });
      p = (await ref.get()).data();
    }
    if (!p.staff?.ready || !p.imam?.ready) return { waiting: 'staff' };
    if (p.status === 'done') return { done: true, status: p.result };
    if (!p.status) {
      await kasa.fold();
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(ref)).data() || {};
        if (s.status) return;
        const st = await kasa.readTx(tx);
        const items = payeesOf(s);
        const total = items.reduce((a, it) => a + it.salary, 0);
        const at = now();
        if (total <= 0 || kasa.reserveTx(tx, st, total)) {
          tx.set(ref, { status: 'paying', total, paidSum: 0, resolved: 0, decidedAtMs: at, spendableAtDecision: st.spendable + total }, { merge: true });
        } else {
          tx.set(ref, { status: 'unpaid', total, resolved: 0, decidedAtMs: at, spendableAtDecision: st.spendable }, { merge: true });
          tx.set(debtRef(dayKey), {
            kind: 'maas',
            dayKey,
            workDay: addDayKey(dayKey, -1),
            total,
            items: items.filter((it) => it.salary > 0).map((it) => ({ uid: it.uid, role: it.role, name: it.name, amount: it.salary })),
            status: 'open',
            createdAtMs: at,
          });
        }
      });
      p = (await ref.get()).data();
    }
    const mode = p.status; // 'paying' | 'unpaid'
    for (const it of payeesOf(p)) await payPayrollItem(dayKey, p, mode, it).catch((err) => console.error('belediye payroll item', dayKey, it.uid, err?.message || err));
    // bitir: ödenemeyen (hesabı silinmiş vb.) ayrılan para serbest kalır; dağıtılamayan rüşvet devlete
    let fin = null;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(ref)).data() || {};
      if (s.status === 'done') {
        fin = s;
        return;
      }
      const n = payeesOf(s).length;
      if (Number(s.resolved || 0) < n) return; // bir kısmı hata verdi → sonraki turda devam
      const at = now();
      if (s.status === 'paying') kasa.releaseTx(tx, Math.max(0, Number(s.total || 0) - Number(s.paidSum || 0)));
      const bribeTotal = Math.max(0, Number(s.police?.bribe?.total || 0));
      const bribeLeft = s.police?.bribe?.policeCount > 0 ? Math.max(0, bribeTotal - Number(s.bribePaid || 0)) : 0;
      if (bribeLeft > 0) stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'rusvet_sahipsiz', amount: bribeLeft, atMs: at, dayKey });
      fin = { ...s, status: 'done', result: s.status };
      tx.set(ref, { status: 'done', result: s.status, finishedAtMs: at, bribeLeftover: bribeLeft }, { merge: true });
    });
    if (!fin || fin.status !== 'done') return { partial: true };
    // bugünün maaşları ödendiyse eski maaş borçları (en yeni günden başlayarak, yettiği kadar)
    const paidOld = [];
    if (fin.result === 'paying') {
      const open = await openSalaryDebts();
      for (const d of open) {
        if (d.id === dayKey) continue;
        const r = await payDebt(null, { debtId: d.id, auto: true }).catch((err) => ({ ok: false, error: err?.message }));
        if (!r?.ok) break;
        paidOld.push(d.id);
      }
    }
    await publicRef.set({ payroll: { dayKey, paid: fin.result === 'paying', total: Number(fin.total || 0), paidOld, atMs: now() } }, { merge: true });
    return { done: true, status: fin.result, paidOld };
  }

  async function payPayrollItem(dayKey, p, mode, it) {
    const doneRef = payrollRef(dayKey).collection('done').doc(it.key);
    const markRef = db.collection('roleSalaryMarks').doc(`${dayKey}_${it.uid}`);
    const uRef = userRef(it.uid);
    const worldId = p.police?.worldId || null;
    const recRef = it.role === 'polis' && worldId && it.rid ? db.doc(`gangWorlds/${worldId}/intelRecords/${it.rid}`) : null;
    await db.runTransaction(async (tx) => {
      const [done, mark, us, st] = await Promise.all([tx.get(doneRef), tx.get(markRef), tx.get(uRef), mode === 'paying' ? kasa.readTx(tx) : Promise.resolve(null)]);
      if (done.exists) return;
      const at = now();
      const pr = payrollRef(dayKey);
      const salaryDue = mode === 'paying' ? it.salary : 0;
      const dup = mark.exists && mark.data()?.role !== it.role;
      if (!us.exists || dup) {
        // ödenemedi (hesap yok / bu gece başka görevden maaş aldı) — ayrılan para bırakılır (bitişte)
        tx.set(doneRef, { atMs: at, skipped: dup ? 'other_role' : 'no_user' });
        tx.set(pr, { resolved: inc(1) }, { merge: true });
        return;
      }
      const bribe = it.bribe || 0;
      const amount = salaryDue + bribe;
      let debtNote = '';
      if (amount > 0) {
        const { goldDelta, debtDelta } = splitIncomeForDebt(us.data()?.debtToState, amount);
        tx.update(uRef, { gold: inc(goldDelta), debtToState: inc(debtDelta), goldTag: goldTag(it.role === 'polis' ? 'polis' : it.role === 'imam' ? 'imam' : 'belediyeMaas') });
        debtNote = debtDelta < 0 ? ` (${fmt(-debtDelta)} altını devlete olan borcuna gitti)` : '';
      }
      if (salaryDue > 0) {
        kasa.spendTx(tx, st, { cat: ROLE_CAT[it.role], amount: salaryDue, atMs: at, dayKey, fromReserved: true });
        const what = it.role === 'polis' ? (bribe > 0 ? `${fmt(salaryDue)} maaş + ${fmt(bribe)} rüşvet = ${fmt(amount)} altın hesabına aktarıldı — Polis · ${it.name}.` : `${fmt(salaryDue)} altın maaş hesabına aktarıldı — Polis · ${it.name}.`) : it.role === 'imam' ? `İmam maaşın yattı: ${fmt(salaryDue)} altın.` : `Belediye maaşın yattı: ${fmt(salaryDue)} altın — ${it.name}.`;
        smsTo(tx, it.uid, `💼 ${what}${debtNote}`, `${it.role}_salary`);
      } else if (mode !== 'paying' && it.salary > 0) {
        smsTo(tx, it.uid, `⚠️ Belediye kasasında yeterli para olmadığı için bu gecenin maaşı (${fmt(it.salary)} altın) ödenemedi. Borç olarak yazıldı — kasaya para girince hesabına yatacak.${bribe > 0 ? ` Rüşvet payın (${fmt(bribe)} altın) hesabına aktarıldı.${debtNote}` : ''}`, `${it.role}_salary_unpaid`);
      } else if (bribe > 0) {
        smsTo(tx, it.uid, `💼 Rüşvet payın (${fmt(bribe)} altın) hesabına aktarıldı.${debtNote}`, 'polis_bribe');
      }
      if (recRef) tx.set(recRef, { rosterId: it.rid, ...(salaryDue ? { salaryTotal: inc(salaryDue) } : {}), ...(bribe ? { bribeTotal: inc(bribe) } : {}), lastSalaryDay: dayKey }, { merge: true });
      if (!mark.exists) tx.set(markRef, { role: it.role, amount: salaryDue, bribe, unpaid: mode !== 'paying', atMs: at });
      tx.set(doneRef, { atMs: at, salary: salaryDue, bribe });
      tx.set(pr, { resolved: inc(1), ...(salaryDue ? { paidSum: inc(salaryDue) } : {}), ...(bribe ? { bribePaid: inc(bribe) } : {}) }, { merge: true });
    });
  }

  async function openSalaryDebts() {
    const snap = await db.collection('belediyeDebts').where('status', 'in', ['open', 'paying']).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => d.kind === 'maas')
      .sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0));
  }

  // Bir günün maaş borcunun TAMAMI (elle — başkan / yardımcı — ya da gece otomatik)
  async function payDebt(uid, { debtId, auto = false }) {
    const ref = debtRef(String(debtId || ''));
    let byName = auto ? 'Gece otomatik' : '';
    await kasa.liveFresh(auto ? 10 * 60 * 1000 : 15 * 1000);
    let started = false;
    await db.runTransaction(async (tx) => {
      const reads = [tx.get(ref), kasa.readTx(tx)];
      if (!auto) reads.push(tx.get(mainRef), tx.get(userRef(uid)));
      const [ds, st, ms, me] = await Promise.all(reads);
      const d = ds.data();
      if (!d || d.kind !== 'maas') fail('not-found', 'Borç bulunamadı.');
      if (!auto) {
        const seat = seatOfUid(ms.data() || {}, uid);
        if (!canPayDebts(seat)) fail('permission-denied', 'Borçları sadece başkan ve yardımcılar ödeyebilir.');
        byName = me.data()?.displayName || 'Oyuncu';
      }
      if (d.status === 'paid') fail('failed-precondition', 'Bu borç zaten ödendi.');
      if (d.status === 'paying') {
        started = true; // yarıda kalmış ödeme — kaldığı yerden
        return;
      }
      if (!kasa.reserveTx(tx, st, d.total)) fail('failed-precondition', `Kasada yeterli para yok (gereken ${fmt(d.total)}, kasa ${fmt(Math.max(0, st.spendable))} altın).`);
      tx.set(ref, { status: 'paying', payingAtMs: now(), paidBy: byName, resolved: 0, paidSum: 0 }, { merge: true });
      started = true;
    });
    if (!started) return { ok: false };
    const d = (await ref.get()).data();
    for (const it of d.items || []) await payDebtItem(ref, d, it).catch((err) => console.error('belediye debt item', ref.id, it.uid, err?.message || err));
    let ok = false;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(ref)).data() || {};
      if (s.status === 'paid') {
        ok = true;
        return;
      }
      if (Number(s.resolved || 0) < (s.items || []).length) return;
      kasa.releaseTx(tx, Math.max(0, Number(s.total || 0) - Number(s.paidSum || 0)));
      tx.set(ref, { status: 'paid', paidAtMs: now() }, { merge: true });
      ok = true;
    });
    return { ok, debtId: ref.id };
  }

  async function payDebtItem(ref, d, it) {
    const doneRef = ref.collection('paid').doc(it.uid);
    await db.runTransaction(async (tx) => {
      const [done, us, st] = await Promise.all([tx.get(doneRef), tx.get(userRef(it.uid)), kasa.readTx(tx)]);
      if (done.exists) return;
      const at = now();
      if (!us.exists) {
        tx.set(doneRef, { atMs: at, skipped: 'no_user' });
        tx.set(ref, { resolved: inc(1) }, { merge: true });
        return;
      }
      const { goldDelta, debtDelta } = splitIncomeForDebt(us.data()?.debtToState, it.amount);
      tx.update(userRef(it.uid), { gold: inc(goldDelta), debtToState: inc(debtDelta), goldTag: goldTag('belediyeMaas') });
      kasa.spendTx(tx, st, { cat: 'borc_maas', amount: it.amount, atMs: at, fromReserved: true });
      smsTo(tx, it.uid, `💼 ${dayLabel(d.workDay || d.dayKey)} gününün ödenemeyen maaşı (${fmt(it.amount)} altın) hesabına yattı.${debtDelta < 0 ? ` (${fmt(-debtDelta)} altını devlete olan borcuna gitti)` : ''}`, 'salary_debt_paid');
      tx.set(doneRef, { atMs: at, amount: it.amount });
      tx.set(ref, { resolved: inc(1), paidSum: inc(it.amount) }, { merge: true });
    });
  }

  async function payOther(uid, { amount }) {
    const [ms, me] = await Promise.all([mainRef.get(), userRef(uid).get()]);
    if (!canPayDebts(seatOfUid(ms.data() || {}, uid))) fail('permission-denied', 'Borçları sadece başkan ve yardımcılar ödeyebilir.');
    const r = await kasa.payOther({ amount, byName: me.data()?.displayName || '' });
    if (!r.ok) fail('failed-precondition', r.error || 'Ödenemedi.');
    return r;
  }

  // ===========================================================================
  // Panel (kadro) — bekleyen ayarlar, canlı kasa, borçlar
  // ===========================================================================
  async function panel(uid) {
    const main = (await mainRef.get()).data() || {};
    const seat = seatOfUid(main, uid);
    if (!seat) fail('permission-denied', 'Belediye kadrosunda değilsin.');
    const day = today();
    // v127: bugünün analizi (gece 00:00'da tahsil edilen fabrika vergisinin listesi bugüne yazılır)
    const [ps, rs, st, debts, dr, an] = await Promise.all([pendingRef.get(), ratesRef.get(), kasa.status(), openSalaryDebts(), draftRef.get(), db.doc(`belediyeAnalysis/${day}`).get()]);
    const pending = ps.data() || {};
    const ratesDoc = rs.data() || {};
    const cur = resolveRates(ratesDoc, day, pending);
    const tomorrow = addDayKey(day, 1);
    const next = pending.nextDay === tomorrow && pending.next ? resolveRates({ byDay: { [tomorrow]: pending.next } }, tomorrow) : cur;
    return {
      seat,
      dayKey: day,
      cur,
      next,
      nextBy: pending.nextDay === tomorrow ? pending.by || {} : {},
      kasa: { spendable: st.spendable, reserved: st.reserved, atMs: st.atMs, today: st.today },
      analysisToday: an.exists ? an.data() : null,
      gazete: dr.exists ? dr.data() : null,
      debts: {
        maas: debts.map((d) => ({ id: d.id, dayKey: d.dayKey, workDay: d.workDay, total: d.total, status: d.status, count: (d.items || []).length })),
        other: st.other,
      },
    };
  }

  // ===========================================================================
  // Gece işleri (dailyReset): rapor + faiz + davet temizliği
  // ===========================================================================
  async function expireInvitesNow() {
    await db.runTransaction(async (tx) => {
      const ms = await tx.get(mainRef);
      const main = ms.data() || {};
      const { invites, expired } = splitInvites(main);
      if (!expired.length) return;
      for (const inv of expired) if (inv.byUid) smsTo(tx, inv.byUid, `🏛️ ${inv.name || 'Oyuncu'} 24 saat içinde cevap vermediği için ${SEATS[inv.seat]?.title || ''} daveti düştü.`);
      writeMain(tx, main, { invites });
      clearExpired(tx, expired);
    });
  }

  // Biten günün raporu (devlet defteri günü kapandıktan SONRA). extra: index.js'in
  // topladığı analiz (fabrika listesi, işletme sayıları, polis, imam, içerik üreticileri)
  async function nightlyReport(dayKey, extra = {}) {
    const y = addDayKey(dayKey, -1);
    const pub = (await publicRef.get()).data() || {};
    if (pub.reportDay === y && pub.reportBuiltFor === dayKey) return { skipped: true };
    const [sd, an, dn] = await Promise.all([db.doc(`stateDays/${y}`).get(), db.doc(`belediyeAnalysis/${y}`).get(), donationsRef(y).get()]);
    const day = sd.data() || { in: {}, out: {}, stat: {} };
    const rep = ministryReport(day);
    const st = await kasa.status().catch(() => null);
    const debts = await openSalaryDebts().catch(() => []);
    const report = {
      dayKey: y,
      ...rep,
      stat: day.stat || {},
      analysis: { ...(an.data() || {}), ...extra },
      donations: { total: Number(dn.data()?.total || 0), top: dn.data()?.top || [] },
      kasa: st ? st.spendable : null,
      debts: { maasCount: debts.length, maasTotal: debts.reduce((a, d) => a + Number(d.total || 0), 0), other: st ? st.other.soygun + st.other.eski : 0 },
      builtAtMs: now(),
    };
    await db.doc(`belediyeDays/${y}`).set({ report }, { merge: true });
    await publicRef.set({ reportDay: y, reportBuiltFor: dayKey, report, updatedAtMs: now() }, { merge: true });
    return { ok: true };
  }

  async function nightly(dayKey, { step, extra } = {}) {
    if (step === 'roll') return nightlyRoll(dayKey);
    if (step === 'payrollSnapshot') {
      await snapshotStaffAndImam(dayKey);
      return tryRunPayroll(dayKey);
    }
    if (step === 'report') {
      await expireInvitesNow().catch((err) => console.error('belediye invites', err?.message || err));
      await kasa.applyInterest(dayKey);
      await kasa.fold();
      // yarıda kalmış maaş borcu ödemeleri
      for (const d of await openSalaryDebts()) if (d.status === 'paying') await payDebt(null, { debtId: d.id, auto: true }).catch(() => {});
      const rep = await nightlyReport(dayKey, extra);
      await buildGazete(dayKey).catch((err) => console.error('belediye gazete', err?.message || err));
      await sikayetTemizle().catch((err) => console.error('belediye şikâyet temizliği', err?.message || err));
      return rep;
    }
    return null;
  }

  // ===========================================================================
  // v127 GAZETE — başkan / yardımcının yazısı (tek taslak, 00:00'da basılır)
  // ===========================================================================
  async function gazeteYaz(uid, { text }) {
    const msg = String(text || '')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, BELEDIYE.GAZETE_MAX);
    if (msg.length < BELEDIYE.GAZETE_MIN) fail('invalid-argument', `Yazı en az ${BELEDIYE.GAZETE_MIN} karakter olmalı.`);
    await assertCanSpeak(uid, { text: msg });
    let out = null;
    await db.runTransaction(async (tx) => {
      const [ms, me, dr] = await Promise.all([tx.get(mainRef), tx.get(userRef(uid)), tx.get(draftRef)]);
      const main = ms.data() || {};
      const seat = seatOfUid(main, uid);
      if (!BELEDIYE.GAZETE_SEATS.includes(seat)) fail('permission-denied', 'Gazeteye sadece başkan ve başkan yardımcıları yazabilir.');
      const name = me.data()?.displayName || 'Oyuncu';
      const prev = dr.data();
      out = { text: msg, byUid: uid, byName: name, bySeat: seat, byTitle: SEATS[seat].title, atMs: now() };
      tx.set(draftRef, out);
      const replaced = prev?.text && prev.byUid !== uid ? ` (${prev.byName} yazısının yerine)` : '';
      writeMain(tx, main, { log: logLine(main, `📰 ${name} yarının gazetesine yazı yazdı${replaced}`) });
    });
    return { ok: true, draft: out };
  }

  async function gazeteSil(uid) {
    await db.runTransaction(async (tx) => {
      const [ms, dr] = await Promise.all([tx.get(mainRef), tx.get(draftRef)]);
      if (!BELEDIYE.GAZETE_SEATS.includes(seatOfUid(ms.data() || {}, uid))) fail('permission-denied', 'Gazete yazısını sadece başkan ve başkan yardımcıları silebilir.');
      if (dr.exists) tx.delete(draftRef);
    });
    return { ok: true };
  }

  // 00:00 — günün sayısı (gece raporundan SONRA). İdempotent: belge varsa basılmaz.
  async function buildGazete(dayKey, rnd = Math.random) {
    const ref = gazeteRef(dayKey);
    if ((await ref.get()).exists) return { skipped: true };
    const [ms, rs, ps, pubS, govS] = await Promise.all([mainRef.get(), ratesRef.get(), pendingRef.get(), publicRef.get(), govRef.get()]);
    const main = ms.data() || {};
    const ratesDoc = rs.data() || {};
    const pub = pubS.data() || {};
    const bsk = main.seats?.bsk?.uid ? main.seats.bsk : null;
    let gov = govS.data() || null;
    // başkan değiştiyse "göreve gelince" seviyesi: göreve başladığı günün oranları
    if (bsk && gov?.mayorUid !== bsk.uid) {
      const since = rateDayKey(Number(bsk.sinceMs || now()));
      gov = { mayorUid: bsk.uid, mayorName: bsk.name, sinceDay: since, rates: resolveRates(ratesDoc, since) };
      await govRef.set({ ...gov, atMs: now() });
    }
    const cur = resolveRates(ratesDoc, dayKey, ps.data());
    const prev = resolveRates(ratesDoc, addDayKey(dayKey, -1));
    const payrollUnpaid = pub.payroll?.dayKey === dayKey && pub.payroll.paid === false;
    // v127 (2): sade gazete — bir manşet + birkaç önemli haber (ayrıntı belediyede)
    const { headline, items } = gazeteNews({ prev, cur, payrollUnpaid, rnd });
    // halkın sesi: yayınlanmamış, en çok beğenilen (7 gün içindeki) şikâyet
    let complaint = null;
    try {
      const top = await sikayetCol.orderBy('likeCount', 'desc').limit(15).get();
      const minMs = now() - BELEDIYE.SIKAYET_TTL_MS;
      const d = top.docs.find((x) => {
        const v = x.data();
        return !v.featuredDay && !v.hidden && Number(v.likeCount || 0) > 0 && Number(v.createdAtMs || 0) >= minMs;
      });
      if (d) complaint = { id: d.id, text: d.data().text, name: d.data().name || 'Bir vatandaş', likes: Number(d.data().likeCount || 0) };
    } catch (err) {
      console.error('gazete şikâyet', err?.message || err);
    }
    let printed = false;
    await db.runTransaction(async (tx) => {
      const [ex, dr] = await Promise.all([tx.get(ref), tx.get(draftRef)]);
      if (ex.exists) return;
      const draft = dr.data();
      const article = draft?.text ? { text: draft.text, byName: draft.byName, byTitle: draft.byTitle, bySeat: draft.bySeat } : null;
      tx.set(ref, {
        dayKey,
        v: 2,
        headline,
        items,
        govSince: gov?.sinceDay || null,
        mayor: bsk ? { name: bsk.name, avatar: bsk.avatar || null } : null,
        article,
        complaint: complaint ? { text: complaint.text, name: complaint.name, likes: complaint.likes } : null,
        payrollUnpaid,
        builtAtMs: now(),
      });
      if (draft) tx.delete(draftRef);
      if (complaint) tx.update(sikayetCol.doc(complaint.id), { featuredDay: dayKey });
      printed = true;
    });
    return { ok: printed, items: items.length };
  }

  // ===========================================================================
  // v127 ŞİKÂYET KUTUSU — herkes yazar, beğenir; 7 gün sonra silinir
  // ===========================================================================
  async function sikayet(uid, { text }) {
    const msg = String(text || '').replace(/\s+/g, ' ').trim().slice(0, BELEDIYE.SIKAYET_MAX);
    if (msg.length < BELEDIYE.SIKAYET_MIN) fail('invalid-argument', `Şikâyet en az ${BELEDIYE.SIKAYET_MIN} karakter olmalı.`);
    await assertCanSpeak(uid, { text: msg });
    const day = today();
    const limRef = db.collection('belediyeSikayetLimit').doc(uid);
    const ref = sikayetCol.doc();
    await db.runTransaction(async (tx) => {
      const [us, lim] = await Promise.all([tx.get(userRef(uid)), tx.get(limRef)]);
      const u = us.data();
      if (!u) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const n = lim.data()?.day === day ? Number(lim.data()?.n || 0) : 0;
      if (n >= BELEDIYE.SIKAYET_PER_DAY) fail('resource-exhausted', `Günde en fazla ${BELEDIYE.SIKAYET_PER_DAY} şikâyet yazabilirsin.`);
      tx.set(limRef, { day, n: n + 1 });
      const t = now();
      tx.set(ref, { uid, name: u.displayName || 'Oyuncu', avatar: u.avatar || null, text: msg, createdAtMs: t, expiresAtMs: t + BELEDIYE.SIKAYET_TTL_MS, likeCount: 0, likes: {} });
    });
    return { ok: true, id: ref.id };
  }

  async function sikayetBegen(uid, { id }) {
    const ref = sikayetCol.doc(String(id || ''));
    let liked = false;
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const d = s.data();
      if (!d || Number(d.expiresAtMs || 0) <= now()) fail('not-found', 'Şikâyet bulunamadı.');
      if (d.uid === uid) fail('failed-precondition', 'Kendi şikâyetini beğenemezsin.');
      liked = !d.likes?.[uid];
      tx.update(ref, { [`likes.${uid}`]: liked ? true : FieldValue.delete(), likeCount: inc(liked ? 1 : -1) });
    });
    return { ok: true, liked };
  }

  async function sikayetSil(uid, { id }) {
    const ref = sikayetCol.doc(String(id || ''));
    const s = await ref.get();
    if (!s.exists) return { ok: true };
    // halkın sesi: belediye kadrosu şikâyet silemez (uygunsuz olanlar Bildir ile moderasyona)
    if (s.data().uid !== uid) fail('permission-denied', 'Sadece kendi şikâyetini silebilirsin.');
    await ref.delete();
    return { ok: true };
  }

  async function sikayetTemizle() {
    const snap = await sikayetCol.where('createdAtMs', '<', now() - BELEDIYE.SIKAYET_TTL_MS).limit(400).get();
    if (!snap.size) return 0;
    const b = db.batch();
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    return snap.size;
  }

  // ===========================================================================
  // v127 AYRINTILI DEFTER (Belediye › Başkanlık — kadro): geçmiş + bugün
  // ===========================================================================
  async function defter(uid) {
    const main = (await mainRef.get()).data() || {};
    if (!seatOfUid(main, uid)) {
      const u = (await userRef(uid).get()).data();
      if (!(await isAdmin(uid, u))) fail('permission-denied', 'Defteri sadece belediye kadrosu görebilir.');
    }
    await kasa.liveFresh(10 * 60 * 1000).catch(() => null);
    const day = today();
    const [m, l, days] = await Promise.all([db.doc('stateTreasury/main').get(), kasa.liveRef.get(), db.collection('stateDays').where('dayKey', '>=', addDayKey(day, -29)).get()]);
    const md = m.data() || {};
    const pickDay = (d) => ({ dayKey: d.dayKey, in: d.in || {}, out: d.out || {}, inTotal: Number(d.inTotal || 0), outTotal: Number(d.outTotal || 0) });
    return {
      today: day,
      main: { totals: md.totals || { in: {}, out: {}, inTotal: 0, outTotal: 0 }, closedThrough: md.closedThrough || '', firstDayKey: md.firstDayKey || null },
      live: { today: l.data()?.today ? pickDay(l.data().today) : null, atMs: Number(l.data()?.atMs || 0) },
      days: days.docs.map((d) => pickDay(d.data())),
    };
  }

  // ===========================================================================
  // Callable
  // ===========================================================================
  const OPS = {
    panel: (uid) => panel(uid),
    claimMayor: (uid) => claimMayor(uid),
    invite: (uid, d) => invite(uid, d),
    cancelInvite: (uid, d) => cancelInvite(uid, d),
    respondInvite: (uid, d) => respondInvite(uid, d),
    fire: (uid, d) => fire(uid, d),
    resign: (uid) => resign(uid),
    setPerms: (uid, d) => setPerms(uid, d),
    setRate: (uid, d) => setRate(uid, d),
    fireImam: (uid, d) => fireImam(uid, d),
    donate: (uid, d) => donate(uid, d),
    payDebt: (uid, d) => payDebt(uid, { debtId: d?.debtId }),
    payOther: (uid, d) => payOther(uid, d),
    chat: (uid, d) => chat(uid, d),
    gazeteYaz: (uid, d) => gazeteYaz(uid, d),
    gazeteSil: (uid) => gazeteSil(uid),
    sikayet: (uid, d) => sikayet(uid, d),
    sikayetBegen: (uid, d) => sikayetBegen(uid, d),
    sikayetSil: (uid, d) => sikayetSil(uid, d),
    defter: (uid) => defter(uid),
  };
  async function handle(uid, data) {
    const op = String(data?.op || '');
    const fn = OPS[op];
    if (!fn) fail('invalid-argument', 'Geçersiz işlem.');
    return fn(uid, data || {});
  }
  const belediyeAction = onCall
    ? onCall(async (request) => {
        const uid = requireAuth(request);
        return handle(uid, request.data || {});
      })
    : null;

  return {
    belediyeAction,
    handle,
    kasa,
    nightly,
    nightlyRoll,
    nightlyReport,
    buildGazete,
    sikayetTemizle,
    snapshotStaffAndImam,
    setPolicePayroll,
    tryRunPayroll,
    payDebt,
    openSalaryDebts,
    gangDonationReadTx,
    gangDonationWriteTx,
    spendOrDebt: (args) => kasa.spendOrDebt(args),
    kasaReadTx: (tx) => kasa.readTx(tx),
    kasaSpendTx: (tx, st, args) => kasa.spendTx(tx, st, args),
    policeSalary,
    ratesFor: (d) => (ratesApi?.ratesFor ? ratesApi.ratesFor(d) : resolveRates(null, d)),
    ratesOfMinistry,
    MINISTRIES,
  };
}
