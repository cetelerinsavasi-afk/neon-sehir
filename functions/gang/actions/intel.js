// POLİS TEŞKİLATI (v109; kodda hâlâ "intel" — eski adı İstihbarat) — sabit
// organizasyon (sabit ad + sabit logo), kod adıyla gizli kimlik, çetelere
// sızma (ihbar / içerik sızdırma), operasyon, rüşvet, üye Mafya Babası olursa
// karar paneli.
// v108: katılım BAŞVURU FORMUYLA, en üst iki rütbe onaylar. Kasa kapandı:
// gelirler devlete, operasyon masrafı devletten. Sicil süresiz (üye ayrılınca silinir).
// v109: İstihbarat ile Polis birleşti. TEŞKİLAT ÜYESİ = POLİS:
//   - kayıt (enrollIntelTx) users.profession = 'polis' yazar,
//   - her ayrılış (istifa, atılma, oylama, pasiflik, çete kurma, karar paneli)
//     mesleği de alır ve 24 saat yeniden başvuru yasağı koyar
//     (memberships.intelCooldownUntilMs).
//   Şartlar: başlangıç görevleri + 50 saygınlık + %0 şüphe + 1 silah; imam ve
//   Mafya Babası katılamaz. Soygun durdurma prestiji de bu teşkilata yazılır.
import { GANG, INTEL, SALARIES, atLeast } from '../config.js';
import { addDays, midnightMsOf, dateKeyOf, truckTimes } from '../time.js';
import { decidedOutcome } from './votes.js';
import { intelReviewRanks, hasIntelReviewers } from '../ranks.js';

const CODENAME_RE = /^[\p{L}\p{N}_\-. ]+$/u;

export function createIntelActions(core) {
  const { FV, fail, readMembership, readWallet, announceIntel, notify, systemChat, cleanText, requireIntel } = core;

  const linkRef = (ctx, rosterId) => core.db.doc(`gangWorlds/${ctx.worldId}/intelRosterLinks/${rosterId}`);

  function intelDefaults() {
    return { name: INTEL.NAME, logo: INTEL.LOGO, note: 'Şehrin güvenliği bizden sorulur.', memberCount: 0 };
  }
  function intelStateDefaults(ctx) {
    return { kasa: 0, kasaAtMidnight: 0, midnightDateKey: ctx.dateKey, distributableLeft: 0 };
  }

  // ---------------------------------------------------------------------------
  // v109 — POLİS MESLEĞİ ↔ TEŞKİLAT ÜYELİĞİ (aynı işlemde)
  // OKUMA: readPoliceUser (yazmalardan önce). YAZMA: setPoliceProfession.
  // Canlı: users/{uid}.profession + users/{uid}/private/meta.isPolice
  // (functions/index.js soygun / rüşvet / ceza çarpanı bunlara bakar).
  // Test dünyası: players/{id}.isPolice.
  // ---------------------------------------------------------------------------
  async function readPoliceUser(tx, ctx, actorId) {
    if (!actorId) return { ref: null, data: null };
    const ref = core.walletRef(ctx, actorId);
    const snap = await tx.get(ref);
    return { ref, data: snap.exists ? snap.data() : null };
  }
  function setPoliceProfession(tx, ctx, actorId, user, on) {
    if (!actorId || !user?.data) return; // oyuncu belgesi yoksa (silinmiş hesap) dokunma
    if (ctx.isTest) {
      if (Boolean(user.data.isPolice) !== on) tx.update(user.ref, { isPolice: on });
      return;
    }
    if (on) tx.update(user.ref, { profession: 'polis', pendingPoliceChange: null, policeSinceMs: ctx.now });
    else if (user.data.profession === 'polis' || user.data.pendingPoliceChange) tx.update(user.ref, { profession: null, pendingPoliceChange: null, policeSinceMs: null });
    tx.set(core.db.doc(`users/${actorId}/private/meta`), { isPolice: on }, { merge: true });
  }
  const cooldownUntilOf = (ctx) => ctx.now + INTEL.REJOIN_COOLDOWN_MS;

  // --- Teşkilattan ayrılma: prestij + sicil silinir, kod adı serbest, polislik
  // biter, 24 saat yeniden başvurulamaz (v109). OKUMALAR burada. ---
  async function planIntelLeave(tx, ctx, membership, actorId = ctx.actorId) {
    const [rosterSnap, user] = await Promise.all([tx.get(ctx.ref.roster(membership.intelRosterId)), readPoliceUser(tx, ctx, actorId)]);
    return { rosterId: membership.intelRosterId, roster: rosterSnap.data() || null, actorId, membership, user };
  }
  // YAZMALAR. notifyText: oyuncuya özel SMS (gizlilik: teşkilata "X ayrıldı" denmez).
  function applyIntelLeave(tx, ctx, plan, { actorId = null, notifyText = null, cooldown = true } = {}) {
    const who = actorId || plan.actorId;
    tx.delete(ctx.ref.roster(plan.rosterId));
    tx.delete(linkRef(ctx, plan.rosterId));
    tx.delete(ctx.ref.intelRecord(plan.rosterId)); // v108: sicil üye çıkınca silinir
    if (plan.roster?.codeName) tx.delete(ctx.ref.codeName(core.nameKeyOf(plan.roster.codeName)));
    tx.set(
      ctx.ref.membership(who),
      {
        intelRosterId: null,
        intelRank: null,
        intelCodeName: null,
        intelJoinedAtMs: null,
        intelDecisionGangId: null,
        intelDecisionDeadline: null,
        ...(cooldown ? { intelCooldownUntilMs: cooldownUntilOf(ctx) } : {}),
      },
      { merge: true }
    );
    tx.set(ctx.ref.intel(), { memberCount: FV.increment(-1) }, { merge: true });
    if (plan.user) setPoliceProfession(tx, ctx, who, plan.user, false);
    if (notifyText) notify(tx, ctx, who, notifyText, 'intel');
    ctx.logs.push({ gang: 'intel_membership', world: ctx.worldId, event: 'leave' });
    // Gizlilik: kimseye "X ayrıldı" bildirimi GÖNDERİLMEZ.
  }

  function parseCodeName(v) {
    const codeName = cleanText(v, { min: INTEL.CODENAME_MIN, max: INTEL.CODENAME_MAX, field: 'Kod adı' });
    if (!CODENAME_RE.test(codeName)) fail('invalid-argument', 'Kod adında sadece harf, rakam, boşluk, _ - . kullanılabilir.');
    return { codeName, key: core.nameKeyOf(codeName) };
  }

  // v108 — rol tekliği + katılım şartları (başvuruda ve onayda yeniden).
  // v109: polis = teşkilat üyesi; şüphe %0 şartı ve 24 saat yeniden başvuru yasağı.
  function joinBlockReason(wallet, membership, { forApplicant = true, now = Date.now() } = {}) {
    if (membership.intelRosterId) return forApplicant ? 'Zaten polissin.' : 'Başvuran zaten teşkilatta.';
    if (wallet.isPolice) return forApplicant ? 'Zaten polissin.' : 'Başvuran zaten polis.';
    if (membership.gangRank === 'baba') return forApplicant ? 'Mafya Babası polis olamaz.' : 'Başvuran artık Mafya Babası — teşkilata alınamaz.';
    if (wallet.isImam) return forApplicant ? 'İmam polis olamaz (önce imamlıktan istifa etmelisin).' : 'Başvuran artık imam — teşkilata alınamaz.';
    const cd = Number(membership.intelCooldownUntilMs || 0);
    if (forApplicant && cd > now) return `Polislikten yeni ayrıldığın için ${Math.max(1, Math.ceil((cd - now) / 3_600_000))} saat daha başvuru yapamazsın.`;
    if (INTEL.JOIN_REQUIRES_ONBOARDING && !wallet.onboarded) return forApplicant ? 'Polis olmak için önce başlangıç görevlerini (📋) tamamlamalısın.' : 'Başvuranın başlangıç görevleri eksik.';
    if (wallet.reputation < INTEL.JOIN_MIN_REPUTATION) return forApplicant ? `Polis olmak için en az ${INTEL.JOIN_MIN_REPUTATION} saygınlık gerekli.` : `Başvuranın saygınlığı ${INTEL.JOIN_MIN_REPUTATION}'nin altına düştü.`;
    if (Number(wallet.suspicion || 0) > INTEL.JOIN_MAX_SUSPICION) return forApplicant ? 'Polis olmak için şüphen %0 olmalı.' : 'Başvuranın şüphesi artık %0 değil.';
    return null;
  }
  async function hasWeaponOf(ctx, actorId) {
    if (!INTEL.JOIN_REQUIRES_WEAPON) return true;
    if (ctx.isTest) return Number((await ctx.ref.player(actorId).get()).data()?.power || 0) > 0;
    if (core.deps.hasWeapon) return Boolean(await core.deps.hasWeapon(actorId));
    return Number((await core.readPower(ctx, actorId)) || 0) > 0;
  }

  // Ortak üye kaydı (YAZMA — okumalardan sonra). form: başvuru formu (sicile yazılır)
  // v109: user = readPoliceUser sonucu → oyuncu aynı işlemde POLİS olur.
  function enrollIntelTx(tx, ctx, { actorId, codeName, key, intelExists, stateExists, form = null, user = null, prestige = 0 }) {
    if (!intelExists) tx.set(ctx.ref.intel(), intelDefaults());
    if (!stateExists) tx.set(ctx.ref.intelState(), intelStateDefaults(ctx));
    const rosterRef = ctx.ref.rosterCol().doc();
    tx.set(rosterRef, { codeName, rank: 'muhbir', prestige, prestigeAtMidnight: prestige, joinedAtMs: ctx.now, lastActiveAtMs: ctx.now });
    tx.set(linkRef(ctx, rosterRef.id), { actorId });
    tx.set(ctx.ref.codeName(key), { rosterId: rosterRef.id });
    tx.set(ctx.ref.intelRecord(rosterRef.id), { rosterId: rosterRef.id, joinedAtMs: ctx.now, ...(form ? { form: { ...form, updatedAtMs: ctx.now } } : {}) }, { merge: true });
    tx.set(
      ctx.ref.membership(actorId),
      { intelRosterId: rosterRef.id, intelRank: 'muhbir', intelCodeName: codeName, intelJoinedAtMs: ctx.now, intelAppId: null, intelAppCode: null, intelAppAtMs: null },
      { merge: true }
    );
    tx.set(ctx.ref.intel(), { memberCount: FV.increment(1) }, { merge: true });
    if (user) setPoliceProfession(tx, ctx, actorId, user, true);
    systemChat(tx, ctx, ctx.ref.intelChat('genel'), `🚓 ${codeName} teşkilata katıldı.`);
    ctx.logs.push({ gang: 'intel_membership', world: ctx.worldId, event: 'join' });
    return rosterRef.id;
  }

  // Doğrudan katılım SADECE test dünyasında (admin test düzeneği). Canlıda
  // katılım başvuru formuyla (applyIntel) — eski istemciler buraya düşer.
  async function joinIntel(ctx, data) {
    if (!ctx.isTest) fail('failed-precondition', 'Polis olmak için başvuru formu doldurman gerekiyor. Uygulamayı yenileyip Çeteler › Polis Teşkilatı › Başvur ya da Karakol › Polislik Başvurusu.');
    const { codeName, key } = parseCodeName(data.codeName);
    const weapon = await hasWeaponOf(ctx, ctx.actorId);
    return core.db.runTransaction(async (tx) => {
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const [codeSnap, intelSnap, stateSnap, user] = await Promise.all([tx.get(ctx.ref.codeName(key)), tx.get(ctx.ref.intel()), tx.get(ctx.ref.intelState()), readPoliceUser(tx, ctx, ctx.actorId)]);
      const block = joinBlockReason(wallet, membership, { now: ctx.now });
      if (block) fail('failed-precondition', block);
      if (!weapon) fail('failed-precondition', 'Polis olmak için en az 1 silahın olmalı.');
      if (codeSnap.exists) fail('already-exists', 'Bu kod adı kullanılıyor.');
      const rosterId = enrollIntelTx(tx, ctx, { actorId: ctx.actorId, codeName, key, intelExists: intelSnap.exists, stateExists: stateSnap.exists, user });
      return { rosterId, codeName };
    });
  }

  // ---------------------------------------------------------------------------
  // v108 — BAŞVURU FORMU
  //  - kod adı (benzersiz; başvuru süresince ayrılır)
  //  - bulunduğu çete + çetedeki rütbesi (beyan — doğru olması gerekmez)
  //    v109: listeden bir çete ya da "Hiçbir çetede değilim" (o zaman rütbe yok)
  //  - neden polis olmak istiyor (oyuncu kendisi yazar)
  // Başvuru gerçek kimlik İÇERMEZ (intelAppLinks/{id} sadece sunucuda).
  // Başkan ve Şefler inceler. Başkan/Şef yoksa anında, varsa ve 12 saat içinde
  // yanıt gelmezse otomatik onaylanır. Onaylanınca form üyenin siciline yazılır
  // ve üye sonradan düzenleyebilir.
  // ---------------------------------------------------------------------------
  const APP_RANKS = ['baba', 'sagkol', 'kidemli', 'tetikci', 'comez'];
  const NO_GANG_NAMES = [INTEL.APP_NO_GANG, 'Çetem yok']; // 'Çetem yok': v108 istemcisi
  function parseForm(data) {
    const gangName = cleanText(data.gangName, { min: 1, max: INTEL.APP_GANG_MAX, field: 'Çete adı' });
    const reason = cleanText(data.reason, { min: INTEL.APP_REASON_MIN, max: INTEL.APP_REASON_MAX, field: 'Neden' });
    if (NO_GANG_NAMES.includes(gangName) || data.gangRank === 'yok') return { gangName: INTEL.APP_NO_GANG, gangRank: 'yok', reason };
    const gangRank = APP_RANKS.includes(data.gangRank) ? data.gangRank : null;
    if (!gangRank) fail('invalid-argument', 'Çetendeki rütbeni seç.');
    return { gangName, gangRank, reason };
  }
  // İnceleyebilecek rütbeler (Başkan + Şef) ve teşkilatta inceleyen var mı
  function reviewRanksOf() {
    return intelReviewRanks();
  }
  const reviewersIn = (rosterDocs) => hasIntelReviewers(rosterDocs.map((d) => d.data().rank));
  const autoApproveAtOf = (createdAtMs) => Number(createdAtMs || 0) + INTEL.APP_AUTO_APPROVE_HOURS * 3_600_000;

  async function applyIntel(ctx, data) {
    const { codeName, key } = parseCodeName(data.codeName);
    const form = parseForm(data);
    const weapon = await hasWeaponOf(ctx, ctx.actorId);
    const res = await core.db.runTransaction(async (tx) => {
      const guard = await core.requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const wallet = await readWallet(tx, ctx, ctx.actorId);
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const [codeSnap, rosterSnap, intelSnap, stateSnap, user] = await Promise.all([
        tx.get(ctx.ref.codeName(key)),
        tx.get(ctx.ref.rosterCol()),
        tx.get(ctx.ref.intel()),
        tx.get(ctx.ref.intelState()),
        readPoliceUser(tx, ctx, ctx.actorId),
      ]);
      if (membership.intelAppId) fail('already-exists', 'Bekleyen bir polislik başvurun zaten var.');
      const block = joinBlockReason(wallet, membership, { now: ctx.now });
      if (block) fail('failed-precondition', block);
      if (!weapon) fail('failed-precondition', 'Polis olmak için en az 1 silahın olmalı.');
      if (codeSnap.exists) fail('already-exists', 'Bu kod adı kullanılıyor.');
      const appRef = ctx.ref.intelApps().doc();
      // Emniyet Genel Müdürü ya da Emniyet Amiri yoksa inceleyecek kimse yok → anında otomatik onay
      if (!reviewersIn(rosterSnap.docs)) {
        const rosterId = enrollIntelTx(tx, ctx, { actorId: ctx.actorId, codeName, key, intelExists: intelSnap.exists, stateExists: stateSnap.exists, form, user });
        tx.set(appRef, { codeName, codeKey: key, ...form, status: 'accepted', createdAtMs: ctx.now, resolvedAtMs: ctx.now, reviewedByCode: 'otomatik', autoReason: 'no_reviewers' });
        notify(tx, ctx, ctx.actorId, `🚓 Polis Teşkilatına kabul edildin — artık polissin! Kod adın: ${codeName}. Maaşın her gece 00:00'da yatar.`, 'intel');
        ctx.logs.push({ gang: 'intel_application', world: ctx.worldId, event: 'auto_accept_no_reviewers' });
        const res = { appId: appRef.id, codeName, accepted: true, auto: true, rosterId };
        guard.save(res);
        return res;
      }
      tx.set(appRef, { codeName, codeKey: key, ...form, status: 'pending', createdAtMs: ctx.now, autoApproveAtMs: autoApproveAtOf(ctx.now) });
      tx.set(ctx.ref.intelAppLink(appRef.id), { actorId: ctx.actorId, createdAtMs: ctx.now });
      tx.set(ctx.ref.codeName(key), { appId: appRef.id, reservedAtMs: ctx.now });
      tx.set(ctx.ref.membership(ctx.actorId), { intelAppId: appRef.id, intelAppCode: codeName, intelAppAtMs: ctx.now }, { merge: true });
      systemChat(tx, ctx, ctx.ref.intelChat('yonetim'), `📝 Yeni polislik başvurusu: ${codeName} — Savaş sekmesinin en altında incelenmeyi bekliyor. ${INTEL.APP_AUTO_APPROVE_HOURS} saat içinde yanıt verilmezse otomatik onaylanır.`);
      ctx.logs.push({ gang: 'intel_application', world: ctx.worldId, event: 'apply' });
      const out = { appId: appRef.id, codeName, autoApproveAtMs: autoApproveAtOf(ctx.now) };
      guard.save(out);
      return out;
    });
    // anında onaylandıysa kod adı listesi hemen güncellensin (best-effort)
    if (res?.accepted) await core.refreshIntelRoster(ctx).catch(() => {});
    return res;
  }

  function closeApp(tx, ctx, app, appId, actorId, status, extra = {}) {
    tx.update(ctx.ref.intelApp(appId), { status, resolvedAtMs: ctx.now, ...extra });
    tx.delete(ctx.ref.intelAppLink(appId));
    if (actorId) tx.set(ctx.ref.membership(actorId), { intelAppId: null, intelAppCode: null, intelAppAtMs: null }, { merge: true });
  }

  async function cancelIntelApplication(ctx) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const appId = membership.intelAppId;
      if (!appId) fail('not-found', 'Bekleyen bir başvurun yok.');
      const app = (await tx.get(ctx.ref.intelApp(appId))).data();
      const codeSnap = app?.codeKey ? await tx.get(ctx.ref.codeName(app.codeKey)) : null;
      if (codeSnap?.exists && codeSnap.data().appId === appId) tx.delete(codeSnap.ref);
      if (app && app.status === 'pending') closeApp(tx, ctx, app, appId, ctx.actorId, 'cancelled');
      else tx.set(ctx.ref.membership(ctx.actorId), { intelAppId: null, intelAppCode: null, intelAppAtMs: null }, { merge: true });
      return { cancelled: true };
    });
  }

  // Başkan/Şef bir başvuruyu kabul/ret eder.
  // Onayda şartlar YENİDEN kontrol edilir (arada polis/imam olmuş olabilir).
  async function reviewIntelApplication(ctx, data) {
    const appId = String(data.appId || '');
    const accept = Boolean(data.accept);
    if (!appId) fail('invalid-argument', 'Başvuru seçilmedi.');
    // silah kontrolü işlem dışında (canlı: weapons sorgusu)
    const pre = (await ctx.ref.intelAppLink(appId).get()).data();
    const weapon = accept && pre?.actorId ? await hasWeaponOf(ctx, pre.actorId) : true;
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const [meSnap, intelSnap, appSnap, linkSnap, stateSnap] = await Promise.all([
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.intel()),
        tx.get(ctx.ref.intelApp(appId)),
        tx.get(ctx.ref.intelAppLink(appId)),
        tx.get(ctx.ref.intelState()),
      ]);
      const me = meSnap.data();
      if (!me || !reviewRanksOf().includes(core.effRank(me, ctx, 'muhbir'))) fail('permission-denied', 'Başvuruları sadece Emniyet Genel Müdürü ve Emniyet Amirleri inceleyebilir.');
      const app = appSnap.data();
      if (!app || app.status !== 'pending') fail('failed-precondition', 'Bu başvuru artık beklemede değil.');
      const actorId = linkSnap.data()?.actorId || null;
      const codeSnap = await tx.get(ctx.ref.codeName(app.codeKey));
      const reserved = codeSnap.exists && codeSnap.data().appId === appId;
      let applicant = null;
      let applicantMs = null;
      let applicantUser = null;
      if (actorId) {
        applicantMs = await readMembership(tx, ctx, actorId);
        applicant = await readWallet(tx, ctx, actorId).catch(() => null);
        applicantUser = await readPoliceUser(tx, ctx, actorId);
      }
      if (!accept) {
        if (reserved) tx.delete(codeSnap.ref);
        closeApp(tx, ctx, app, appId, applicantMs?.intelAppId === appId ? actorId : null, 'rejected', { reviewedByCode: me.codeName });
        if (actorId) notify(tx, ctx, actorId, '🚓 Polislik başvurun reddedildi.', 'intel');
        announceIntel(tx, ctx, '📝', `${me.codeName}, ${app.codeName} başvurusunu reddetti.`);
        return { rejected: true };
      }
      const block = !actorId || !applicant ? 'Başvuran oyuncu bulunamadı.' : joinBlockReason(applicant, applicantMs, { forApplicant: false, now: ctx.now }) || (!weapon ? 'Başvuranın silahı yok.' : null);
      if (block) {
        if (reserved) tx.delete(codeSnap.ref);
        closeApp(tx, ctx, app, appId, applicantMs?.intelAppId === appId ? actorId : null, 'void', { reviewedByCode: me.codeName, voidReason: block });
        if (actorId) notify(tx, ctx, actorId, `🚓 Polislik başvurun geçersiz sayıldı: ${block}`, 'intel');
        return { void: true, reason: block };
      }
      if (codeSnap.exists && !reserved) fail('already-exists', 'Bu kod adı artık kullanılıyor — başvuruyu reddet.');
      const rosterId = enrollIntelTx(tx, ctx, { actorId, codeName: app.codeName, key: app.codeKey, intelExists: intelSnap.exists, stateExists: stateSnap.exists, form: { gangName: app.gangName, gangRank: app.gangRank, reason: app.reason }, user: applicantUser });
      closeApp(tx, ctx, app, appId, null, 'accepted', { reviewedByCode: me.codeName });
      notify(tx, ctx, actorId, `🚓 Polis Teşkilatına kabul edildin — artık polissin! Kod adın: ${app.codeName}. Maaşın her gece 00:00'da yatar.`, 'intel');
      announceIntel(tx, ctx, '✅', `${me.codeName}, ${app.codeName} başvurusunu onayladı.`);
      return { accepted: true, rosterId };
    });
  }

  // Üye kendi başvuru formunu (sicildeki beyanını) günceller / ilk kez doldurur.
  async function updateIntelForm(ctx, data) {
    const form = parseForm(data);
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      tx.set(ctx.ref.intelRecord(rid), { rosterId: rid, form: { ...form, updatedAtMs: ctx.now } }, { merge: true });
      return { updated: true };
    });
  }

  // Bekleyen başvurular (gangClock her turda — 5 dk — ve gece): 12 saat içinde
  // Başkan/Şeften yanıt gelmediyse ya da teşkilatta artık Başkan/Şef yoksa
  // otomatik onaylanır. Şartlar onay anında yeniden kontrol edilir (arada polis/
  // imam olmuş, silahını satmış olabilir) — tutmuyorsa başvuru geçersiz sayılır.
  async function settleIntelApplications(ctx, safe) {
    const snap = await ctx.ref.intelApps().where('status', '==', 'pending').get();
    if (snap.empty) return { pending: 0, accepted: 0 };
    const roster = await ctx.ref.rosterCol().get();
    const noReviewers = !reviewersIn(roster.docs);
    const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
    let accepted = 0;
    for (const app of apps) {
      const due = noReviewers || ctx.now >= autoApproveAtOf(app.createdAtMs);
      if (!due) continue;
      await safe(ctx, `intel-app:${app.id}`, async () => {
        const link = (await ctx.ref.intelAppLink(app.id).get()).data();
        const weapon = link?.actorId ? await hasWeaponOf(ctx, link.actorId) : false;
        const ok = await core.db.runTransaction(async (tx) => {
          const [a, l, intelSnap, stateSnap] = await Promise.all([tx.get(ctx.ref.intelApp(app.id)), tx.get(ctx.ref.intelAppLink(app.id)), tx.get(ctx.ref.intel()), tx.get(ctx.ref.intelState())]);
          const cur = a.data();
          if (!cur || cur.status !== 'pending') return false;
          const actorId = l.data()?.actorId || null;
          const codeSnap = await tx.get(ctx.ref.codeName(cur.codeKey));
          const reserved = codeSnap.exists && codeSnap.data().appId === app.id;
          const ms = actorId ? await readMembership(tx, ctx, actorId) : null;
          const wallet = actorId ? await readWallet(tx, ctx, actorId).catch(() => null) : null;
          const user = actorId ? await readPoliceUser(tx, ctx, actorId) : null;
          const block = !actorId || !wallet ? 'Başvuran bulunamadı.' : joinBlockReason(wallet, ms, { forApplicant: false, now: ctx.now }) || (!weapon ? 'Başvuranın silahı yok.' : null) || (codeSnap.exists && !reserved ? 'kod adı kullanılıyor' : null);
          if (block) {
            if (reserved) tx.delete(codeSnap.ref);
            closeApp(tx, ctx, cur, app.id, ms?.intelAppId === app.id ? actorId : null, 'void', { voidReason: block });
            if (actorId) notify(tx, ctx, actorId, `🚓 Polislik başvurun geçersiz sayıldı: ${block}`, 'intel');
            return false;
          }
          const why = noReviewers ? 'teşkilatta Emniyet Genel Müdürü ya da Emniyet Amiri yok' : `${INTEL.APP_AUTO_APPROVE_HOURS} saat içinde yanıt verilmedi`;
          enrollIntelTx(tx, ctx, { actorId, codeName: cur.codeName, key: cur.codeKey, intelExists: intelSnap.exists, stateExists: stateSnap.exists, form: { gangName: cur.gangName, gangRank: cur.gangRank, reason: cur.reason }, user });
          closeApp(tx, ctx, cur, app.id, null, 'accepted', { reviewedByCode: 'otomatik', autoReason: noReviewers ? 'no_reviewers' : 'timeout' });
          // v110: oyuncuya neden otomatik onaylandığı söylenmez — sadece kabul edildiği
          notify(tx, ctx, actorId, `🚓 Polis Teşkilatına kabul edildin — artık polissin! Kod adın: ${cur.codeName}. Maaşın her gece 00:00'da yatar.`, 'intel');
          announceIntel(tx, ctx, '✅', `${cur.codeName} teşkilata kabul edildi.`);
          ctx.logs.push({ gang: 'intel_application', world: ctx.worldId, event: 'auto_accept', why });
          return true;
        });
        if (ok) accepted += 1;
      });
    }
    return { pending: apps.length, accepted, noReviewers };
  }

  async function leaveIntel(ctx) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      requireIntel(membership);
      const plan = await planIntelLeave(tx, ctx, membership);
      applyIntelLeave(tx, ctx, plan, { notifyText: `🚪 Polislikten istifa ettin. ${INTEL.REJOIN_COOLDOWN_MS / 3_600_000} saat boyunca yeniden başvuru yapamazsın.` });
      return { left: true };
    });
  }

  async function updateIntelNote(ctx, data) {
    const note = cleanText(data.note, { max: GANG.NOTE_MAX, field: 'Not' });
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const me = (await tx.get(ctx.ref.roster(rid))).data();
      if (!me || !['baskan', 'sef'].includes(core.effRank(me, ctx, 'muhbir'))) fail('permission-denied', 'Notu sadece Emniyet Genel Müdürü ve Emniyet Amirleri değiştirebilir.');
      tx.set(ctx.ref.intel(), { note }, { merge: true });
      return { updated: true };
    });
  }

  // v94 → v108 — ÜYE SİCİLİ: rütbeliler (ilk 7: EGM / Amir / Başkomiser)
  // herkesinkini, herkes kendisininkini görür. Süresiz (teşkilata girdiği günden
  // bu yana), maaş (rütbeye göre) ve başvuru formundaki beyanlar dahil.
  // v109: istihbarat + polis icraatı tek sicilde (soygun durdurma, kurtarılan
  // altın, soygun payı, rüşvet payı).
  async function intelMemberReport(ctx, data) {
    const targetId = String(data.rosterId || '');
    if (!targetId) fail('invalid-argument', 'Üye seçilmedi.');
    const membership = await core.db.runTransaction((tx) => readMembership(tx, ctx, ctx.actorId));
    const rid = requireIntel(membership);
    const [meSnap, tSnap, recSnap] = await Promise.all([ctx.ref.roster(rid).get(), ctx.ref.roster(targetId).get(), ctx.ref.intelRecord(targetId).get()]);
    const me = meSnap.data();
    if (!me || (targetId !== rid && !['baskan', 'sef', 'uzman'].includes(core.effRank(me, ctx, 'muhbir')))) fail('permission-denied', 'Polis sicillerini sadece rütbeliler görebilir.');
    const t = tSnap.data();
    if (!t) fail('not-found', 'Üye bulunamadı.');
    const rec = recSnap.data() || {};
    const joinedAtMs = Number(t.joinedAtMs || rec.joinedAtMs || 0);
    const joinedDaysAgo = joinedAtMs ? Math.max(0, Math.round((midnightMsOf(ctx.dateKey) - midnightMsOf(dateKeyOf(joinedAtMs))) / 86_400_000)) : null;
    const rank = t.rank || 'muhbir';
    return {
      rosterId: targetId,
      codeName: t.codeName || '',
      rank,
      joinedAtMs,
      joinedDaysAgo,
      wars: Object.keys(rec.wars || {}).length,
      power: Number(rec.power || 0),
      truckReports: Number(rec.truckReports || 0),
      betReports: Number(rec.betReports || 0),
      truckLeaks: Number(rec.truckLeaks || 0),
      betLeaks: Number(rec.betLeaks || 0),
      heistsStopped: Number(rec.heistsStopped || 0),
      goldRecovered: Number(rec.goldRecovered || 0),
      goldEarned: Number(rec.goldEarned || 0),
      bustPrestige: Number(rec.bustPrestige || 0),
      // v109: alınan maaş / rüşvet toplamları sicilde gösterilmez (kayıtta tutulur)
      salary: SALARIES[rank] || 0,
      form: rec.form || null,
    };
  }

  // Kod adı değiştirme (✏️) — benzersiz; eski mesajlarda eski ad kalır.
  async function changeCodeName(ctx, data) {
    const { codeName, key } = parseCodeName(data.codeName);
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const [me, codeSnap] = await Promise.all([tx.get(ctx.ref.roster(rid)), tx.get(ctx.ref.codeName(key))]);
      if (!me.exists) fail('failed-precondition', 'Polis Teşkilatı üyesi değilsin.');
      const oldName = me.data().codeName;
      const oldKey = core.nameKeyOf(oldName || '');
      if (oldKey === key && oldName === codeName) return { codeName };
      if (codeSnap.exists && codeSnap.data().rosterId !== rid) fail('already-exists', 'Bu kod adı kullanılıyor.');
      if (oldKey !== key) {
        tx.delete(ctx.ref.codeName(oldKey));
        tx.set(ctx.ref.codeName(key), { rosterId: rid });
      }
      tx.update(ctx.ref.roster(rid), { codeName });
      tx.set(ctx.ref.membership(ctx.actorId), { intelCodeName: codeName }, { merge: true });
      if (me.data().rank === 'baskan') tx.set(ctx.ref.intel(), { baskanCode: codeName }, { merge: true });
      systemChat(tx, ctx, ctx.ref.intelChat('genel'), `✏️ ${oldName} artık ${codeName} kod adını kullanıyor.`);
      return { codeName };
    });
  }

  // Teşkilat sohbeti: genel (tüm üyeler) + yonetim (EGM, Amir, Başkomiser).
  async function sendIntelChat(ctx, data) {
    const channel = String(data.channel || 'genel');
    if (!['genel', 'yonetim'].includes(channel)) fail('invalid-argument', 'Geçersiz kanal.');
    const text = cleanText(data.text, { min: 1, max: GANG.CHAT_MAX, field: 'Mesaj' });
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const me = (await tx.get(ctx.ref.roster(rid))).data();
      if (!me) fail('failed-precondition', 'Polis Teşkilatı üyesi değilsin.');
      if (channel !== 'genel' && !atLeast(core.effRank(me, ctx, 'muhbir'), 'kidemli')) fail('permission-denied', 'Bu kanala sadece rütbeliler yazabilir.');
      if (me.lastChatAtMs && ctx.now - me.lastChatAtMs < GANG.CHAT_MIN_INTERVAL_MS) fail('resource-exhausted', 'Biraz yavaş!');
      // Gerçek kimlik YOK: sadece kod adı + roster kimliği
      tx.set(ctx.ref.intelChat(channel).doc(), { rosterId: rid, codeName: me.codeName, rank: me.rank, text, createdAtMs: ctx.now });
      tx.update(ctx.ref.roster(rid), { lastChatAtMs: ctx.now });
      return { sent: true };
    });
  }

  // ---------------------------------------------------------------------------
  // İHBAR — İstihbarat üyesi, kendi çetesinde Tetikçi+ ise seferdeki tırı
  // ihbar edebilir. Bir tır (sefer) yalnızca BİR kez ihbar edilir.
  // ---------------------------------------------------------------------------
  async function reportTruck(ctx, data) {
    const truckId = String(data.truckId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!membership.gangId) fail('failed-precondition', 'Bir çetede değilsin.');
      const [meSnap, rosterSnap, truckSnap] = await Promise.all([
        tx.get(ctx.ref.member(membership.gangId, ctx.actorId)),
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.truck(truckId)),
      ]);
      const truck = truckSnap.data();
      if (!truck || truck.gangId !== membership.gangId) fail('permission-denied', 'Bu tırı göremezsin.');
      if (!atLeast(core.effRank(meSnap.data(), ctx), 'tetikci')) fail('permission-denied', 'Tırları görmek için en az Tetikçi olmalısın.');
      if (truck.status !== 'in_transit') fail('failed-precondition', 'Sadece seferdeki tırlar ihbar edilebilir.');
      // v67: ihbar, tır yola çıktıktan sonraki 6 saat içinde (sonra saldırı başlar)
      const { departAtMs, attackAtMs } = truckTimes(truck);
      if (truck.departDateKey !== ctx.dateKey || ctx.now >= attackAtMs) fail('deadline-exceeded', 'Tır ihbarı, tır yola çıktıktan sonraki 6 saat içinde yapılabilir.');
      const reportId = `${truckId}_${truck.departDateKey}`;
      const repSnap = await tx.get(ctx.ref.intelReport(reportId));
      if (repSnap.exists) fail('already-exists', 'Bu tır zaten ihbar edildi.');
      const gang = (await tx.get(ctx.ref.gang(membership.gangId))).data();
      tx.set(ctx.ref.intelReport(reportId), {
        truckId,
        truckCode: truck.code,
        gangId: truck.gangId,
        gangName: gang?.name || truck.gangName,
        gangLogo: gang?.logo || null,
        departDateKey: truck.departDateKey,
        departAtMs,
        attackAtMs,
        reportedByCode: rosterSnap.data().codeName,
        reportedAtMs: ctx.now,
        leaked: false,
        opWarId: null,
      });
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.REPORT_PRESTIGE) });
      core.intelStat(tx, ctx, rid, { truckReports: 1 }); // v94 üye raporu
      announceIntel(tx, ctx, '📡', `${rosterSnap.data().codeName}, TIR #${truck.code} (${gang?.name || ''}) tırını ihbar etti.`);
      ctx.logs.push({ gang: 'intel_report', world: ctx.worldId, reportId });
      return { reportId, prestige: INTEL.REPORT_PRESTIGE };
    });
  }

  // İÇERİK SIZDIRMA — Kıdemli+ ; ihbar edilmiş tırın yükünü bir kez sızdırır.
  async function leakTruck(ctx, data) {
    const reportId = String(data.reportId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const repSnap = await tx.get(ctx.ref.intelReport(reportId));
      if (!repSnap.exists) fail('failed-precondition', 'Önce tır ihbar edilmeli.');
      const rep = repSnap.data();
      if (membership.gangId !== rep.gangId) fail('permission-denied', 'Bu tırın içeriğini göremezsin.');
      if (rep.departDateKey !== ctx.dateKey || ctx.now >= truckTimes(rep).attackAtMs) fail('deadline-exceeded', 'İçerik, tır yola çıktıktan sonraki 6 saat içinde sızdırılabilir.');
      const [meSnap, rosterSnap, cargoSnap, truckSnap] = await Promise.all([
        tx.get(ctx.ref.member(rep.gangId, ctx.actorId)),
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.cargo(rep.truckId)),
        tx.get(ctx.ref.truck(rep.truckId)),
      ]);
      if (!atLeast(core.effRank(meSnap.data(), ctx), 'kidemli')) fail('permission-denied', 'Tır içeriğini görmek için en az Kıdemli olmalısın.');
      if (rep.leaked) fail('already-exists', 'Bu tırın içeriği zaten sızdırıldı.');
      if (truckSnap.data()?.status !== 'in_transit' || truckSnap.data()?.departDateKey !== rep.departDateKey) fail('failed-precondition', 'Bu sefer bitti.');
      const items = cargoSnap.data()?.items || {};
      const estReward = core.instantValueOf(items);
      const opSnap = rep.opWarId ? await tx.get(ctx.ref.war(rep.opWarId)) : null;
      // İçerik adetleri İstihbarata gösterilmez — sadece ödül değeri.
      tx.update(ctx.ref.intelReport(reportId), {
        leaked: true,
        estReward,
        leakedByCode: rosterSnap.data().codeName,
        leakedAtMs: ctx.now,
      });
      if (opSnap?.exists) tx.update(opSnap.ref, { estReward });
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.LEAK_PRESTIGE) });
      core.intelStat(tx, ctx, rid, { truckLeaks: 1 });
      announceIntel(tx, ctx, '📦', `${rosterSnap.data().codeName}, TIR #${rep.truckCode} içeriğini sızdırdı — ödül değeri ${estReward.toLocaleString('tr-TR')}.`);
      ctx.logs.push({ gang: 'intel_leak', world: ctx.worldId, reportId });
      return { leaked: true, estReward, prestige: INTEL.LEAK_PRESTIGE };
    });
  }

  // ---------------------------------------------------------------------------
  // v33 — BAHİSLİ SAVAŞA MÜDAHALE
  //  Bahis kabul edildikten sonra, savaş başlamadan (o gecenin 00:00'ından)
  //  önce:
  //   - İHBAR: iki çeteden birinde en az Tetikçi olan İstihbarat üyesi
  //     (+1M). İstihbarat bahsi görür ama TUTARI göremez.
  //   - İÇERİĞİ AÇMA: iki çeteden birinde en az Kıdemli olan İstihbarat
  //     üyesi (+1M). İstihbarat toplam bahsi (havuzu) görür.
  //   - OPERASYON: Başkan/Şef, İstihbarat kasasından 100.000 ile başlatır
  //     (tutar görülmeden de başlatılabilir). Savaş 00:00'da 3 taraflı
  //     başlar; en güçlü taraf havuzun tamamını alır.
  //  00:00'dan sonra İstihbarat müdahale edemez. Çeteler müdahaleyi savaş
  //  başlarken (00:00) öğrenir.
  // ---------------------------------------------------------------------------
  // v35: bahis kabul edildikten sonra İLK SALDIRI DİLİMİNİN SONUNA kadar
  // (başlangıç + 6 saat = ilk 2 dilim) müdahale edilebilir; sonrası çetelerin arasında.
  async function readBetForIntel(tx, ctx, warId) {
    const war = (await tx.get(ctx.ref.war(warId))).data();
    if (!war || war.type !== 'bet') fail('not-found', 'Bahis bulunamadı.');
    const deadline = Number(war.startsAtMs || 0) + GANG.BET_INTEL_WINDOW_MS;
    if (!['accepted', 'active'].includes(war.status) || ctx.now >= deadline) fail('failed-precondition', 'Bu bahse artık müdahale edilemez (ilk saldırı dilimi bitti).');
    return war;
  }

  async function reportBet(ctx, data) {
    const warId = String(data.warId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const war = await readBetForIntel(tx, ctx, warId);
      if (!membership.gangId || !war.gangIds.includes(membership.gangId)) fail('permission-denied', 'Bu bahis senin çetenin değil.');
      const [meSnap, rosterSnap, repSnap] = await Promise.all([
        tx.get(ctx.ref.member(membership.gangId, ctx.actorId)),
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.betReport(warId)),
      ]);
      if (!atLeast(core.effRank(meSnap.data(), ctx), 'tetikci')) fail('permission-denied', 'Bahsi ihbar etmek için çetende en az Tetikçi olmalısın.');
      if (repSnap.exists) fail('already-exists', 'Bu bahis zaten ihbar edildi.');
      const [a, b] = war.gangIds;
      tx.set(ctx.ref.betReport(warId), {
        warId,
        gangIds: war.gangIds,
        names: { [a]: war.sides?.[a]?.name || '', [b]: war.sides?.[b]?.name || '' },
        logos: { [a]: war.sides?.[a]?.logo || null, [b]: war.sides?.[b]?.logo || null },
        dateKey: war.dateKey,
        startsAtMs: war.startsAtMs,
        intelDeadlineMs: Number(war.startsAtMs || 0) + GANG.BET_INTEL_WINDOW_MS,
        reportedByCode: rosterSnap.data().codeName,
        reportedAtMs: ctx.now,
        leaked: false,
        pot: null,
        opStarted: false,
      });
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.BET_REPORT_PRESTIGE) });
      core.intelStat(tx, ctx, rid, { betReports: 1 });
      announceIntel(tx, ctx, '🎲', `${rosterSnap.data().codeName}, ${war.sides?.[a]?.name} ⚔️ ${war.sides?.[b]?.name} bahisli savaşını ihbar etti.`);
      ctx.logs.push({ gang: 'intel_bet_report', world: ctx.worldId, warId });
      return { reported: true, prestige: INTEL.BET_REPORT_PRESTIGE };
    });
  }

  async function leakBet(ctx, data) {
    const warId = String(data.warId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const war = await readBetForIntel(tx, ctx, warId);
      if (!membership.gangId || !war.gangIds.includes(membership.gangId)) fail('permission-denied', 'Bu bahis senin çetenin değil.');
      const [meSnap, rosterSnap, repSnap, stake] = await Promise.all([
        tx.get(ctx.ref.member(membership.gangId, ctx.actorId)),
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.betReport(warId)),
        core.readBetStake(tx, ctx, warId, war),
      ]);
      if (!repSnap.exists) fail('failed-precondition', 'Önce bahis ihbar edilmeli.');
      if (!atLeast(core.effRank(meSnap.data(), ctx), 'kidemli')) fail('permission-denied', 'Bahsin içeriğini açmak için çetende en az Kıdemli olmalısın.');
      if (repSnap.data().leaked) fail('already-exists', 'Bu bahsin içeriği zaten açıldı.');
      const pot = stake * 2;
      tx.update(ctx.ref.betReport(warId), { leaked: true, pot, leakedByCode: rosterSnap.data().codeName, leakedAtMs: ctx.now });
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.BET_LEAK_PRESTIGE) });
      core.intelStat(tx, ctx, rid, { betLeaks: 1 });
      announceIntel(tx, ctx, '📦', `${rosterSnap.data().codeName} bahsin içeriğini açtı — toplam bahis ${pot.toLocaleString('tr-TR')}.`);
      return { leaked: true, pot, prestige: INTEL.BET_LEAK_PRESTIGE };
    });
  }

  async function startBetOperation(ctx, data) {
    const warId = String(data.warId || '');
    return core.db.runTransaction(async (tx) => {
      const guard = await core.requestGuard(tx, ctx, data.requestId);
      if (guard.done) return guard.result;
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const war = await readBetForIntel(tx, ctx, warId);
      const [me, repSnap] = await Promise.all([tx.get(ctx.ref.roster(rid)), tx.get(ctx.ref.betReport(warId))]);
      if (!['baskan', 'sef'].includes(core.effRank(me.data(), ctx, 'muhbir'))) fail('permission-denied', 'Operasyonu sadece Emniyet Genel Müdürü ve Emniyet Amirleri başlatabilir.');
      if (!repSnap.exists) fail('failed-precondition', 'Önce bahis ihbar edilmeli.');
      if (repSnap.data().opStarted) fail('already-exists', 'Bu bahse zaten operasyon var.');
      const price = INTEL.BET_OP_PRICE;
      // v108: operasyon ücretini DEVLET öder (İstihbarat kasası kapandı)
      core.stateTx(tx, ctx, 'out', 'ist_operasyon', price);
      tx.update(ctx.ref.betReport(warId), { opStarted: true, opByCode: me.data().codeName, opAtMs: ctx.now, opCost: price });
      core.ledger(tx, ctx, { type: 'intel_bet_op_cost', amount: price, from: { kind: 'state', id: 'main' }, to: { kind: 'burn' }, refId: warId });
      const [a, b] = war.gangIds;
      const started = ctx.now >= Number(war.startsAtMs || 0);
      if (started && !war.sides?.intel) {
        // Savaş zaten başladıysa İstihbarat hemen 3. taraf olur; çeteler şimdi öğrenir.
        tx.update(ctx.ref.war(warId), { 'sides.intel': { orgType: 'intel', orgId: 'main', name: INTEL.NAME, logo: INTEL.LOGO, role: 'intel' }, intelInvolved: true });
        for (const g of [a, b]) core.announce(tx, ctx, g, '🚓', `Polis ${war.sides?.[a]?.name} ⚔️ ${war.sides?.[b]?.name} bahisli savaşına dahil oldu! Artık 3 taraf var — en güçlü taraf tüm bahsi alır.`);
      }
      announceIntel(tx, ctx, '🎯', `${me.data().codeName}, ${war.sides?.[a]?.name} ⚔️ ${war.sides?.[b]?.name} bahsine operasyon başlattı (${price.toLocaleString('tr-TR')} — devlet öder). ${started ? 'Savaşa hemen katılabiliriz.' : 'Savaş başlayınca 3 taraflı olur.'}`);
      ctx.logs.push({ gang: 'intel_bet_op', world: ctx.worldId, warId });
      const res = { started: true, price };
      guard.save(res);
      return res;
    });
  }

  // ---------------------------------------------------------------------------
  // v109 — SOYGUN DURDURMA ÖDÜLÜ (functions/index.js executeHeistPlan →
  // system.onPoliceBust): teşkilat prestiji + sicil (durdurduğu soygun,
  // kurtarılan altın, soygun payı). İdempotent: refId (plan) + oyuncu.
  // Polis teşkilatta değilse (olmamalı — uzlaştırma düzeltir) prestij yazılmaz.
  // ---------------------------------------------------------------------------
  async function awardPoliceBust(ctx, actorId, { recovered = 0, earned = 0, prestige = 0, refId = '' } = {}) {
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, actorId);
      if (!membership.intelRosterId) return { skipped: 'not_member' };
      const rid = membership.intelRosterId;
      const markRef = ctx.ref.request(`bust_${actorId}_${String(refId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`);
      const [mark, roster] = await Promise.all([tx.get(markRef), tx.get(ctx.ref.roster(rid))]);
      if (mark.exists || !roster.exists) return { skipped: 'dup' };
      const p = Math.max(0, Math.floor(Number(prestige) || 0));
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(p), lastActiveAtMs: ctx.now });
      core.intelStat(tx, ctx, rid, { heistsStopped: 1, goldRecovered: recovered, goldEarned: earned, bustPrestige: p });
      tx.set(markRef, { atMs: ctx.now, prestige: p });
      // v111: teşkilat sohbetine "X bir soygunu durdurdu" yazılmaz — polisin kimliğini ele verebilir
      ctx.logs.push({ gang: 'prestige', world: ctx.worldId, event: 'police_bust', amount: p });
      return { prestige: p };
    });
  }

  // ---------------------------------------------------------------------------
  // KARAR PANELİ — İstihbarat üyesi Mafya Babası olduysa sonraki 00:00'a kadar:
  //  'disband' → çete dağıtılır (tüm üyeler atılır), çökertme prestiji
  //  'stay'    → İstihbarattan (sessizce) ayrılır, Baba olarak devam
  // Karar verilmezse 00:00'da 'stay' uygulanır (bkz. clock).
  // ---------------------------------------------------------------------------
  async function intelDecision(ctx, data) {
    const choice = data.choice;
    if (!['disband', 'stay'].includes(choice)) fail('invalid-argument', 'Geçersiz seçim.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!membership.gangId || membership.intelDecisionGangId !== membership.gangId) fail('failed-precondition', 'Bekleyen bir karar yok.');
      if (membership.intelDecisionDeadline && ctx.dateKey >= membership.intelDecisionDeadline) fail('deadline-exceeded', 'Karar süresi doldu.');
      const gangId = membership.gangId;
      const [gangSnap, meSnap] = await Promise.all([tx.get(ctx.ref.gang(gangId)), tx.get(ctx.ref.member(gangId, ctx.actorId))]);
      const plan = choice === 'stay' ? await planIntelLeave(tx, ctx, membership) : null;
      if (meSnap.data()?.rank !== 'baba' || gangSnap.data()?.status !== 'active') fail('failed-precondition', 'Artık Mafya Babası değilsin.');
      if (choice === 'stay') {
        applyIntelLeave(tx, ctx, plan, { notifyText: '🚪 Çetenin başında kalmayı seçtin — polislikten ayrıldın.' });
        return { choice };
      }
      const gang = gangSnap.data();
      tx.update(ctx.ref.gang(gangId), { status: 'disbanded', dissolvedReason: 'intel_takedown', dissolvedAtMs: ctx.now, cleanupDone: false });
      if (gang.nameKey) tx.delete(ctx.ref.gangName(gang.nameKey));
      tx.update(ctx.ref.roster(rid), { prestige: FV.increment(INTEL.TAKEDOWN_PRESTIGE) });
      tx.set(ctx.ref.membership(ctx.actorId), { intelDecisionGangId: null, intelDecisionDeadline: null }, { merge: true });
      // v40: kimin teslim ettiği kimseye söylenmez (kod adı dahil) — sadece çetenin çökertildiği duyurulur
      announceIntel(tx, ctx, '💥', `${gang.name} çetesi çökertildi ve polise teslim edildi! Çetenin kasasına devlet adına el konuluyor.`);
      ctx.logs.push({ gang: 'intel_takedown', world: ctx.worldId, gangId });
      ctx.afterCommit.push(() => core.cleanupGang(ctx, gangId));
      return { choice, gangId };
    });
  }

  // ---------------------------------------------------------------------------
  // İSTİHBARAT ATMA SİSTEMİ (devirme/ayaklanma YOK)
  //  - Anında: Başkan → Ajan / Muhbir; Şef → Muhbir.
  //  - Oylama: Başkan ve Şef doğrudan atamadıkları herkes için (Şef, Başkan'ı
  //    da oylamaya götürebilir); Uzman, Başkan hariç herkes için.
  //  - Başkan için > %66, diğerleri için ≥ %51 evet gerekir. Başarısız
  //    oylamada hiçbir şey değişmez. Atılanın yeri 00:00'da dolar (rütbe).
  //  - Talep 00:00'a kadar gizli/iptal edilebilir; oylama 00:00'da başlar,
  //    24 saat sürer; oy hakkı o anki Başkan + Şefler + Uzmanlar (snapshot).
  // ---------------------------------------------------------------------------
  const DIRECT_KICK = { baskan: ['ajan', 'muhbir'], sef: ['muhbir'] };
  function intelKickVoteAllowed(initRank, targetRank) {
    if (!targetRank) return false;
    if (initRank === 'baskan' || initRank === 'sef') return !(DIRECT_KICK[initRank] || []).includes(targetRank);
    if (initRank === 'uzman') return targetRank !== 'baskan';
    return false;
  }
  function intelVoteOutcome(vote) {
    const yes = Number(vote.yes || 0);
    const no = Number(vote.no || 0);
    const total = yes + no;
    const ratio = total > 0 ? yes / total : 0;
    const passed = total > 0 && (vote.targetWasBaskan ? ratio > INTEL.KICK_BASKAN_MIN_RATIO_EXCLUSIVE : ratio >= INTEL.KICK_MIN_RATIO);
    return { passed, ratio };
  }

  async function removeFromIntel(tx, ctx, rosterId, roster, reasonText) {
    const link = await tx.get(linkRef(ctx, rosterId));
    const actorId = link.data()?.actorId || null;
    const ms = actorId ? await readMembership(tx, ctx, actorId) : null;
    const user = actorId ? await readPoliceUser(tx, ctx, actorId) : null;
    return () => {
      if (!actorId || !ms || ms.intelRosterId !== rosterId) {
        // bağlantı yoksa sadece roster temizliği
        tx.delete(ctx.ref.roster(rosterId));
        tx.delete(linkRef(ctx, rosterId));
        if (roster?.codeName) tx.delete(ctx.ref.codeName(core.nameKeyOf(roster.codeName)));
        tx.set(ctx.ref.intel(), { memberCount: FV.increment(-1) }, { merge: true });
        return;
      }
      applyIntelLeave(tx, ctx, { rosterId, roster, actorId, membership: ms, user }, { actorId, notifyText: `${reasonText} ${INTEL.REJOIN_COOLDOWN_MS / 3_600_000} saat boyunca yeniden başvuru yapamazsın.` });
    };
  }

  // v61 — istismar önlemi: az üyeyle (≤7) kimse atılamaz; yeni katılan üye
  // katıldığı günün 00:00'ına kadar atılamaz (ör. 23:00'te giren 00:00'dan sonra).
  function kickBlockReason(ctx, rosterSize, target) {
    if (rosterSize < INTEL.KICK_MIN_MEMBERS) return `Teşkilatta ${INTEL.KICK_MIN_MEMBERS - 1} ya da daha az polis varken kimse çıkarılamaz.`;
    if (target && Number(target.joinedAtMs || 0) > 0 && dateKeyOf(Number(target.joinedAtMs)) === ctx.dateKey) return "Yeni katılan polis 00:00'a kadar çıkarılamaz.";
    return null;
  }

  async function kickIntelMember(ctx, data) {
    const targetRosterId = String(data.targetRosterId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!targetRosterId || targetRosterId === rid) fail('invalid-argument', 'Geçersiz üye.');
      const [me, target, rosterSnap] = await Promise.all([tx.get(ctx.ref.roster(rid)), tx.get(ctx.ref.roster(targetRosterId)), tx.get(ctx.ref.rosterCol())]);
      if (!target.exists) fail('failed-precondition', 'Bu polis artık teşkilatta değil.');
      if (!(DIRECT_KICK[core.effRank(me.data(), ctx, 'muhbir')] || []).includes(target.data().rank)) fail('permission-denied', 'Bu üyeyi doğrudan atamazsın (oylama gerekir).');
      const blocked = kickBlockReason(ctx, rosterSnap.size, target.data());
      if (blocked) fail('failed-precondition', blocked);
      const apply = await removeFromIntel(tx, ctx, targetRosterId, target.data(), '🚫 Polis Teşkilatından atıldın ve polislikten alındın. Prestijin silindi.');
      apply();
      announceIntel(tx, ctx, '🚫', `${target.data().codeName}, ${me.data().codeName} tarafından teşkilattan atıldı.`);
      return { kicked: true };
    });
  }

  // v33: oylama 00:00–12:00 arasında başlatılır, ANINDA başlar, o gecenin
  // 00:00'ında biter. Oy hakkı başladığı andaki Başkan + Şefler + Uzmanlar.
  async function requestIntelKickVote(ctx, data) {
    const targetRosterId = String(data.targetRosterId || '');
    if (ctx.hour >= GANG.VOTE_START_DEADLINE_HOUR) fail('deadline-exceeded', 'Oylama sadece 00:00–12:00 arasında başlatılabilir.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      if (!targetRosterId || targetRosterId === rid) fail('invalid-argument', 'Geçersiz hedef.');
      const lockRef = ctx.ref.intelVoteLock(targetRosterId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80));
      const [me, target, act, rosterSnap, lockSnap] = await Promise.all([
        tx.get(ctx.ref.roster(rid)),
        tx.get(ctx.ref.roster(targetRosterId)),
        tx.get(ctx.ref.intelVotes().where('status', '==', 'active')),
        tx.get(ctx.ref.rosterCol()),
        tx.get(lockRef),
      ]);
      if (!target.exists) fail('failed-precondition', 'Bu polis artık teşkilatta değil.');
      if (!intelKickVoteAllowed(core.effRank(me.data(), ctx, 'muhbir'), target.data().rank)) fail('permission-denied', 'Bu üye için çıkarma oylaması başlatamazsın.');
      const blocked = kickBlockReason(ctx, rosterSnap.size, target.data());
      if (blocked) fail('failed-precondition', blocked);
      if (act.docs.some((d) => d.data().targetRosterId === targetRosterId)) fail('already-exists', 'Bu üye için zaten bir oylama var.');
      if (lockSnap.exists && Number(lockSnap.data().endsAtMs || 0) > ctx.now) {
        const lv = (await tx.get(ctx.ref.intelVotes().doc(lockSnap.data().voteId))).data();
        if (lv?.status === 'active') fail('already-exists', 'Bu üye için zaten bir oylama var.');
      }
      const voters = rosterSnap.docs.filter((d) => ['baskan', 'sef', 'uzman'].includes(d.data().rank)).map((d) => d.id);
      const endsAtMs = midnightMsOf(addDays(ctx.dateKey, 1));
      const vRef = ctx.ref.intelVotes().doc();
      tx.set(vRef, {
        type: 'kick',
        status: 'active',
        initiatorCode: me.data().codeName,
        targetRosterId,
        targetCode: target.data().codeName,
        targetWasBaskan: target.data().rank === 'baskan',
        voterIds: voters,
        yes: 0,
        no: 0,
        votedCount: 0,
        startsAtMs: ctx.now,
        endsAtMs,
      });
      tx.set(lockRef, { voteId: vRef.id, endsAtMs });
      // v39: hedef oylama bitene kadar Muhbir yetkisinde
      tx.update(ctx.ref.roster(targetRosterId), { underVoteUntilMs: Math.max(Number(target.data().underVoteUntilMs || 0), endsAtMs) });
      return { voteId: vRef.id };
    });
  }

  async function cancelIntelVoteRequest(ctx, data) {
    const pendingId = String(data.pendingId || '');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const ref = ctx.ref.intelPending().doc(pendingId);
      const p = (await tx.get(ref)).data();
      if (!p || p.initiatorRosterId !== rid) fail('not-found', 'Talep bulunamadı.');
      if (p.status !== 'pending') fail('failed-precondition', 'Bu talep artık iptal edilemez.');
      tx.update(ref, { status: 'cancelled', cancelReason: 'by_initiator' });
      return { cancelled: true };
    });
  }

  async function castIntelVote(ctx, data) {
    const voteId = String(data.voteId || '');
    const choice = data.choice === 'yes' ? 'yes' : data.choice === 'no' ? 'no' : null;
    if (!choice) fail('invalid-argument', 'Geçersiz oy.');
    return core.db.runTransaction(async (tx) => {
      const membership = await readMembership(tx, ctx, ctx.actorId);
      const rid = requireIntel(membership);
      const voteRef = ctx.ref.intelVotes().doc(voteId);
      const [voteSnap, ballotSnap] = await Promise.all([tx.get(voteRef), tx.get(ctx.ref.intelBallot(voteId, rid))]);
      const vote = voteSnap.data();
      if (!vote) fail('not-found', 'Oylama bulunamadı.');
      if (vote.status !== 'active' || ctx.now >= vote.endsAtMs) fail('deadline-exceeded', 'Oylama kapandı.');
      if (!(vote.voterIds || []).includes(rid)) fail('permission-denied', 'Bu oylamada oy hakkın yok.');
      if (ballotSnap.exists) fail('already-exists', 'Oyunu zaten kullandın.');
      tx.set(ctx.ref.intelBallot(voteId, rid), { choice, atMs: ctx.now });
      tx.update(voteRef, { [choice]: FV.increment(1), votedCount: FV.increment(1) });
      // v52: bu oyla sonuç kesinleştiyse oylama hemen sonuçlandırılır (bkz. system.js)
      const after = { ...vote, [choice]: Number(vote[choice] || 0) + 1, votedCount: Number(vote.votedCount || 0) + 1 };
      return { voted: true, voteId, decided: Boolean(decidedOutcome(after, intelVoteOutcome)) };
    });
  }

  // Tek bir İstihbarat oylamasını sonuçlandırır. early=true → süre dolmadan,
  // sonuç KESİNLEŞTİĞİ için (v52); kesinlik işlem içinde yeniden doğrulanır.
  function resolveOneIntelVote(ctx, ref, { early = false } = {}) {
    return core.db.runTransaction(async (tx) => {
          const d = { ref };
          const vote = (await tx.get(d.ref)).data();
          if (!vote || vote.status !== 'active') return { skipped: true };
          const endedEarly = vote.endsAtMs > ctx.now;
          if (endedEarly && !(early && decidedOutcome(vote, intelVoteOutcome))) return { skipped: true };
          const [target, rosterSnap] = await Promise.all([tx.get(ctx.ref.roster(vote.targetRosterId)), tx.get(ctx.ref.rosterCol())]);
          const { passed, ratio } = intelVoteOutcome(vote);
          const pct = `%${Math.round(ratio * 100)}${endedEarly ? ' · sonuç kesinleşti, oylama erken bitti' : ''}`;
          const result = { passed, ratio, yes: vote.yes || 0, no: vote.no || 0, endedEarly };
          if (!target.exists) {
            tx.update(d.ref, { status: 'cancelled', cancelReason: 'member_left', resolvedAtMs: ctx.now, result });
            return { cancelled: true };
          }
          // v61: sonuçlanma anında üye sayısı 7 ya da altına düştüyse çıkarma uygulanmaz
          if (passed && rosterSnap.size < INTEL.KICK_MIN_MEMBERS) {
            tx.update(d.ref, { status: 'cancelled', cancelReason: 'min_members', resolvedAtMs: ctx.now, result });
            if (Number(target.data().underVoteUntilMs || 0) > ctx.now) tx.update(ctx.ref.roster(vote.targetRosterId), { underVoteUntilMs: 0 });
            announceIntel(tx, ctx, '🗳️', `${vote.targetCode} için çıkarma oylaması geçti ama teşkilatta ${INTEL.KICK_MIN_MEMBERS - 1} ya da daha az polis kaldığı için uygulanmadı.`);
            return { cancelled: true, reason: 'min_members' };
          }
          let apply = null;
          if (passed) apply = await removeFromIntel(tx, ctx, vote.targetRosterId, target.data(), `🗳️ Oylama sonucu Polis Teşkilatından çıkarıldın ve polislikten alındın (${pct}).`);
          tx.update(d.ref, { status: 'resolved', resolvedAtMs: ctx.now, result });
          if (apply) apply();
          // v52: erken bittiyse ve hedef kaldıysa "oylama altında (Muhbir yetkisi)" durumu biter
          else if (endedEarly && Number(target.data().underVoteUntilMs || 0) > ctx.now) tx.update(ctx.ref.roster(vote.targetRosterId), { underVoteUntilMs: 0 });
          announceIntel(tx, ctx, '🗳️', passed ? `${vote.targetCode} oylamayla teşkilattan çıkarıldı (${pct}).` : `${vote.targetCode} için çıkarma oylaması reddedildi (${pct}).`);
          return { resolved: true, passed };
    });
  }

  // 00:00: biten oylamalar sonuçlanır, bekleyen talepler (geçerliyse) başlar.
  async function resolveIntelVotes(ctx, safe) {
    const act = await ctx.ref.intelVotes().where('status', '==', 'active').get();
    for (const d of act.docs) {
      if (d.data().endsAtMs > ctx.now) continue;
      await safe(ctx, `intel-vote:${d.id}`, () => resolveOneIntelVote(ctx, d.ref));
    }
  }

  // v52: oy verildiği anda sonuç kesinleştiyse hemen sonuçlandır + kod adı listesini yenile
  async function resolveIntelVoteEarly(ctx, voteId) {
    const res = await resolveOneIntelVote(ctx, ctx.ref.intelVotes().doc(voteId), { early: true });
    if (!res?.skipped) await core.refreshIntelRoster(ctx);
    return res;
  }

  async function startIntelPendingVotes(ctx) {
    return core.db.runTransaction(async (tx) => {
        const [pendSnap, rosterSnap, actSnap] = await Promise.all([
          tx.get(ctx.ref.intelPending().where('status', '==', 'pending')),
          tx.get(ctx.ref.rosterCol()),
          tx.get(ctx.ref.intelVotes().where('status', '==', 'active')),
        ]);
        const roster = new Map(rosterSnap.docs.map((d) => [d.id, d.data()]));
        const voters = [...roster.entries()].filter(([, r]) => ['baskan', 'sef', 'uzman'].includes(r.rank)).map(([id]) => id);
        const pend = pendSnap.docs.map((d) => ({ ref: d.ref, ...d.data() })).filter((p) => p.requestedAtMs < ctx.now);
        pend.sort((a, b) => a.requestedAtMs - b.requestedAtMs);
        const started = new Set(actSnap.docs.map((d) => d.data().targetRosterId));
        for (const p of pend) {
          const ini = roster.get(p.initiatorRosterId);
          const tgt = roster.get(p.targetRosterId);
          if (!ini || !tgt || started.has(p.targetRosterId) || !intelKickVoteAllowed(ini.rank, tgt.rank) || kickBlockReason(ctx, roster.size, tgt)) {
            tx.update(p.ref, { status: 'cancelled', cancelReason: 'invalid_at_midnight' });
            continue;
          }
          started.add(p.targetRosterId);
          const vRef = ctx.ref.intelVotes().doc();
          tx.set(vRef, {
            type: 'kick',
            status: 'active',
            initiatorCode: ini.codeName,
            targetRosterId: p.targetRosterId,
            targetCode: tgt.codeName,
            targetWasBaskan: tgt.rank === 'baskan',
            voterIds: voters,
            yes: 0,
            no: 0,
            votedCount: 0,
            startsAtMs: ctx.now,
            endsAtMs: ctx.now + 24 * 3600_000,
          });
          tx.update(p.ref, { status: 'started', voteId: vRef.id });
          tx.update(ctx.ref.roster(p.targetRosterId), { underVoteUntilMs: ctx.now + 24 * 3600_000 }); // v39
        }
    });
  }

  return {
    planIntelLeave,
    applyIntelLeave,
    joinIntel,
    leaveIntel,
    changeCodeName,
    kickIntelMember,
    requestIntelKickVote,
    cancelIntelVoteRequest,
    castIntelVote,
    intelKickVoteAllowed,
    intelVoteOutcome,
    updateIntelNote,
    intelMemberReport,
    sendIntelChat,
    reportTruck,
    leakTruck,
    reportBet,
    leakBet,
    startBetOperation,
    intelDecision,
    awardPoliceBust,
    readPoliceUser,
    setPoliceProfession,
    enrollIntelTx,
    parseCodeName,
    intelDefaults,
    applyIntel,
    cancelIntelApplication,
    reviewIntelApplication,
    updateIntelForm,
    settleIntelApplications,
    reviewRanksOf,
    joinBlockReason,
    intelStateDefaults,
    resolveIntelVotes,
    resolveIntelVoteEarly,
    startIntelPendingVotes,
    linkRef,
  };
}
