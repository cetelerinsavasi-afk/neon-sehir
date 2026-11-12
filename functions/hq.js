// =============================================================================
// hq.js — v146 KARARGAHLAR (çete mekânı) + POLİS TEŞKİLATI mekânı
// -----------------------------------------------------------------------------
// ÇETE KARARGAHI: houses/hq_{gangId}
//   • Sahibi bir oyuncu değil çetedir: ownerUid = 'gang_{gangId}' (hiçbir oyuncu bu
//     kimliğe sahip değil) → mobilya envanteri houseInventories/gang_{gangId}
//     (oyuncu envanteriyle karışmaz).
//   • hq: { gangId, worldId } · kind: 'karargah' · privacy: 'hq' · hqInvites: [gangId]
//   • Roller (her işlemde canlı okunur, ayrı yetki listesi tutulmaz):
//       baba    — çetenin Mafya Babası (gangs/{g}.babaId)
//       yetkili — Baba'nın yetki verdiği üye (gangs/{g}/members/{uid}.hqYetki) —
//                 üye belgesi çeteden çıkınca / atılınca silindiği için yetki
//                 kendiliğinden düşer.
//       uye     — çete üyesi
//       davetli — karargaha davet edilen çetenin üyesi
//   • Baba + yetkililer: mobilya alır / yerleştirir (ÇETE KASASINDAN altın + zümrüt),
//     ücretli ürün fiyatları, davetler, rapor, kişi çıkarma, pazara ilan.
//   • Ücretli ürün gelirleri VERGİSİZ çete kasasına (office.js chargeTx).
//   • Çete kapanınca: karargah, sohbeti, envanteri, pazardaki ilanları silinir.
// POLİS TEŞKİLATI: houses/game_teskilat (oyunun mekânı, venueLayouts.js 'teskilat')
//   • Sadece polisler + Belediye Başkanı, yardımcıları ve Teşkilat Bakanı girer.
//   • Polisler KOD ADIYLA ve varsayılan tiple görünür; konum kaydı uid ile değil
//     takma kimlikle tutulur (housePresence/pa_{rosterId}) → kimin kim olduğu
//     anlaşılmaz. Takma kimlik eşlemesi presenceAlias/{alias} (sadece sunucu).
//   • Yetkililer adı + makamıyla görünür.
// =============================================================================

export const TESKILAT_HOUSE = 'game_teskilat';
// v147 — teşkilatta polislerin hepsi aynı polis tipinde görünür (tanınmasınlar diye)
export const POLICE_AVATAR = Object.freeze({
  gender: 'erkek', build: 'standart', skin: '#c68863', eyeColor: '#3b2a1a', faceShape: 'oval', background: '#080b13',
  hairStyle: 'short', hairColor: '#2b2118', eyebrowShape: 'straight', eyeShape: 'almond', eyelash: 'none',
  noseShape: 'small', mouthShape: 'neutral', lipColor: '#a85a52', facialHair: 'none',
  faceAcc: 'sunglasses', earring: 'yok', tattoo: 'yok',
  clothing: 'police', clothColor: '#1d3557', neckAcc: 'none',
  hat: 'policecap', hatColor: '#1d3557', heldItem: 'yok',
  pantsColor: '#14263f', shoeColor: '#0d0d0d', shoeStyle: 'bot',
});
export const HQ_PREFIX = 'hq_';
export const hqHouseId = (gangId) => `${HQ_PREFIX}${gangId}`;
export const gangOwnerKey = (gangId) => `gang_${gangId}`;
export const isHqHouse = (h) => Boolean(h?.hq?.gangId && h?.hq?.worldId);
export const HQ_MANAGER_ROLES = ['baba', 'yetkili'];
export const POLICE_SEATS = { bsk: 'Belediye Başkanı', yrd1: 'Belediye Başkan Yardımcısı', yrd2: 'Belediye Başkan Yardımcısı', guv: 'Teşkilat Bakanı' };
export const HQ_DEFAULT = { wall: 'boya_beyaz', floor: 'parke_mese' };
const GANG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const HQ_MAX_INVITES = 30;

export function createHq({ db, FieldValue, HttpsError, now = () => Date.now(), isAdmin = async () => false }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const houseRef = (id) => db.collection('houses').doc(id);
  const w = (worldId) => `gangWorlds/${worldId}`;
  const membershipRef = (worldId, uid) => db.doc(`${w(worldId)}/memberships/${uid}`);
  const gangRef = (worldId, g) => db.doc(`${w(worldId)}/gangs/${g}`);
  const memberRef = (worldId, g, uid) => db.doc(`${w(worldId)}/gangs/${g}/members/${uid}`);
  const stateRef = (worldId, g) => db.doc(`${w(worldId)}/gangs/${g}/private/state`);
  const chatRef = (worldId, g) => db.collection(`${w(worldId)}/gangs/${g}/chat_genel`);

  let cfgCache = { at: 0, worldId: null };
  async function liveWorldId() {
    if (cfgCache.worldId && now() - cfgCache.at < 60_000) return cfgCache.worldId;
    const s = await db.doc('gangSystem/config').get();
    const id = s.exists ? s.data().liveWorldId || null : null;
    cfgCache = { at: now(), worldId: id };
    return id;
  }
  const get = (tx, ref) => (tx ? tx.get(ref) : ref.get());

  // Karargahta rol: 'baba' | 'yetkili' | 'uye' | 'davetli' | null
  async function hqRole(h, uid, tx = null) {
    if (!isHqHouse(h) || !UID_RE.test(String(uid || ''))) return null;
    const { gangId, worldId } = h.hq;
    const ms = await get(tx, membershipRef(worldId, uid));
    const m = ms.exists ? ms.data() : {};
    if (m.gangId === gangId) {
      const [mem, g] = await Promise.all([get(tx, memberRef(worldId, gangId, uid)), get(tx, gangRef(worldId, gangId))]);
      if (!mem.exists || g.data()?.status !== 'active') return null;
      if (g.data()?.babaId === uid || mem.data().rank === 'baba') return 'baba';
      if (mem.data().hqYetki === true) return 'yetkili';
      return 'uye';
    }
    if (m.gangId && Array.isArray(h.hqInvites) && h.hqInvites.includes(m.gangId)) return 'davetli';
    return null;
  }
  const isManager = (role) => HQ_MANAGER_ROLES.includes(role);
  async function requireManager(h, uid, tx = null) {
    const role = await hqRole(h, uid, tx);
    if (!isManager(role)) fail('permission-denied', 'Bu karargahta yetkin yok.');
    return role;
  }

  // Polis teşkilatı kimliği: { kind:'polis', alias, name } | { kind:'yetkili', title } | null
  async function policeIdentity(uid) {
    const worldId = await liveWorldId();
    if (worldId) {
      const ms = await membershipRef(worldId, uid).get();
      const m = ms.exists ? ms.data() : {};
      if (m.intelRosterId) {
        const rs = await db.doc(`${w(worldId)}/intelRoster/${m.intelRosterId}`).get();
        const code = String(rs.data()?.codeName || m.intelCodeName || 'Ajan').slice(0, 40);
        return { kind: 'polis', alias: `pa_${m.intelRosterId}`, name: code };
      }
    }
    const [st, us] = await Promise.all([db.doc(`belediyeStaff/${uid}`).get(), db.doc(`users/${uid}`).get()]);
    const seat = (st.exists ? st.data().seat : null) || us.data()?.belediyeSeat || null;
    if (seat && POLICE_SEATS[seat]) return { kind: 'yetkili', title: POLICE_SEATS[seat] };
    return null;
  }

  // ---- karargahı hazırla (yoksa boş kurar) — çete üyesi çağırır ------------------------
  async function ensure(uid, p = {}) {
    const worldId = await liveWorldId();
    if (!worldId) fail('failed-precondition', 'Çeteler şu an kapalı.');
    const ms = await membershipRef(worldId, uid).get();
    const gangId = p.gangId ? String(p.gangId) : ms.data()?.gangId || null;
    if (!gangId || !GANG_ID_RE.test(gangId)) fail('failed-precondition', 'Bir çetede değilsin.');
    const gs = await gangRef(worldId, gangId).get();
    const g = gs.exists ? gs.data() : null;
    if (!g || g.status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
    const houseId = hqHouseId(gangId);
    const ref = houseRef(houseId);
    const snap = await ref.get();
    const name = `${String(g.name || 'Çete').slice(0, 24)} Karargahı`;
    if (snap.exists && isHqHouse(snap.data())) {
      const h = snap.data();
      if (h.name !== name || JSON.stringify(h.ownerAvatar || null) !== JSON.stringify(g.logo || null)) await ref.update({ name, ownerName: String(g.name || 'Çete').slice(0, 40), ownerAvatar: g.logo || null });
      return { ok: true, houseId };
    }
    if (ms.data()?.gangId !== gangId) fail('permission-denied', 'Bu çetenin karargahı henüz açılmadı.');
    const t = now();
    await ref.set({
      ownerUid: gangOwnerKey(gangId),
      ownerName: String(g.name || 'Çete').slice(0, 40),
      ownerAvatar: g.logo || null,
      name,
      privacy: 'hq',
      kind: 'karargah',
      hq: { gangId, worldId },
      hqInvites: [],
      items: [],
      wall: HQ_DEFAULT.wall,
      floor: HQ_DEFAULT.floor,
      music: null,
      kicked: {},
      invites: {},
      createdAtMs: t,
      updatedAtMs: t,
    });
    return { ok: true, houseId, created: true };
  }

  async function loadHq(houseId) {
    if (typeof houseId !== 'string' || !houseId.startsWith(HQ_PREFIX)) fail('invalid-argument', 'Geçersiz karargah.');
    const s = await houseRef(houseId).get();
    if (!s.exists || !isHqHouse(s.data())) fail('not-found', 'Karargah bulunamadı.');
    return s.data();
  }

  // ---- bilgi: rol, kasa, üyeler (yetki listesi), davetler ------------------------------
  async function info(uid, p) {
    const houseId = String(p.houseId || '');
    const h = await loadHq(houseId);
    const role = await hqRole(h, uid);
    if (!role && !(await isAdmin(uid))) fail('permission-denied', 'Bu karargaha giremezsin.');
    const { gangId, worldId } = h.hq;
    const out = { ok: true, role: role || 'admin', gangId, invites: h.hqInvites || [] };
    if (isManager(role)) {
      const [st, mem] = await Promise.all([stateRef(worldId, gangId).get(), db.collection(`${w(worldId)}/gangs/${gangId}/members`).limit(80).get()]);
      out.kasa = Math.max(0, Math.floor(Number(st.data()?.kasa || 0)));
      out.gem = Math.max(0, Math.floor(Number(st.data()?.gem || 0)));
      out.members = mem.docs.map((d) => ({ uid: d.id, name: String(d.data().name || 'Üye').slice(0, 40), rank: d.data().rank || 'comez', yetki: d.data().hqYetki === true })).sort((a, b) => Number(b.rank === 'baba') - Number(a.rank === 'baba') || a.name.localeCompare(b.name, 'tr'));
    }
    return out;
  }

  // ---- Baba: üyeye karargah yetkisi ver / al ----------------------------------------
  async function setYetki(uid, p) {
    const houseId = String(p.houseId || '');
    const target = String(p.uid || '');
    if (!UID_RE.test(target) || target === uid) fail('invalid-argument', 'Geçersiz üye.');
    const h = await loadHq(houseId);
    const { gangId, worldId } = h.hq;
    const on = p.on === true;
    await db.runTransaction(async (tx) => {
      const role = await hqRole(h, uid, tx);
      if (role !== 'baba') fail('permission-denied', 'Yetkiyi sadece Mafya Babası verir.');
      const ms = await tx.get(memberRef(worldId, gangId, target));
      if (!ms.exists) fail('failed-precondition', 'Bu oyuncu çetende değil.');
      tx.update(memberRef(worldId, gangId, target), { hqYetki: on ? true : FieldValue.delete() });
      tx.set(db.collection('users').doc(target).collection('messages').doc(), {
        text: on ? `🏴 ${h.ownerName || 'Çete'} karargahında yetkili oldun: mobilya alıp yerleştirebilir, fiyatları ve davetleri düzenleyebilirsin.` : `🏴 ${h.ownerName || 'Çete'} karargahındaki yetkin kaldırıldı.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'hqYetki',
      });
    });
    return { ok: true, uid: target, on };
  }

  // ---- davet: başka bir çeteyi karargaha davet et / daveti kaldır ----------------------
  // Daveti kaldırmak içerideki misafirleri ATMAZ (yetkililer elle çıkarabilir).
  async function setInvite(uid, p) {
    // v157.4: davet sistemi kaldırıldı — karargahlar haritada, herkes girebilir; sadece kaldırmaya izin
    if (p?.on === true) fail('failed-precondition', 'Karargah davetleri kaldırıldı.');
    const houseId = String(p.houseId || '');
    const target = String(p.gangId || '');
    if (!GANG_ID_RE.test(target)) fail('invalid-argument', 'Geçersiz çete.');
    const h = await loadHq(houseId);
    const { gangId, worldId } = h.hq;
    if (target === gangId) fail('invalid-argument', 'Kendi çeteni davet edemezsin.');
    const on = p.on === true;
    await db.runTransaction(async (tx) => {
      await requireManager(h, uid, tx);
      const [hs, ts] = await Promise.all([tx.get(houseRef(houseId)), tx.get(gangRef(worldId, target))]);
      const cur = Array.isArray(hs.data()?.hqInvites) ? hs.data().hqInvites : [];
      if (on) {
        if (!ts.exists || ts.data().status !== 'active') fail('failed-precondition', 'Bu çete artık yok.');
        if (!cur.includes(target) && cur.length >= HQ_MAX_INVITES) fail('failed-precondition', `En fazla ${HQ_MAX_INVITES} çete davet edilebilir.`);
        tx.update(houseRef(houseId), { hqInvites: FieldValue.arrayUnion(target) });
      } else {
        tx.update(houseRef(houseId), { hqInvites: FieldValue.arrayRemove(target) });
      }
      if (on && !cur.includes(target)) tx.set(chatRef(worldId, target).doc(), { system: true, text: `📨 ${h.ownerName || 'Bir çete'} çeteni karargahına davet etti (Savaş › Davetler).`, createdAtMs: now() });
    });
    return { ok: true, gangId: target, on };
  }

  // ---- rapor (ofislerdeki gibi: bugün + dün) -----------------------------------------
  async function report(uid, p) {
    const houseId = String(p.houseId || '');
    const h = await loadHq(houseId);
    await requireManager(h, uid);
    const day = (ms) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
    const t = now();
    const [a, b] = await Promise.all([db.doc(`officeDaily/${houseId}_${day(t)}`).get(), db.doc(`officeDaily/${houseId}_${day(t - 86_400_000)}`).get()]);
    const pick = (s) => (s.exists ? { ...s.data(), cust: Object.keys(s.data().cust || {}).length } : null);
    return { ok: true, today: pick(a), yesterday: pick(b), todayKey: day(t), yesterdayKey: day(t - 86_400_000) };
  }

  // ---- çete kapanınca: karargah + sohbeti + envanter + pazar ilanları + içeridekiler ----
  async function dissolve(gangId, { deleteListings } = {}) {
    if (!GANG_ID_RE.test(String(gangId || ''))) return { ok: false };
    const houseId = hqHouseId(gangId);
    const ref = houseRef(houseId);
    const pres = await db.collection('housePresence').where('houseId', '==', houseId).limit(200).get();
    const batch = db.batch();
    pres.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection('houseInventories').doc(gangOwnerKey(gangId)));
    batch.delete(db.collection('houseFunds').doc(houseId));
    await batch.commit();
    if (deleteListings) await deleteListings(gangOwnerKey(gangId)).catch((e) => console.error('hq listings', gangId, e));
    if (typeof db.recursiveDelete === 'function') await db.recursiveDelete(ref);
    else {
      const chat = await ref.collection('chat').limit(500).get();
      const b2 = db.batch();
      chat.docs.forEach((d) => b2.delete(d.ref));
      b2.delete(ref);
      await b2.commit();
    }
    return { ok: true, houseId };
  }

  return { liveWorldId, hqRole, isManager, requireManager, policeIdentity, ensure, info, setYetki, setInvite, report, dissolve, loadHq, stateRef };
}
