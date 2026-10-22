// =============================================================================
// KAMU GÖREVİ: POLİS TEŞKİLATI (v109 — İstihbarat ile Polis birleşti; kodda
// teşkilat hâlâ "intel"). İmam: functions/index.js.
//   • Maaşlar: her gece 00:00'da rütbeye göre DEVLET kasasından, SMS ile
//     (bkz. config SALARIES). Rütbe, biten günün rütbesidir (yeni rütbeler
//     maaştan SONRA hesaplanır). Karakol rüşvetleri o an teşkilatta olan
//     polislere eşit bölünür ve maaşla birlikte yatar (tek SMS).
//   • 10 gün oyuna girmeyen polis görevden alınır (24 saat yeniden başvuramaz).
//     "Oyuna giriş": users/{uid}/private/meta.lastSeenAtMs (functions/index.js
//     initializePlayer her açılışta yazar) + teşkilattaki son savaş/sohbet.
//     Kural yayına girdiği günden önce kimse "pasif" sayılmaz (roleInactivityFromMs).
//   • Meslek ↔ teşkilat uzlaştırması (canlı dünya, 00:00): profession 'polis'
//     olup teşkilatta olmayanın polisliği alınır; teşkilatta olup mesleği
//     'polis' olmayanın mesleği yazılır. (Normalde katılım / ayrılık ikisini
//     aynı işlemde değiştirir — bu bir güvenlik ağıdır.)
//   • Tek seferlik v109 geçişi (canlı): tüm polisler teşkilata (0 prestijle,
//     otomatik kod adıyla), tüm teşkilat üyeleri polisliğe; eski usul bekleyen
//     polislik başvuruları iptal, bekleyen istifalar işlenir.
//   • v108'deki Belediye (rütbeliler ortak) sohbeti kapatıldı.
// =============================================================================
import { INTEL, SALARIES, ROLE_INACTIVE_DAYS, RANK_LABELS, BRIBE_COST } from '../config.js';
import { addDays, midnightMsOf } from '../time.js';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
// Otomatik kod adları (tek seferlik geçişte teşkilata alınan polisler için)
const AUTO_A = ['Mavi', 'Gece', 'Çelik', 'Demir', 'Sessiz', 'Kara', 'Yıldız', 'Kartal', 'Şimşek', 'Gölge', 'Kuzey', 'Poyraz', 'Bozkurt', 'Atmaca', 'Doğan', 'Şahin'];
const AUTO_B = ['Devriye', 'Nöbet', 'Rozet', 'Siren', 'Kalkan', 'Ekip', 'Takip', 'Sancak', 'Pusula', 'Fener'];
export function autoCodeName(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = AUTO_A[h % AUTO_A.length];
  const b = AUTO_B[Math.floor(h / AUTO_A.length) % AUTO_B.length];
  return `${a} ${b} ${(h % 90) + 10}`.slice(0, INTEL.CODENAME_MAX);
}

export function createRoleActions(core, { intel }) {
  const { db, FV, readMembership, notify } = core;

  // ---------------------------------------------------------------------------
  // Maaşlar (00:00). v108.1:
  //   • 00:00'da hangi görevdeysen (ve rütben neyse) onun maaşı: 00:00'dan
  //     SONRA katılan bu gece almaz (joinedAtMs < gece yarısı).
  //   • Oyuncu başına gecede TEK maaş (roleSalaryMarks/{gün}_{oyuncu}; imam
  //     maaşı da aynı işareti kullanır).
  //   • Dünkü Karakol rüşvetleri o an polis olanlara eşit bölünür ve maaşla
  //     birlikte yatar — tek SMS: "X maaş + Y rüşvet hesabına aktarıldı".
  // İdempotent: requests/salary_intel_{rosterId}_{gün} + oyuncu işareti.
  // ---------------------------------------------------------------------------
  // Gecenin rüşvet dağıtımı — bir kez hesaplanır, tekrar çalışmada aynı rakamlar
  async function bribePayoutFor(ctx, eligibleCount) {
    const day = addDays(ctx.dateKey, -1); // biten gün
    const ref = ctx.ref.bribePayout(ctx.dateKey);
    return db.runTransaction(async (tx) => {
      const [cur, pool] = await Promise.all([tx.get(ref), tx.get(ctx.ref.bribePool(day))]);
      if (cur.exists) return cur.data();
      const bribeCount = Math.max(0, Math.floor(Number(pool.data()?.bribeCount || 0)));
      const total = bribeCount * BRIBE_COST;
      const perShare = eligibleCount > 0 ? Math.floor(total / eligibleCount) : 0;
      const toState = eligibleCount > 0 ? 0 : total; // hiç polis yoksa rüşvet devlete
      const out = { day, bribeCount, total, policeCount: eligibleCount, perShare, toState, atMs: ctx.now };
      if (toState > 0) core.stateTx(tx, ctx, 'in', 'rusvet_sahipsiz', toState);
      tx.set(ref, out);
      return out;
    });
  }
  async function payOneSalary(ctx, rosterId, { bribeShare = 0 } = {}) {
    const rosterRef = ctx.ref.roster(rosterId);
    const linkRef = intel.linkRef(ctx, rosterId);
    const recRef = ctx.ref.intelRecord(rosterId);
    const midnight = midnightMsOf(ctx.dateKey);
    return db.runTransaction(async (tx) => {
      const markRef = ctx.ref.request(`salary_intel_${rosterId}_${ctx.dateKey}`);
      const [mark, rs, link] = await Promise.all([tx.get(markRef), tx.get(rosterRef), tx.get(linkRef)]);
      if (mark.exists || !rs.exists) return { skipped: true };
      if (Number(rs.data().joinedAtMs || 0) >= midnight) return { skipped: 'joined_after_midnight' };
      const actorId = link.data()?.actorId;
      if (!actorId) return { skipped: 'no_link' };
      const actorMarkRef = ctx.ref.roleSalaryMark(actorId, ctx.dateKey);
      const actorMark = await tx.get(actorMarkRef);
      if (actorMark.exists) return { skipped: 'already_paid_today' };
      const rank = rs.data().rank || 'muhbir';
      const salary = Number(SALARIES[rank] || 0);
      const bribe = Math.max(0, Math.floor(bribeShare));
      const amount = salary + bribe;
      if (!(amount > 0)) return { skipped: 'no_salary' };
      const wallet = await core.readWallet(tx, ctx, actorId).catch(() => null);
      if (!wallet) return { skipped: 'no_wallet' };
      const { goldDelta, debtDelta } = core.creditGold(tx, ctx, actorId, wallet, amount);
      if (salary > 0) core.stateTx(tx, ctx, 'out', 'maas_polis', salary);
      tx.set(recRef, { rosterId, salaryTotal: FV.increment(salary), ...(bribe ? { bribeTotal: FV.increment(bribe) } : {}), lastSalaryDay: ctx.dateKey }, { merge: true });
      tx.set(markRef, { atMs: ctx.now, amount, salary, bribe, rank });
      tx.set(actorMarkRef, { role: 'intel', rosterId, salary, bribe, atMs: ctx.now });
      if (salary > 0) core.ledger(tx, ctx, { type: 'salary_intel', amount: salary, from: { kind: 'state', id: 'main' }, to: { kind: 'player', id: actorId }, refId: rosterId, actorId: 'system' });
      if (bribe > 0) core.ledger(tx, ctx, { type: 'police_bribe_share', amount: bribe, from: { kind: 'bribePool', id: addDays(ctx.dateKey, -1) }, to: { kind: 'player', id: actorId }, refId: rosterId, actorId: 'system' });
      const debtNote = debtDelta < 0 ? ` (${fmt(-debtDelta)} altını devlete olan borcuna gitti)` : '';
      const parts = bribe > 0 ? `${fmt(salary)} maaş + ${fmt(bribe)} rüşvet = ${fmt(amount)} altın` : `${fmt(salary)} altın maaş`;
      notify(tx, ctx, actorId, `💼 ${parts} hesabına aktarıldı — Polis · ${RANK_LABELS[rank] || rank}.${debtNote}`, 'salary');
      return { paid: amount, salary, bribe, toWallet: goldDelta };
    });
  }
  async function paySalaries(ctx, safe) {
    const out = { intel: 0, bribe: 0 };
    const midnight = midnightMsOf(ctx.dateKey);
    const roster = await ctx.ref.rosterCol().get();
    const eligible = roster.docs.filter((d) => Number(d.data().joinedAtMs || 0) < midnight);
    const payout = (await safe(ctx, 'bribe-payout', () => bribePayoutFor(ctx, eligible.length))) || { perShare: 0 };
    if (!ctx.isTest && payout.perShare > 0) {
      // Polis Kitapçığı: son 10 günün ortalama rüşvet payı
      await safe(ctx, 'bribe-stats', async () => {
        const ref = db.doc('gameStats/policeSalaryAvg');
        const prev = (await ref.get()).data()?.last10Payouts || [];
        const list = [...prev, payout.perShare].slice(-10);
        await ref.set({ last10Payouts: list, avgDailyPayout: Math.round(list.reduce((a, b) => a + b, 0) / list.length) }, { merge: true });
      });
    }
    for (const d of roster.docs) {
      await safe(ctx, `salary-intel:${d.id}`, async () => {
        const r = await payOneSalary(ctx, d.id, { bribeShare: payout.perShare || 0 });
        if (r?.paid) {
          out.intel += r.salary;
          out.bribe += r.bribe || 0;
        }
      });
    }
    // Dağıtılamayan rüşvet payları (ör. o gece başka görevden maaş almış, hesabı
    // silinmiş) + bölme artığı devlet kasasına — bir kez (bribePayouts.leftoverAtMs)
    if (payout.total > 0 && payout.policeCount > 0) {
      await safe(ctx, 'bribe-leftover', async () => {
        const paidIds = [];
        for (const d of eligible) {
          const m = (await ctx.ref.request(`salary_intel_${d.id}_${ctx.dateKey}`).get()).data();
          if (Number(m?.bribe || 0) > 0) paidIds.push(d.id);
        }
        await db.runTransaction(async (tx) => {
          const ref = ctx.ref.bribePayout(ctx.dateKey);
          const cur = (await tx.get(ref)).data();
          if (!cur || cur.leftoverAtMs) return;
          const leftover = Math.max(0, Number(cur.total || 0) - Number(cur.perShare || 0) * paidIds.length);
          if (leftover > 0) core.stateTx(tx, ctx, 'in', 'rusvet_sahipsiz', leftover);
          tx.update(ref, { leftoverAtMs: ctx.now, leftover, paidCount: paidIds.length });
        });
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // 10 gün pasiflik
  // ---------------------------------------------------------------------------
  async function lastSeenOf(ctx, actorId) {
    if (ctx.isTest) return Number((await ctx.ref.player(actorId).get()).data()?.lastSeenAtMs || 0);
    return Number((await db.doc(`users/${actorId}/private/meta`).get()).data()?.lastSeenAtMs || 0);
  }
  async function processRoleInactivity(ctx, safe) {
    // kural başlangıcı: ilk çalıştığı an (öncesi için kimse pasif sayılmaz)
    let fromMs = Number(ctx.world?.roleInactivityFromMs || 0);
    if (!fromMs) {
      fromMs = ctx.now;
      await ctx.ref.world().set({ roleInactivityFromMs: fromMs }, { merge: true });
      ctx.world = { ...(ctx.world || {}), roleInactivityFromMs: fromMs };
    }
    const limitMs = ROLE_INACTIVE_DAYS * 86_400_000;
    const removed = { intel: 0 };
    const snap = await ctx.ref.rosterCol().get();
    for (const d of snap.docs) {
      const r = d.data();
      const base = Math.max(fromMs, Number(r.joinedAtMs || 0), Number(r.lastActiveAtMs || 0), Number(r.lastChatAtMs || 0));
      if (ctx.now - base < limitMs) continue;
      const link = (await intel.linkRef(ctx, d.id).get()).data();
      const actorId = link?.actorId || null;
      const seen = actorId ? await lastSeenOf(ctx, actorId) : 0;
      if (ctx.now - Math.max(base, seen) < limitMs) continue;
      await safe(ctx, `inactive-intel:${d.id}`, async () => {
        const text = `⏰ ${ROLE_INACTIVE_DAYS} gündür oyuna girmediğin için polislikten alındın. ${INTEL.REJOIN_COOLDOWN_MS / 3_600_000} saat sonra yeniden başvurabilirsin.`;
        await db.runTransaction(async (tx) => {
          const ms = actorId ? await readMembership(tx, ctx, actorId) : null;
          const rs = await tx.get(ctx.ref.roster(d.id));
          if (!rs.exists) return;
          if (!actorId || ms?.intelRosterId !== d.id) {
            tx.delete(ctx.ref.roster(d.id));
            tx.delete(intel.linkRef(ctx, d.id));
            tx.delete(ctx.ref.intelRecord(d.id));
            if (rs.data().codeName) tx.delete(ctx.ref.codeName(core.nameKeyOf(rs.data().codeName)));
            tx.set(ctx.ref.intel(), { memberCount: FV.increment(-1) }, { merge: true });
            return;
          }
          const plan = await intel.planIntelLeave(tx, ctx, ms, actorId);
          intel.applyIntelLeave(tx, ctx, plan, { actorId, notifyText: text });
          core.announceIntel(tx, ctx, '⏰', `${rs.data().codeName} ${ROLE_INACTIVE_DAYS} gündür oyuna girmediği için görevden alındı.`);
        });
        removed.intel += 1;
      });
    }
    return removed;
  }

  // ---------------------------------------------------------------------------
  // Meslek ↔ teşkilat uzlaştırması (sadece canlı dünya; 00:00 turunda)
  // ---------------------------------------------------------------------------
  function sms(tx, uid, text, type) {
    tx.set(db.collection(`users/${uid}/messages`).doc(), { text, createdAt: FV.serverTimestamp(), read: false, type });
  }
  async function reconcilePolice(ctx, safe) {
    if (ctx.isTest) return { skipped: 'test' };
    const out = { dropped: 0, set: 0 };
    // a) teşkilat üyesi ama mesleği 'polis' değil → polis yap
    const roster = await ctx.ref.rosterCol().get();
    const memberUids = new Set();
    for (const r of roster.docs) {
      const actorId = (await intel.linkRef(ctx, r.id).get()).data()?.actorId;
      if (!actorId) continue;
      memberUids.add(actorId);
      await safe(ctx, `police-set:${actorId}`, () =>
        db.runTransaction(async (tx) => {
          const [ms, user] = await Promise.all([readMembership(tx, ctx, actorId), intel.readPoliceUser(tx, ctx, actorId)]);
          if (ms.intelRosterId !== r.id || !user.data || user.data.profession === 'polis') return;
          intel.setPoliceProfession(tx, ctx, actorId, user, true);
          out.set += 1;
        })
      );
    }
    // b) mesleği 'polis' ama teşkilatta değil → polislikten al
    const users = await db.collection('users').where('profession', '==', 'polis').get();
    for (const u of users.docs) {
      if (memberUids.has(u.id)) continue;
      await safe(ctx, `police-drop:${u.id}`, () =>
        db.runTransaction(async (tx) => {
          const [ms, user] = await Promise.all([readMembership(tx, ctx, u.id), intel.readPoliceUser(tx, ctx, u.id)]);
          if (ms.intelRosterId || user.data?.profession !== 'polis') return;
          intel.setPoliceProfession(tx, ctx, u.id, user, false);
          sms(tx, u.id, '🚓 Polis Teşkilatında kaydın bulunamadığı için polislikten alındın. İstersen Karakol ya da Çeteler › Polis Teşkilatı üzerinden yeniden başvurabilirsin.', 'police_reconcile');
          out.dropped += 1;
        })
      );
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Tek seferlik v109 geçişi (canlı dünya). Bayrak: migrations/rolesV109.
  // Her adım işlem içinde ve tekrar çalıştırılabilir (idempotent); bayrak en
  // sonda yazılır — yarıda kesilirse bir sonraki turda kaldığı yerden sürer.
  // ---------------------------------------------------------------------------
  async function enrollMigratedPolice(ctx, uid) {
    return db.runTransaction(async (tx) => {
      const [ms, user, intelSnap, stateSnap] = await Promise.all([
        readMembership(tx, ctx, uid),
        intel.readPoliceUser(tx, ctx, uid),
        tx.get(ctx.ref.intel()),
        tx.get(ctx.ref.intelState()),
      ]);
      if (!user.data || user.data.profession !== 'polis') return { skipped: 'not_police' };
      if (ms.intelRosterId) return { skipped: 'member' };
      // Mafya Babası teşkilata giremez → polisliği alınır
      if (ms.gangRank === 'baba') {
        intel.setPoliceProfession(tx, ctx, uid, user, false);
        sms(tx, uid, '🏛️ İstihbarat ve Polis birleşti: Polis Teşkilatı. Mafya Babaları teşkilata giremediği için polislikten alındın. Çetenin başından ayrılırsan yeniden başvurabilirsin.', 'role_rule_v109');
        return { dropped: 'baba' };
      }
      // kod adı: boştakilerden ilki (deterministik adaylar)
      let pick = null;
      for (let i = 0; i < 8 && !pick; i++) {
        const c = autoCodeName(`${uid}_${i}`);
        const key = core.nameKeyOf(c);
        if (!(await tx.get(ctx.ref.codeName(key))).exists) pick = { codeName: c, key };
      }
      if (!pick) {
        const c = `Memur ${uid.slice(0, 6)}`.slice(0, INTEL.CODENAME_MAX);
        pick = { codeName: c, key: core.nameKeyOf(c) };
        // boş kod adı bulunamadı → hata: geçiş "bitti" sayılmaz, sonraki turda yeniden denenir
        if ((await tx.get(ctx.ref.codeName(pick.key))).exists) throw new Error(`v109: ${uid} için boş kod adı bulunamadı`);
      }
      // bekleyen bir başvurusu varsa (olmamalı) kapat
      if (ms.intelAppId) tx.set(ctx.ref.membership(uid), { intelAppId: null, intelAppCode: null, intelAppAtMs: null }, { merge: true });
      intel.enrollIntelTx(tx, ctx, { actorId: uid, codeName: pick.codeName, key: pick.key, intelExists: intelSnap.exists, stateExists: stateSnap.exists, user });
      sms(
        tx,
        uid,
        `🚓 İstihbarat ve Polis birleşti: artık hepimiz Polis Teşkilatıyız! Teşkilata otomatik alındın. Kod adın: ${pick.codeName} (Çeteler › Polis Teşkilatı'ndan değiştirebilirsin). Prestijin 0'dan başlıyor; rütbene göre maaşın ve rüşvet payın her gece 00:00'da yatar.`,
        'role_rule_v109'
      );
      return { enrolled: pick.codeName };
    });
  }
  async function makeMemberPolice(ctx, rosterId, actorId) {
    return db.runTransaction(async (tx) => {
      const [ms, user, rs] = await Promise.all([readMembership(tx, ctx, actorId), intel.readPoliceUser(tx, ctx, actorId), tx.get(ctx.ref.roster(rosterId))]);
      if (ms.intelRosterId !== rosterId || !rs.exists || !user.data) return { skipped: true };
      // eski usul bekleyen başvuru/istifa bayrağı teşkilat üyesinde kalmasın
      // (kalırsa 00:00'daki eski-istifa temizliği üyeyi teşkilattan çıkarırdı)
      if (user.data.pendingPoliceChange) tx.update(user.ref, { pendingPoliceChange: null });
      if (user.data.profession === 'polis') return { skipped: 'already' };
      intel.setPoliceProfession(tx, ctx, actorId, user, true);
      const rank = RANK_LABELS[rs.data().rank] || 'Polis Memuru';
      sms(
        tx,
        actorId,
        `🚓 İstihbarat ve Polis birleşti: teşkilatın artık Polis Teşkilatı ve sen artık polissin! Kod adın, prestijin ve sicilin aynen duruyor. Rütben: ${rank}. Maaşın ve rüşvet payın her gece 00:00'da yatar; soygun durdurursan prestij de kazanırsın.`,
        'role_rule_v109'
      );
      return { set: true };
    });
  }
  async function ensureRolesV109(ctx, safe) {
    if (ctx.isTest) return { skipped: 'test' };
    const flagRef = db.doc('migrations/rolesV109');
    if ((await flagRef.get()).data()?.done) return { skipped: true };
    const out = { cancelledApply: 0, resigned: 0, enrolled: 0, droppedBaba: 0, membersMadePolice: 0 };

    // 1) eski usul bekleyen polislik başvuruları → iptal + SMS
    const applies = await db.collection('users').where('pendingPoliceChange', '==', 'apply').get();
    for (const u of applies.docs) {
      await safe(ctx, `v109-apply:${u.id}`, () =>
        db.runTransaction(async (tx) => {
          const [cur, ms] = await Promise.all([tx.get(u.ref).then((x) => x.data()), readMembership(tx, ctx, u.id)]);
          if (cur?.pendingPoliceChange !== 'apply') return;
          tx.update(u.ref, { pendingPoliceChange: null });
          if (ms.intelRosterId) return; // zaten teşkilatta → 4. adımda polis olur, iptal SMS'i gitmez
          sms(tx, u.id, '🏛️ İstihbarat ve Polis birleşti: Polis Teşkilatı. Bekleyen polislik başvurun yeni sisteme taşınamadığı için iptal edildi — Karakol ya da Çeteler › Polis Teşkilatı üzerinden yeni formla tekrar başvurabilirsin.', 'role_rule_v109');
          out.cancelledApply += 1;
        })
      );
    }
    // 2) eski usul bekleyen istifalar → işlenir (polislikten çıkar, teşkilata alınmaz)
    const resigns = await db.collection('users').where('pendingPoliceChange', '==', 'resign').get();
    for (const u of resigns.docs) {
      await safe(ctx, `v109-resign:${u.id}`, () =>
        db.runTransaction(async (tx) => {
          const [ms, user] = await Promise.all([readMembership(tx, ctx, u.id), intel.readPoliceUser(tx, ctx, u.id)]);
          if (user.data?.pendingPoliceChange !== 'resign') return;
          if (ms.intelRosterId) {
            // teşkilat üyesi (eski istihbaratçı) — polisliği teşkilat üyeliğinden gelir; istifa bayrağı düşer
            tx.update(user.ref, { pendingPoliceChange: null });
            return;
          }
          intel.setPoliceProfession(tx, ctx, u.id, user, false);
          sms(tx, u.id, '🚪 Polislikten istifa talebin işlendi. Artık sivilsin.', 'role_rule_v109');
          out.resigned += 1;
        })
      );
    }
    // 3) tüm polisler → teşkilata (otomatik kod adı, 0 prestij)
    const police = await db.collection('users').where('profession', '==', 'polis').get();
    for (const u of police.docs) {
      await safe(ctx, `v109-enroll:${u.id}`, async () => {
        const r = await enrollMigratedPolice(ctx, u.id);
        if (r?.enrolled) out.enrolled += 1;
        if (r?.dropped) out.droppedBaba += 1;
      });
    }
    // 4) tüm teşkilat üyeleri (eski istihbaratçılar) → polis
    const roster = await ctx.ref.rosterCol().get();
    for (const r of roster.docs) {
      const actorId = (await intel.linkRef(ctx, r.id).get()).data()?.actorId;
      if (!actorId) continue;
      await safe(ctx, `v109-member:${r.id}`, async () => {
        const res = await makeMemberPolice(ctx, r.id, actorId);
        if (res?.set) out.membersMadePolice += 1;
      });
    }
    await core.refreshIntelRoster(ctx);
    if ((ctx.errors || []).some((e) => String(e.label || '').startsWith('v109-'))) {
      await flagRef.set({ lastRunAt: FV.serverTimestamp(), lastRun: out, done: false }, { merge: true });
      return { ...out, incomplete: true };
    }
    await flagRef.set({ ranAt: FV.serverTimestamp(), ...out, done: true }, { merge: true });
    return out;
  }

  return { paySalaries, payOneSalary, processRoleInactivity, reconcilePolice, ensureRolesV109, enrollMigratedPolice, makeMemberPolice };
}
