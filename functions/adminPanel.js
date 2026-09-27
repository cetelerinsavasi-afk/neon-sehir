// =============================================================================
// adminPanel.js — UGC Moderasyonu Faz D3: Oyun içi Yönetim Paneli (sunucu)
// =============================================================================
//
// Tek giriş noktası: adminAction({ action, payload }) callable'ı. Her çağrıda
// isteği yapanın rolü SUNUCUDA okunur (users/{uid}.role — bu alanı istemci
// yazamaz; users koleksiyonu kurallarda write:false). Yetki tablosu ACTIONS
// içinde; her eylem admin_logs'a denetim kaydı yazar.
//
// Roller (katmanlı — onaylı):
//   moderator: şikâyet kuyruğu (kapat / içeriği kaldır / geri al), uyarı,
//              susturma (en fazla 7 gün) ve susturma kaldırma, oyuncu arama,
//              işlem geçmişi.
//   admin    : moderatörün her şeyi + 30 günlük susturma, ban / ban kaldırma,
//              rol verme / alma.
//   İlk admin: functions/index.js ADMIN_UIDS listesindeki uid'ler her zaman
//              admin sayılır (ilk çağrıda users/{uid}.role = 'admin' yazılır).
//
// Koleksiyonlar (hepsini YALNIZCA sunucu yazar):
//   admin_logs/{auto}  — { action, actorUid, actorName, actorRole, targetUid,
//                          targetName, targetPath, targetType, reason, details, atMs, createdAt }
//   bans/{uid}         — { active, untilMs, permanent, reason, byUid, byName,
//                          createdAtMs, prevMute, liftedAtMs?, liftedBy? }
//   mutes/{uid}        — D1 şeması; ban süresince level:'ban' (yazı yasağı anında başlar)
//   reports/{id}       — D1; status: open → dismissed | actioned
//
// Ban = Firebase Auth hesabı kapatılır + oturumlar iptal edilir (onaylı).
// Süreli banlar adminBanSweep (saatlik) ile kendiliğinden kalkar.
// "İçeriği kaldır" = kalıcı gizleme (hidden:true, hiddenBy:'moderator');
// ad/isim türleri varsayılana sıfırlanır. Hiçbir şey fiziksel olarak silinmez.
// =============================================================================

export const STAFF_ROLES = ['admin', 'moderator'];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const MUTE_DURATIONS = { '1h': HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };
export const BAN_DURATIONS = { '1d': DAY, '7d': 7 * DAY, '30d': 30 * DAY, permanent: null };
const MODERATOR_MUTE_KEYS = ['1h', '24h', '7d'];
export const ADMIN_LIMITS = { REASON_MAX: 200, WARN_MAX: 300, SEARCH_MAX: 20, LOG_PAGE: 50, QUEUE_GROUPS: 100, REPORT_RETENTION_DAYS: 365, PURGE_BATCH: 400 };
const HIDEABLE = ['globalChat', 'sixtagramPost', 'sixtagramComment', 'gangChat', 'gangGlobalChat', 'intelChat', 'feedback'];
const DEFAULT_PLAYER_NAME = 'Oyuncu';

// D4 — oyuncuya giden bilgilendirme SMS'leri için etiketler
export const REASON_LABELS = {
  hakaret: 'hakaret / küfür',
  taciz: 'taciz / zorbalık',
  nefret: 'nefret söylemi / ayrımcılık',
  cinsel: 'cinsel / müstehcen içerik',
  kisisel_bilgi: 'kişisel bilgi paylaşımı',
  spam_dolandiricilik: 'spam / dolandırıcılık',
  gercek_para: 'gerçek parayla alım-satım',
  diger: 'topluluk kurallarına aykırılık',
};
const DURATION_LABELS = { '1h': '1 saat', '24h': '24 saat', '7d': '7 gün', '30d': '30 gün', '1d': '1 gün', permanent: 'süresiz' };
// "Topluluk kurallarına aykırı bulunduğu için … kaldırıldı" cümlesindeki içerik adı
const CONTENT_NOUNS = {
  globalChat: 'ChatsApp mesajın',
  sixtagramPost: 'Sixtagram gönderin',
  sixtagramComment: 'Sixtagram yorumun',
  gangChat: 'çete sohbetindeki mesajın',
  gangGlobalChat: 'Tüm Çeteler sohbetindeki mesajın',
  intelChat: 'İstihbarat sohbetindeki mesajın',
  feedback: 'önerin',
  bubble: 'konuşma balonun',
  user: 'oyun içi adın',
  gang: 'çetenin adı ve notu',
  factory: 'fabrikanın adı',
  vehicleName: 'aracının adı',
  heistNote: 'soygun notun',
  beggarNote: 'dilenci notun',
  nasihat: 'nasihatin',
};
const WARNING_TAIL = ' Bu bir uyarıdır; tekrarlanırsa hesabın kısıtlanabilir.';

const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const nameKeyOfGang = (name) => name.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').replace(/[/.#$[\]]/g, '_');
const fmtUntil = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));

// deps: { db, auth, FieldValue, HttpsError, requireAuth, onCall, bootstrapAdminUids, reportTargets, banUntilMs, now? }
export function createAdminPanel({ db, auth, FieldValue, HttpsError, requireAuth, onCall, bootstrapAdminUids = [], reportTargets, banUntilMs, now = () => Date.now(), shop = null }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const isBootstrap = (uid) => bootstrapAdminUids.includes(uid);
  const roleOf = (uid, userData) => (isBootstrap(uid) ? 'admin' : STAFF_ROLES.includes(userData?.role) ? userData.role : null);
  const userRef = (uid) => db.collection('users').doc(uid);

  // ---- Yetki ------------------------------------------------------------------
  async function getActor(uid) {
    const snap = await userRef(uid).get();
    const data = snap.data() || {};
    const role = roleOf(uid, data);
    if (!role) fail('permission-denied', 'Bu işlem için yetkin yok.');
    // İlk admin: rol alanını bir kez yaz — istemci paneli ve rules aynı alana bakar
    if (isBootstrap(uid) && data.role !== 'admin' && snap.exists) await userRef(uid).update({ role: 'admin' });
    return { uid, role, name: data.displayName || DEFAULT_PLAYER_NAME };
  }

  async function loadTarget(uid) {
    if (!isUid(uid)) fail('invalid-argument', 'Geçersiz oyuncu.');
    const snap = await userRef(uid).get();
    if (!snap.exists) fail('not-found', 'Oyuncu bulunamadı.');
    const data = snap.data() || {};
    return { uid, data, name: data.displayName || DEFAULT_PLAYER_NAME, role: roleOf(uid, data) };
  }

  // Yaptırım kuralı: kendine yok; admin'e yok; moderatöre sadece admin.
  function assertCanSanction(actor, target) {
    if (target.uid === actor.uid) fail('failed-precondition', 'Kendine bu işlemi uygulayamazsın.');
    if (target.role === 'admin') fail('permission-denied', 'Bir yöneticiye bu işlem uygulanamaz.');
    if (target.role === 'moderator' && actor.role !== 'admin') fail('permission-denied', 'Moderatörlere yalnızca yöneticiler işlem yapabilir.');
  }

  // ---- Denetim kaydı ------------------------------------------------------------
  function logEntry(actor, action, extra = {}) {
    return {
      action,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      targetUid: extra.targetUid || null,
      targetName: extra.targetName || null,
      targetPath: extra.targetPath || null,
      targetType: extra.targetType || null,
      reason: extra.reason || null,
      details: extra.details || {},
      atMs: now(),
      createdAt: FieldValue.serverTimestamp(),
    };
  }
  // İstemciye dönen kayıt (serverTimestamp alanı olmadan)
  function publicLog(d) {
    const x = d.data();
    return { id: d.id, action: x.action, actorUid: x.actorUid, actorName: x.actorName, actorRole: x.actorRole, targetUid: x.targetUid, targetName: x.targetName, targetPath: x.targetPath, targetType: x.targetType, reason: x.reason, details: x.details || {}, atMs: x.atMs, targetDeleted: Boolean(x.targetDeleted), actorDeleted: Boolean(x.actorDeleted) };
  }
  const writeLog = (actor, action, extra) => db.collection('admin_logs').add(logEntry(actor, action, extra));

  function sms(writer, uid, text) {
    writer.set(userRef(uid).collection('messages').doc(), {
      text,
      from: 'Moderasyon',
      type: 'moderation',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // ---- Şikâyet kuyruğu --------------------------------------------------------
  async function listReports(actor, p) {
    const status = ['open', 'dismissed', 'actioned'].includes(p.status) ? p.status : 'open';
    const snap = await db.collection('reports').where('status', '==', status).get();
    const groups = new Map();
    for (const d of snap.docs) {
      const r = d.data();
      let g = groups.get(r.targetPath);
      if (!g) {
        g = { targetPath: r.targetPath, targetType: r.targetType, targetUid: r.targetUid || null, textSnapshot: r.textSnapshot || '', reasons: {}, notes: [], reporterCount: 0, eligibleCount: 0, firstAtMs: r.createdAtMs, lastAtMs: r.createdAtMs, platforms: {}, resolution: r.resolution || null, resolvedAtMs: r.resolvedAtMs || null, resolvedByName: r.resolvedByName || null };
        groups.set(r.targetPath, g);
      }
      g.reporterCount += 1;
      if (r.eligible) g.eligibleCount += 1;
      g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
      g.platforms[r.platform || 'web'] = true;
      if (r.note && g.notes.length < 5) g.notes.push(r.note);
      if (r.createdAtMs < g.firstAtMs) g.firstAtMs = r.createdAtMs;
      if (r.createdAtMs >= g.lastAtMs) {
        g.lastAtMs = r.createdAtMs;
        g.textSnapshot = r.textSnapshot || g.textSnapshot;
      }
    }
    const sortKey = status === 'open' ? (g) => g.reporterCount * 1e13 + g.lastAtMs : (g) => g.resolvedAtMs || g.lastAtMs;
    const list = [...groups.values()].sort((a, b) => sortKey(b) - sortKey(a)).slice(0, ADMIN_LIMITS.QUEUE_GROUPS);
    await Promise.all(
      list.map(async (g) => {
        const [t, u] = await Promise.all([db.doc(g.targetPath).get(), g.targetUid ? userRef(g.targetUid).get() : null]);
        g.exists = t.exists;
        g.hidden = Boolean(t.data()?.hidden);
        g.hiddenBy = t.data()?.hiddenBy || null;
        g.targetName = u?.data()?.displayName || (g.targetUid ? DEFAULT_PLAYER_NAME : null);
        g.hideable = HIDEABLE.includes(g.targetType);
      })
    );
    return { status, groups: list, total: groups.size };
  }

  async function openReportsFor(path) {
    const snap = await db.collection('reports').where('targetPath', '==', path).get();
    return snap.docs.filter((d) => d.data().status === 'open');
  }

  function validatedMatch(type, path) {
    const spec = reportTargets[type];
    const m = spec && String(path).match(spec.re);
    if (!m) fail('invalid-argument', 'Geçersiz içerik yolu.');
    return m;
  }

  // İçeriği kaldır: gizlenebilir türler gizlenir, diğerleri varsayılana döner.
  // Dönüş: { mode, before } — before, denetim kaydında saklanır.
  async function removeContent(actor, type, path, targetUid) {
    const m = validatedMatch(type, path);
    const ref = db.doc(path);
    if (HIDEABLE.includes(type)) {
      const s = await ref.get();
      if (!s.exists) return { mode: 'missing' };
      await ref.update({ hidden: true, hiddenBy: 'moderator', hiddenAt: FieldValue.serverTimestamp(), moderatedBy: actor.uid });
      return { mode: 'hidden' };
    }
    const s = await ref.get();
    if (!s.exists) return { mode: 'missing' };
    const d = s.data() || {};
    switch (type) {
      case 'bubble':
        await ref.update({ chatText: null });
        return { mode: 'reset', before: d.chatText || null };
      case 'user': {
        const uid = m[1];
        await db.runTransaction(async (tx) => {
          const cur = (await tx.get(userRef(uid))).data() || {};
          if (cur.displayNameKey) {
            const nameRef = db.collection('usernames').doc(cur.displayNameKey);
            const n = await tx.get(nameRef);
            if (n.exists && n.data()?.uid === uid) tx.delete(nameRef);
          }
          tx.update(userRef(uid), { displayName: DEFAULT_PLAYER_NAME, displayNameKey: FieldValue.delete() });
        });
        return { mode: 'reset', before: d.displayName || null };
      }
      case 'gang': {
        const [, worldId, gangId] = m;
        const newName = await db.runTransaction(async (tx) => {
          const g = (await tx.get(ref)).data() || {};
          let name = `Çete ${gangId.slice(-4).toUpperCase()}`;
          for (let i = 2; i < 50; i++) {
            const taken = await tx.get(db.doc(`gangWorlds/${worldId}/gangNames/${nameKeyOfGang(name)}`));
            if (!taken.exists || taken.data()?.gangId === gangId) break;
            name = `Çete ${gangId.slice(-4).toUpperCase()}-${i}`;
          }
          const key = nameKeyOfGang(name);
          if (g.nameKey && g.nameKey !== key) {
            const oldRef = db.doc(`gangWorlds/${worldId}/gangNames/${g.nameKey}`);
            const old = await tx.get(oldRef);
            if (old.exists && old.data()?.gangId === gangId) tx.delete(oldRef);
          }
          tx.set(db.doc(`gangWorlds/${worldId}/gangNames/${key}`), { gangId });
          tx.update(ref, { name, nameKey: key, note: '' });
          return name;
        });
        return { mode: 'reset', before: `${d.name || '-'}${d.note ? ` · ${d.note}` : ''}`, after: newName };
      }
      case 'factory':
        await ref.update({ name: FieldValue.delete() });
        return { mode: 'reset', before: d.name || null };
      case 'vehicleName':
        await ref.update({ customName: FieldValue.delete() });
        return { mode: 'reset', before: d.customName || null };
      case 'heistNote':
      case 'beggarNote':
        await ref.update({ note: '' });
        return { mode: 'reset', before: d.note || null };
      case 'nasihat':
        // Bu arada başka biri yeni nasihat verdiyse dokunma
        if (targetUid && d.uid !== targetUid) return { mode: 'stale' };
        await ref.update({ lastNasihat: null });
        return { mode: 'reset', before: d.lastNasihat || null };
      default:
        fail('invalid-argument', 'Bu içerik türü kaldırılamaz.');
    }
    return { mode: 'none' };
  }

  async function resolveReport(actor, p) {
    const path = String(p.targetPath || '');
    const decision = p.decision;
    if (!['dismiss', 'remove'].includes(decision)) fail('invalid-argument', 'Geçersiz karar.');
    const note = clip(p.note, ADMIN_LIMITS.REASON_MAX);
    const open = await openReportsFor(path);
    if (open.length === 0) fail('failed-precondition', 'Bu şikâyet zaten kapatılmış.');
    const first = open[0].data();
    const type = first.targetType;
    // En çok seçilen bildirim sebebi (moderatör not yazmadıysa oyuncuya bu söylenir)
    const tally = {};
    for (const d of open) tally[d.data().reason] = (tally[d.data().reason] || 0) + 1;
    const topReason = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    const targetUid = first.targetUid || null;
    validatedMatch(type, path);

    let effect = { mode: 'none' };
    if (decision === 'remove') {
      effect = await removeContent(actor, type, path, targetUid);
    } else {
      // Şikâyet yersiz: şikâyetlerle OTOMATİK gizlenmiş içerik geri açılır
      const s = await db.doc(path).get();
      if (s.exists && s.data()?.hidden && s.data()?.hiddenBy === 'auto_reports') {
        await db.doc(path).update({ hidden: false, hiddenBy: FieldValue.delete(), restoredBy: actor.uid });
        effect = { mode: 'unhidden' };
      }
    }

    let warned = false;
    let notified = false;
    const batch = db.batch();
    for (const d of open) {
      batch.update(d.ref, { status: decision === 'remove' ? 'actioned' : 'dismissed', resolution: decision, resolvedAtMs: now(), resolvedBy: actor.uid, resolvedByName: actor.name, resolutionNote: note || null });
    }
    // D4: içerik kaldırıldıysa / sıfırlandıysa oyuncu HER ZAMAN bilgilendirilir
    // (sebep: moderatörün notu, yoksa en çok seçilen bildirim sebebi).
    // "Uyarı" işaretliyse mesaja resmi uyarı cümlesi eklenir.
    if (decision === 'remove' && targetUid && ['hidden', 'reset'].includes(effect.mode)) {
      const target = await loadTarget(targetUid).catch(() => null);
      if (target && target.role !== 'admin' && target.uid !== actor.uid) {
        const noun = CONTENT_NOUNS[type] || 'paylaştığın bir içerik';
        const verb = effect.mode === 'hidden' ? 'kaldırıldı' : type === 'user' ? `"${DEFAULT_PLAYER_NAME}" olarak değiştirildi; yeni bir ad seçebilirsin` : 'varsayılana döndürüldü';
        const reasonText = note || REASON_LABELS[topReason] || REASON_LABELS.diger;
        sms(batch, targetUid, `🧹 Topluluk kurallarına aykırı bulunduğu için ${noun} ${verb}. Sebep: ${reasonText}.${p.warn ? WARNING_TAIL : ''}`);
        notified = true;
        warned = Boolean(p.warn);
      }
    }
    const targetName = targetUid ? (await userRef(targetUid).get()).data()?.displayName || null : null;
    batch.set(
      db.collection('admin_logs').doc(),
      logEntry(actor, decision === 'remove' ? 'report_remove' : 'report_dismiss', {
        targetUid,
        targetName,
        targetPath: path,
        targetType: type,
        reason: note || null,
        details: { reportCount: open.length, effect: effect.mode, before: effect.before ?? first.textSnapshot ?? null, after: effect.after || null, warned, notified, topReason: topReason || null },
      })
    );
    await batch.commit();
    return { ok: true, effect: effect.mode, closed: open.length, warned, notified };
  }

  // Moderatörün kaldırdığı (ya da otomatik gizlenen) içeriği geri aç.
  async function restoreContent(actor, p) {
    const path = String(p.targetPath || '');
    const type = String(p.targetType || '');
    if (!HIDEABLE.includes(type)) fail('invalid-argument', 'Bu içerik geri açılamaz (ad/isim sıfırlamaları geri alınmaz).');
    validatedMatch(type, path);
    const s = await db.doc(path).get();
    if (!s.exists) fail('not-found', 'İçerik bulunamadı.');
    if (!s.data()?.hidden) fail('failed-precondition', 'İçerik zaten görünür.');
    await db.doc(path).update({ hidden: false, hiddenBy: FieldValue.delete(), restoredBy: actor.uid });
    await writeLog(actor, 'content_restore', { targetPath: path, targetType: type, reason: clip(p.reason, ADMIN_LIMITS.REASON_MAX) || null, details: { wasHiddenBy: s.data()?.hiddenBy || null } });
    return { ok: true };
  }

  // ---- Oyuncu yönetimi ----------------------------------------------------------
  async function statusOf(uid) {
    const [ms, bs] = await Promise.all([db.collection('mutes').doc(uid).get(), db.collection('bans').doc(uid).get()]);
    const mute = ms.data();
    const ban = bs.data();
    const t = now();
    return {
      mute: mute && Number(mute.untilMs) > t && mute.level !== 'ban' ? { untilMs: mute.untilMs, reason: mute.reason || null, byName: mute.byName || null } : null,
      ban: ban?.active ? { untilMs: ban.permanent ? null : ban.untilMs, permanent: Boolean(ban.permanent), reason: ban.reason || null, byName: ban.byName || null, createdAtMs: ban.createdAtMs } : null,
    };
  }

  async function searchUsers(actor, p) {
    const q = clip(p.q, 128);
    if (q.length < 2) fail('invalid-argument', 'En az 2 karakter yaz.');
    const found = new Map();
    const add = (doc) => {
      if (doc?.exists && !found.has(doc.id)) found.set(doc.id, doc.data() || {});
    };
    if (isUid(q)) add(await userRef(q).get());
    const key = q.toLocaleLowerCase('tr-TR');
    const exact = await db.collection('usernames').doc(key.replace(/\//g, '_')).get();
    if (exact.exists && isUid(exact.data()?.uid)) add(await userRef(exact.data().uid).get());
    const [byKey, byName] = await Promise.all([
      db.collection('users').where('displayNameKey', '>=', key).where('displayNameKey', '<=', `${key}`).limit(ADMIN_LIMITS.SEARCH_MAX).get(),
      db.collection('users').where('displayName', '>=', q).where('displayName', '<=', `${q}`).limit(10).get(),
    ]);
    byKey.docs.forEach(add);
    byName.docs.forEach(add);
    const rows = await Promise.all(
      [...found.entries()].slice(0, ADMIN_LIMITS.SEARCH_MAX).map(async ([uid, d]) => ({
        uid,
        name: d.displayName || DEFAULT_PLAYER_NAME,
        role: roleOf(uid, d),
        createdAtMs: d.createdAt?.toMillis?.() ?? null,
        ...(await statusOf(uid)),
      }))
    );
    return { results: rows };
  }

  async function getUserDetail(actor, p) {
    const t = await loadTarget(p.uid);
    const [st, reports, logs] = await Promise.all([
      statusOf(t.uid),
      db.collection('reports').where('targetUid', '==', t.uid).get(),
      db.collection('admin_logs').where('targetUid', '==', t.uid).get(),
    ]);
    let authDisabled = null;
    try {
      authDisabled = Boolean((await auth.getUser(t.uid)).disabled);
    } catch {
      authDisabled = null;
    }
    const rs = reports.docs.map((d) => d.data());
    return {
      uid: t.uid,
      name: t.name,
      role: t.role,
      bootstrapAdmin: isBootstrap(t.uid),
      createdAtMs: t.data.createdAt?.toMillis?.() ?? null,
      reputation: t.data.reputation ?? null,
      ...st,
      authDisabled,
      reports: { total: rs.length, open: rs.filter((r) => r.status === 'open').length, actioned: rs.filter((r) => r.status === 'actioned').length },
      recentLogs: logs.docs
        .map((d) => publicLog(d))
        .sort((a, b) => b.atMs - a.atMs)
        .slice(0, 20),
    };
  }

  async function warnUser(actor, p) {
    const t = await loadTarget(p.uid);
    assertCanSanction(actor, t);
    const reason = clip(p.reason, ADMIN_LIMITS.REASON_MAX);
    if (!reason) fail('invalid-argument', 'Sebep yazmalısın.');
    const extra = clip(p.text, ADMIN_LIMITS.WARN_MAX);
    const text = `⚠️ Moderasyon uyarısı. Sebep: ${reason}.${extra ? ` ${extra}` : ''} Tekrarlanırsa hesabın kısıtlanabilir.`;
    const batch = db.batch();
    sms(batch, t.uid, text);
    batch.set(db.collection('admin_logs').doc(), logEntry(actor, 'warn', { targetUid: t.uid, targetName: t.name, reason, details: { text: extra || null, notified: true } }));
    await batch.commit();
    return { ok: true };
  }

  async function muteUser(actor, p) {
    const t = await loadTarget(p.uid);
    assertCanSanction(actor, t);
    const duration = String(p.duration || '');
    if (!MUTE_DURATIONS[duration]) fail('invalid-argument', 'Geçersiz süre.');
    if (actor.role !== 'admin' && !MODERATOR_MUTE_KEYS.includes(duration)) fail('permission-denied', 'Moderatörler en fazla 7 gün susturabilir.');
    const reason = clip(p.reason, ADMIN_LIMITS.REASON_MAX);
    if (!reason) fail('invalid-argument', 'Sebep yazmalısın.');
    const st = await statusOf(t.uid);
    if (st.ban) fail('failed-precondition', 'Oyuncu zaten banlı.');
    const untilMs = now() + MUTE_DURATIONS[duration];
    const batch = db.batch();
    batch.set(db.collection('mutes').doc(t.uid), { untilMs, level: 'mute', reason, byUid: actor.uid, byName: actor.name, duration, createdAt: FieldValue.serverTimestamp(), createdAtMs: now() });
    sms(batch, t.uid, `🔇 Susturuldun (${DURATION_LABELS[duration]}). ${fmtUntil(untilMs)} tarihine kadar mesaj, gönderi, yorum, ad ve not yazamazsın. Sebep: ${reason}.`);
    batch.set(db.collection('admin_logs').doc(), logEntry(actor, 'mute', { targetUid: t.uid, targetName: t.name, reason, details: { duration, untilMs, replaced: st.mute ? st.mute.untilMs : null } }));
    await batch.commit();
    return { ok: true, untilMs };
  }

  async function unmuteUser(actor, p) {
    const t = await loadTarget(p.uid);
    assertCanSanction(actor, t);
    const st = await statusOf(t.uid);
    if (st.ban) fail('failed-precondition', 'Oyuncu banlı — önce banı kaldır.');
    if (!st.mute) fail('failed-precondition', 'Oyuncunun aktif bir susturması yok.');
    const batch = db.batch();
    batch.set(db.collection('mutes').doc(t.uid), { untilMs: 0, liftedAtMs: now(), liftedBy: actor.uid }, { merge: true });
    sms(batch, t.uid, '🔊 Susturman kaldırıldı, yeniden yazabilirsin.');
    batch.set(db.collection('admin_logs').doc(), logEntry(actor, 'unmute', { targetUid: t.uid, targetName: t.name, reason: clip(p.reason, ADMIN_LIMITS.REASON_MAX) || null, details: { wasUntilMs: st.mute.untilMs } }));
    await batch.commit();
    return { ok: true };
  }

  async function banUser(actor, p) {
    if (actor.role !== 'admin') fail('permission-denied', 'Ban yalnızca yöneticiler tarafından atılabilir.');
    const t = await loadTarget(p.uid);
    assertCanSanction(actor, t);
    const duration = String(p.duration || '');
    if (!(duration in BAN_DURATIONS)) fail('invalid-argument', 'Geçersiz süre.');
    const reason = clip(p.reason, ADMIN_LIMITS.REASON_MAX);
    if (!reason) fail('invalid-argument', 'Sebep yazmalısın.');
    const permanent = duration === 'permanent';
    const untilMs = permanent ? banUntilMs : now() + BAN_DURATIONS[duration];
    const [muteSnap, banSnap] = await Promise.all([db.collection('mutes').doc(t.uid).get(), db.collection('bans').doc(t.uid).get()]);
    const prev = banSnap.data();
    const cur = muteSnap.data();
    // Önceki (ban olmayan) aktif susturma saklanır; ban kalkınca süresi dolmadıysa geri gelir
    const prevMute = prev?.active ? prev.prevMute || null : cur && cur.level !== 'ban' && Number(cur.untilMs) > now() ? { untilMs: cur.untilMs, reason: cur.reason || null, byUid: cur.byUid || null, byName: cur.byName || null } : null;
    const batch = db.batch();
    batch.set(db.collection('bans').doc(t.uid), { active: true, untilMs, permanent, duration, reason, byUid: actor.uid, byName: actor.name, createdAtMs: now(), createdAt: FieldValue.serverTimestamp(), prevMute, liftedAtMs: null, liftedBy: null });
    batch.set(db.collection('mutes').doc(t.uid), { untilMs, level: 'ban', reason, byUid: actor.uid, byName: actor.name, createdAt: FieldValue.serverTimestamp(), createdAtMs: now() });
    // Oyuncu giriş yapamadığı için bu SMS'i ban kalkınca görür (kayıt olarak kalır)
    sms(batch, t.uid, `⛔ Hesabın ${permanent ? 'süresiz olarak' : `${DURATION_LABELS[duration]} süreyle (${fmtUntil(untilMs)} tarihine kadar)`} kısıtlandı. Sebep: ${reason}.`);
    await batch.commit();
    let authOk = true;
    try {
      await auth.updateUser(t.uid, { disabled: true });
      await auth.revokeRefreshTokens(t.uid);
    } catch (err) {
      authOk = false;
      console.error('banUser auth', t.uid, err?.message || err);
    }
    await writeLog(actor, 'ban', { targetUid: t.uid, targetName: t.name, reason, details: { duration, untilMs: permanent ? null : untilMs, permanent, authDisabled: authOk, extended: Boolean(prev?.active) } });
    return { ok: true, untilMs: permanent ? null : untilMs, permanent, authDisabled: authOk };
  }

  // Banı kaldır (elle ya da süre dolunca). actor: panel kullanıcısı ya da sistem.
  async function liftBan(actor, uid, reason) {
    const banRef = db.collection('bans').doc(uid);
    const ban = (await banRef.get()).data();
    if (!ban?.active) return { lifted: false };
    let authOk = true;
    try {
      await auth.updateUser(uid, { disabled: false });
    } catch (err) {
      authOk = false;
      console.error('liftBan auth', uid, err?.message || err);
    }
    const pm = ban.prevMute && Number(ban.prevMute.untilMs) > now() ? ban.prevMute : null;
    const batch = db.batch();
    batch.update(banRef, { active: false, liftedAtMs: now(), liftedBy: actor.uid });
    batch.set(db.collection('mutes').doc(uid), pm ? { untilMs: pm.untilMs, level: 'mute', reason: pm.reason, byUid: pm.byUid, byName: pm.byName, restoredAfterBan: true } : { untilMs: 0, level: 'mute', liftedAtMs: now(), liftedBy: actor.uid });
    const userSnap = await userRef(uid).get();
    const name = userSnap.data()?.displayName || DEFAULT_PLAYER_NAME;
    if (userSnap.exists) sms(batch, uid, `✅ Hesabının kısıtlaması sona erdi.${pm ? ` Önceki susturman ${fmtUntil(pm.untilMs)} tarihine kadar sürüyor.` : ''} Topluluk kurallarına uymaya devam etmeni rica ederiz.`);
    batch.set(db.collection('admin_logs').doc(), logEntry(actor, actor.uid === 'system' ? 'ban_expired' : 'unban', { targetUid: uid, targetName: name, reason: reason || null, details: { authEnabled: authOk, muteRestoredUntilMs: pm ? pm.untilMs : null } }));
    await batch.commit();
    return { lifted: true, authEnabled: authOk };
  }

  async function unbanUser(actor, p) {
    if (actor.role !== 'admin') fail('permission-denied', 'Banı yalnızca yöneticiler kaldırabilir.');
    const t = await loadTarget(p.uid);
    const res = await liftBan(actor, t.uid, clip(p.reason, ADMIN_LIMITS.REASON_MAX));
    if (!res.lifted) fail('failed-precondition', 'Oyuncunun aktif bir banı yok.');
    return { ok: true, authEnabled: res.authEnabled };
  }

  const SYSTEM_ACTOR = { uid: 'system', name: 'Sistem', role: 'system' };
  async function sweepExpiredBans() {
    const snap = await db.collection('bans').where('active', '==', true).get();
    let lifted = 0;
    for (const d of snap.docs) {
      const b = d.data();
      if (!b.permanent && Number(b.untilMs) <= now()) {
        const r = await liftBan(SYSTEM_ACTOR, d.id, 'Süre doldu');
        if (r.lifted) lifted += 1;
      }
    }
    return { lifted };
  }

  // ---- Saklama süresi (Gizlilik Politikası md. 6) ----------------------------------
  // Sonuçlanmış bildirimler sonuçlandıktan 12 ay sonra silinir. Açık bildirimler
  // (resolvedAtMs yok) dokunulmaz. Her çalışmada en fazla PURGE_BATCH belge.
  async function purgeOldReports() {
    const cutoff = now() - ADMIN_LIMITS.REPORT_RETENTION_DAYS * DAY;
    const snap = await db.collection('reports').where('resolvedAtMs', '<', cutoff).limit(ADMIN_LIMITS.PURGE_BATCH).get();
    if (snap.empty) return { purged: 0 };
    const batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      if (d.data().status === 'open') continue;
      batch.delete(d.ref);
      n += 1;
    }
    if (n) await batch.commit();
    return { purged: n };
  }

  // ---- Roller ---------------------------------------------------------------------
  async function setRole(actor, p) {
    if (actor.role !== 'admin') fail('permission-denied', 'Rolleri yalnızca yöneticiler değiştirebilir.');
    const role = p.role === 'none' ? null : p.role;
    if (role !== null && !STAFF_ROLES.includes(role)) fail('invalid-argument', 'Geçersiz rol.');
    const t = await loadTarget(p.uid);
    if (t.uid === actor.uid) fail('failed-precondition', 'Kendi rolünü değiştiremezsin.');
    if (isBootstrap(t.uid)) fail('failed-precondition', 'Kurucu yöneticinin rolü panelden değiştirilemez.');
    if ((t.role || null) === role) fail('failed-precondition', 'Oyuncu zaten bu rolde.');
    await userRef(t.uid).update({ role: role || FieldValue.delete() });
    await writeLog(actor, 'set_role', { targetUid: t.uid, targetName: t.name, details: { from: t.role || null, to: role } });
    return { ok: true };
  }

  async function listStaff() {
    const snap = await db.collection('users').where('role', 'in', STAFF_ROLES).get();
    const map = new Map(snap.docs.map((d) => [d.id, { uid: d.id, name: d.data().displayName || DEFAULT_PLAYER_NAME, role: roleOf(d.id, d.data()), bootstrapAdmin: isBootstrap(d.id) }]));
    for (const uid of bootstrapAdminUids) {
      if (!map.has(uid) && isUid(uid)) {
        const s = await userRef(uid).get();
        if (s.exists) map.set(uid, { uid, name: s.data()?.displayName || DEFAULT_PLAYER_NAME, role: 'admin', bootstrapAdmin: true });
      }
    }
    return { staff: [...map.values()].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'tr') : a.role === 'admin' ? -1 : 1)) };
  }

  // ---- İşlem geçmişi ---------------------------------------------------------------
  async function listLogs(actor, p) {
    let q = db.collection('admin_logs').orderBy('atMs', 'desc');
    const before = Number(p.beforeMs);
    if (Number.isFinite(before) && before > 0) q = db.collection('admin_logs').where('atMs', '<', before).orderBy('atMs', 'desc');
    const snap = await q.limit(ADMIN_LIMITS.LOG_PAGE).get();
    const logs = snap.docs.map(publicLog);
    return { logs, nextBeforeMs: logs.length === ADMIN_LIMITS.LOG_PAGE ? logs[logs.length - 1].atMs : null };
  }

  // ---- v59: Altın Mağazası sipariş telafisi (yalnızca yönetici) -----------------
  // Eksik yüklenen Shopier siparişini tamamlar. Asıl kural sunucuda
  // (functions/index.js creditMissingShopierPackage): yüklenen paketlerin
  // toplamı ödenen tutarı aşamaz → aynı eksik paket iki kez yüklenemez.
  const cleanOrderId = (v) => {
    const id = String(v ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) fail('invalid-argument', 'Geçersiz sipariş numarası.');
    return id;
  };
  async function withPlayerName(summary) {
    if (!summary) return null;
    let playerName = null;
    if (summary.uid && isUid(summary.uid)) {
      const u = await userRef(summary.uid).get();
      playerName = u.exists ? u.data()?.displayName || DEFAULT_PLAYER_NAME : null;
    }
    return { ...summary, playerName };
  }
  async function getShopOrder(actor, p) {
    if (!shop) fail('failed-precondition', 'Mağaza modülü bağlı değil.');
    const order = await withPlayerName(await shop.getOrder(cleanOrderId(p.orderId)));
    if (!order) fail('not-found', 'Bu numarayla yüklenmiş bir sipariş bulunamadı (shopierUnmatchedOrders\'a bak).');
    return { order };
  }
  async function creditShopOrder(actor, p) {
    if (!shop) fail('failed-precondition', 'Mağaza modülü bağlı değil.');
    const orderId = cleanOrderId(p.orderId);
    const packageId = String(p.packageId || '');
    const order = await withPlayerName(await shop.creditMissing({ orderId, packageId, actorUid: actor.uid }));
    await writeLog(actor, 'shop_credit', { targetUid: order?.uid || null, targetName: order?.playerName || null, reason: clip(p.reason, ADMIN_LIMITS.REASON_MAX) || 'Eksik yüklenen paket', details: { orderId, packageId, paidTRY: order?.paidTRY ?? null, creditedPackages: order?.creditedPackages || [] } });
    return { ok: true, order };
  }

  // ---- Yönlendirici -------------------------------------------------------------
  // minRole: bu eylemi çağırabilecek en düşük rol
  const ACTIONS = {
    me: { minRole: 'moderator', run: async (actor) => ({ uid: actor.uid, role: actor.role, name: actor.name }) },
    listReports: { minRole: 'moderator', run: listReports },
    resolveReport: { minRole: 'moderator', run: resolveReport },
    restoreContent: { minRole: 'moderator', run: restoreContent },
    searchUsers: { minRole: 'moderator', run: searchUsers },
    getUser: { minRole: 'moderator', run: getUserDetail },
    warnUser: { minRole: 'moderator', run: warnUser },
    muteUser: { minRole: 'moderator', run: muteUser },
    unmuteUser: { minRole: 'moderator', run: unmuteUser },
    listLogs: { minRole: 'moderator', run: listLogs },
    banUser: { minRole: 'admin', run: banUser },
    unbanUser: { minRole: 'admin', run: unbanUser },
    setRole: { minRole: 'admin', run: setRole },
    listStaff: { minRole: 'admin', run: listStaff },
    getShopOrder: { minRole: 'admin', run: getShopOrder },
    creditShopOrder: { minRole: 'admin', run: creditShopOrder },
  };

  async function handle(uid, data) {
    const spec = ACTIONS[data?.action];
    if (!spec) fail('invalid-argument', 'Geçersiz işlem.');
    const actor = await getActor(uid);
    if (spec.minRole === 'admin' && actor.role !== 'admin') fail('permission-denied', 'Bu işlem yalnızca yöneticilere açık.');
    return spec.run(actor, data.payload || {});
  }

  return {
    adminAction: onCall(async (request) => handle(requireAuth(request), request.data || {})),
    sweepExpiredBans,
    purgeOldReports,
    _impl: { handle, getActor, liftBan },
  };
}
