// =============================================================================
// moderation.js — UGC Moderasyonu (Faz D1): şikâyet, engelleme, susturma
// =============================================================================
//
// Koleksiyonlar (hepsi YALNIZCA sunucu yazar; bkz. firestore.rules):
//   reports/{hedefHash}_{şikâyetEdenUid}  — şikâyetler (istemci OKUYAMAZ)
//   userBlocks/{uid}                       — { blocked: { <uid>: { at, name } } } (yalnızca sahibi okur)
//   mutes/{uid}                            — { untilMs, level, reason, byUid, createdAt } (yalnızca sahibi okur)
//
// Bu modül index.js'teki mevcut hiçbir akışı değiştirmez; index.js yalnızca
// mesaj/ad yazan callable'larda assertCanSpeak(uid), Sixtagram yorum/beğeni/
// bildiriminde isBlockedBy(...) çağırır. Çete sisteminde (gang/system.js) aynı
// kontrol, metin üreten eylemler için tek noktadan yapılır.
// =============================================================================

import crypto from 'crypto';

export const MODERATION = {
  MAX_BLOCKS: 200,
  REPORTS_PER_DAY: 20,
  AUTO_HIDE_REPORTERS: 3, // bu kadar FARKLI (uygun) oyuncu şikâyet ederse içerik gizlenir
  MIN_REPORTER_AGE_MS: 3 * 24 * 60 * 60 * 1000, // otomatik gizlemede sayılmak için hesap yaşı
  NOTE_MAX: 200,
  SNAPSHOT_MAX: 500,
  BAN_UNTIL_MS: 32503680000000, // yıl 3000 — "kalıcı"
};

export const REPORT_REASONS = ['hakaret', 'taciz', 'cinsel', 'nefret', 'spam_dolandiricilik', 'gercek_para', 'kisisel_bilgi', 'diger'];

// Şikâyet edilebilir hedefler. Yol, istemciden gelir ama KESİN bir kalıpla
// doğrulanır; metin ve hedef oyuncu HER ZAMAN sunucuda, dokümandan okunur
// (istemcinin gönderdiği metne güvenilmez). hideable: otomatik gizlenebilir.
const S = '([^/]+)';
export const REPORT_TARGETS = {
  globalChat: { re: new RegExp(`^globalChat/${S}$`), hideable: true, pick: (d) => ({ uid: d.uid, text: d.text }) },
  sixtagramPost: { re: new RegExp(`^sixtagramPosts/${S}$`), hideable: true, pick: (d) => ({ uid: d.uid, text: d.text }) },
  sixtagramComment: { re: new RegExp(`^sixtagramPosts/${S}/comments/${S}$`), hideable: true, pick: (d) => ({ uid: d.uid, text: d.text }) },
  gangChat: {
    re: new RegExp(`^gangWorlds/${S}/gangs/${S}/chat_(genel|yonetim)/${S}$`),
    hideable: true,
    pick: (d) => ({ uid: d.authorId, text: d.text }),
    // Şikâyet eden o çetenin üyesi olmalı (başkasının çete sohbetini tahminle şikâyet edemez)
    access: async (db, reporterUid, m) => (await db.doc(`gangWorlds/${m[1]}/memberships/${reporterUid}`).get()).data()?.gangId === m[2],
  },
  gangGlobalChat: { re: new RegExp(`^gangWorlds/${S}/globalChat/${S}$`), hideable: true, pick: (d) => ({ uid: d.authorId, text: d.text }) },
  intelChat: {
    // İstihbarat sohbeti ANONİMDİR: mesajda uid yok, rosterId var. Kimlik yalnızca
    // sunucuda (intelRosterLinks) çözülür ve rapora yazılır; kimseye gösterilmez.
    re: new RegExp(`^gangWorlds/${S}/intelChat_(genel|yonetim)/${S}$`),
    hideable: true,
    pick: (d) => ({ rosterId: d.rosterId, text: d.text }),
    resolveUid: async (db, m, picked) =>
      picked.rosterId ? (await db.doc(`gangWorlds/${m[1]}/intelRosterLinks/${picked.rosterId}`).get()).data()?.actorId || null : null,
  },
  feedback: { re: new RegExp(`^feedback/${S}$`), hideable: true, pick: (d) => ({ uid: d.uid, text: d.text }) },
  bubble: { re: new RegExp(`^(parkPresence|interiorPresence)/${S}$`), hideable: false, pick: (d, m) => ({ uid: m[2], text: d.chatText }) },
  user: { re: new RegExp(`^users/${S}$`), hideable: false, pick: (d, m) => ({ uid: m[1], text: `Oyun içi ad: ${d.displayName || '-'}` }) },
  gang: { re: new RegExp(`^gangWorlds/${S}/gangs/${S}$`), hideable: false, pick: (d) => ({ uid: d.babaId, text: `Çete adı: ${d.name || '-'}${d.note ? ` · Not: ${d.note}` : ''}` }) },
  factory: { re: new RegExp(`^factories/${S}$`), hideable: false, pick: (d, m) => ({ uid: m[1], text: `Fabrika adı: ${d.name || '-'}` }) },
  vehicleName: { re: new RegExp(`^vehicles/${S}$`), hideable: false, pick: (d) => ({ uid: d.ownerId, text: `Araç adı: ${d.customName || '-'}` }) },
  heistNote: { re: new RegExp(`^heistPlans/${S}$`), hideable: false, pick: (d) => ({ uid: d.creatorUid, text: d.note }) },
  beggarNote: { re: new RegExp(`^beggars/${S}/entries/${S}$`), hideable: false, pick: (d, m) => ({ uid: m[2], text: d.note }) },
  nasihat: { re: /^imamState\/current$/, hideable: false, pick: (d) => ({ uid: d.uid, text: d.lastNasihat }) },
};

const hashPath = (p) => crypto.createHash('sha1').update(p).digest('hex').slice(0, 24);
const isUid = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

function muteMessage(m) {
  if (m.level === 'ban' || m.untilMs >= MODERATION.BAN_UNTIL_MS) return 'Hesabın topluluk kurallarını ihlal ettiği için kısıtlandı.';
  const until = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.untilMs));
  return `Topluluk kurallarını ihlal ettiğin için ${until} tarihine kadar yazı yazamazsın.`;
}

// deps: { db, FieldValue, HttpsError, requireAuth, onCall, dateKey: () => 'YYYY-MM-DD', now?: () => ms }
export function createModeration({ db, FieldValue, HttpsError, requireAuth, onCall, dateKey, now = () => Date.now() }) {
  // ---- Susturma ---------------------------------------------------------------
  async function getActiveMute(uid) {
    if (!uid) return null;
    const s = await db.collection('mutes').doc(uid).get();
    if (!s.exists) return null;
    const m = s.data() || {};
    return (Number(m.untilMs) || 0) > now() ? m : null;
  }
  async function assertCanSpeak(uid) {
    const m = await getActiveMute(uid);
    if (m) throw new HttpsError('permission-denied', muteMessage(m));
  }

  // ---- Engelleme ------------------------------------------------------------------
  // ownerUid, otherUid'yi engellemiş mi? (1 okuma)
  async function isBlockedBy(ownerUid, otherUid) {
    if (!ownerUid || !otherUid || ownerUid === otherUid) return false;
    const s = await db.collection('userBlocks').doc(ownerUid).get();
    return Boolean(s.exists && s.data()?.blocked?.[otherUid]);
  }

  async function blockUserImpl(uid, data) {
    const targetUid = data?.targetUid;
    if (!isUid(targetUid)) throw new HttpsError('invalid-argument', 'Geçersiz oyuncu.');
    if (targetUid === uid) throw new HttpsError('invalid-argument', 'Kendini engelleyemezsin.');
    const targetSnap = await db.collection('users').doc(targetUid).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'Oyuncu bulunamadı.');
    const name = String(targetSnap.data()?.displayName || 'Oyuncu').slice(0, 40);
    const ref = db.collection('userBlocks').doc(uid);
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const blocked = s.exists ? s.data()?.blocked || {} : {};
      if (blocked[targetUid]) return; // zaten engelli — idempotent
      if (Object.keys(blocked).length >= MODERATION.MAX_BLOCKS) {
        throw new HttpsError('resource-exhausted', `En fazla ${MODERATION.MAX_BLOCKS} oyuncu engelleyebilirsin.`);
      }
      tx.set(ref, { blocked: { [targetUid]: { at: now(), name } }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return { ok: true };
  }

  async function unblockUserImpl(uid, data) {
    const targetUid = data?.targetUid;
    if (!isUid(targetUid)) throw new HttpsError('invalid-argument', 'Geçersiz oyuncu.');
    const ref = db.collection('userBlocks').doc(uid);
    const s = await ref.get();
    if (!s.exists || !s.data()?.blocked?.[targetUid]) return { ok: true };
    await ref.update({ [`blocked.${targetUid}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }

  // ---- Şikâyet ------------------------------------------------------------------
  async function reportContentImpl(uid, data) {
    const type = String(data?.targetType || '');
    const path = String(data?.targetPath || '');
    const reason = String(data?.reason || '');
    const note = String(data?.note || '').replace(/\s+/g, ' ').trim().slice(0, MODERATION.NOTE_MAX);
    const platform = data?.platform === 'android' ? 'android' : 'web';
    const spec = REPORT_TARGETS[type];
    if (!spec) throw new HttpsError('invalid-argument', 'Geçersiz şikâyet türü.');
    if (!REPORT_REASONS.includes(reason)) throw new HttpsError('invalid-argument', 'Geçersiz şikâyet sebebi.');
    const m = path.match(spec.re);
    if (!m) throw new HttpsError('invalid-argument', 'Geçersiz içerik.');
    if (spec.access && !(await spec.access(db, uid, m))) throw new HttpsError('permission-denied', 'Bu içeriği şikâyet edemezsin.');

    const targetSnap = await db.doc(path).get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'İçerik bulunamadı (silinmiş olabilir).');
    const picked = spec.pick(targetSnap.data() || {}, m) || {};
    const targetUid = spec.resolveUid ? await spec.resolveUid(db, m, picked) : picked.uid || null;
    const text = String(picked.text || '').slice(0, MODERATION.SNAPSHOT_MAX);
    if (type === 'bubble' && !text) throw new HttpsError('failed-precondition', 'Balon artık görünmüyor.');
    if (targetUid && targetUid === uid) throw new HttpsError('invalid-argument', 'Kendini şikâyet edemezsin.');

    const reporterSnap = await db.collection('users').doc(uid).get();
    const createdMs = reporterSnap.data()?.createdAt?.toMillis?.() ?? null;
    const eligible = createdMs != null && now() - createdMs >= MODERATION.MIN_REPORTER_AGE_MS;

    const reportRef = db.collection('reports').doc(`${hashPath(path)}_${uid}`);
    const dailyRef = db.collection('dailyActions').doc(`${uid}_${dateKey()}`);
    await db.runTransaction(async (tx) => {
      const [rs, ds] = await Promise.all([tx.get(reportRef), tx.get(dailyRef)]);
      if (rs.exists) throw new HttpsError('already-exists', 'Bu içeriği zaten şikâyet ettin.');
      const count = Number(ds.data()?.reportCount || 0);
      if (count >= MODERATION.REPORTS_PER_DAY) throw new HttpsError('resource-exhausted', 'Bugün yeterince şikâyet gönderdin, yarın tekrar deneyebilirsin.');
      tx.set(reportRef, {
        reporterUid: uid,
        targetUid,
        targetType: type,
        targetPath: path,
        textSnapshot: text,
        reason,
        note,
        platform,
        eligible,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: now(),
      });
      tx.set(dailyRef, { reportCount: count + 1 }, { merge: true });
    });

    // Otomatik gizleme: aynı içerik için yeterince FARKLI ve UYGUN şikâyetçi
    let hidden = false;
    if (spec.hideable && eligible) {
      const q = await db.collection('reports').where('targetPath', '==', path).where('eligible', '==', true).get();
      const distinct = new Set(q.docs.map((d) => d.data().reporterUid)).size;
      if (distinct >= MODERATION.AUTO_HIDE_REPORTERS) {
        const cur = await db.doc(path).get();
        if (cur.exists && !cur.data()?.hidden) {
          await db.doc(path).update({ hidden: true, hiddenAt: FieldValue.serverTimestamp(), hiddenBy: 'auto_reports' });
          hidden = true;
        }
      }
    }
    return { ok: true, autoHidden: hidden };
  }

  const wrap = (impl) => onCall(async (request) => impl(requireAuth(request), request.data || {}));

  return {
    // callable'lar
    reportContent: wrap(reportContentImpl),
    blockUser: wrap(blockUserImpl),
    unblockUser: wrap(unblockUserImpl),
    // index.js / gang sistemi yardımcıları
    assertCanSpeak,
    isBlockedBy,
    getActiveMute,
    // testler için
    _impl: { reportContentImpl, blockUserImpl, unblockUserImpl },
  };
}
