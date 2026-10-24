// =============================================================================
// v86.1 — OYUNCU ADI EŞİTLEME
// Oyuncunun adı bazı belgelere kopyalanıyor (çete üyeliği, Mafya Babası adı,
// imam, ev/işletme sahibi, fabrika sahibi/işçisi, futbolcu, Sixtagram profili, arkadaş
// listeleri). Ad değişince bu kopyalar eski adda kalıyordu.
//   • syncPlayerName(uid)  — ad değişir değişmez (setDisplayName) çağrılır.
//   • sweepNames()         — haftalık tarama: kopyaları users/{uid}.displayName ile
//                            karşılaştırır, farklı olanları düzeltir (önceden
//                            değişmiş adlar ve anlık eşitlemenin kaçırdıkları).
// Sadece AD alanı yazılır; başka hiçbir alana dokunulmaz.
// v124: ad değişikliği bazen çeteye / arkadaş listesine / ChatsApp sohbet
// listesine yansımıyordu:
//   • ChatsApp sohbet listesindeki ad (dmChats.names) ve bekleyen arkadaşlık
//     isteklerindeki ad (friendRequests) hiç eşitlenmiyordu → eklendi.
//   • Canlı çete dünyası artık gangSystem/config.liveWorldId'den de okunur
//     (dünya belgesi listede çıkmasa bile).
//   • Tek bir belgede hata olunca TÜM toplu yazma düşüyordu → hata veren
//     yazmalar tek tek denenir, biri bozuk olsa da diğerleri yazılır.
//   • users/{uid}.nameSyncPending: ad değişince true; eşitleme hatasız biterse
//     silinir. Hata olursa saatlik iş (retryPendingNames) tekrar dener.
// =============================================================================
const nameOf = (u) => String(u?.displayName || '').trim();

export function createNameSync({ db, FieldValue }) {
  // [{ ref, field, current }] → farklı olanları toplu yazar
  // v124: dönüş { changed, failed } — bir parti hata verirse içindekiler tek tek denenir
  async function applyFixesDetailed(fixes, nameByUid) {
    const todo = fixes.filter((f) => {
      const want = nameByUid.get(f.uid);
      return want && f.current !== want;
    });
    let changed = 0;
    let failed = 0;
    for (let i = 0; i < todo.length; i += 400) {
      const part = todo.slice(i, i + 400);
      const batch = db.batch();
      part.forEach((f) => batch.update(f.ref, { [f.field]: nameByUid.get(f.uid) }));
      try {
        await batch.commit();
        changed += part.length;
      } catch {
        for (const f of part) {
          try {
            await f.ref.update({ [f.field]: nameByUid.get(f.uid) });
            changed += 1;
          } catch {
            failed += 1; // ör. belge bu arada silindi
          }
        }
      }
    }
    return { changed, failed };
  }
  async function applyFixes(fixes, nameByUid) {
    return (await applyFixesDetailed(fixes, nameByUid)).changed;
  }
  // Canlı dünya + listedeki dünyalar (tekrarsız)
  async function worldRefs() {
    const out = new Map();
    const cfg = (await db.doc('gangSystem/config').get().catch(() => null))?.data?.() || {};
    if (cfg.liveWorldId) out.set(cfg.liveWorldId, db.collection('gangWorlds').doc(cfg.liveWorldId));
    const worlds = await db.collection('gangWorlds').get();
    worlds.docs.forEach((w) => {
      if (w.id !== 'test' && !out.has(w.id)) out.set(w.id, w.ref);
    });
    return [...out.values()];
  }

  async function namesOf(uids) {
    const out = new Map();
    const list = [...new Set(uids)].filter(Boolean);
    for (let i = 0; i < list.length; i += 100) {
      const refs = list.slice(i, i + 100).map((u) => db.collection('users').doc(u));
      const snaps = await Promise.all(refs.map((r) => r.get()));
      snaps.forEach((s) => {
        const nm = s.exists ? nameOf(s.data()) : '';
        if (nm) out.set(s.id, nm);
      });
    }
    return out;
  }

  // Tek oyuncu (ad değişince)
  async function syncPlayerName(uid) {
    const us = await db.collection('users').doc(uid).get();
    if (!us.exists) return { changed: 0 };
    const user = us.data();
    const name = nameOf(user);
    if (!name) return { changed: 0 };
    const fixes = [];
    const add = (ref, field, current) => fixes.push({ uid, ref, field, current });

    // imam
    const imam = await db.collection('imamState').doc('current').get();
    if (imam.exists && imam.data()?.uid === uid) add(imam.ref, 'displayName', imam.data().displayName);

    // çeteler (canlı dünya + diğer dünyalar)
    for (const wRef of await worldRefs()) {
      const m = await wRef.collection('memberships').doc(uid).get();
      const gid = m.data()?.gangId;
      if (!gid) continue;
      const gRef = wRef.collection('gangs').doc(gid);
      const [ms, gs, rs] = await Promise.all([gRef.collection('members').doc(uid).get(), gRef.get(), gRef.collection('public').doc('roster').get()]);
      if (ms.exists) add(ms.ref, 'name', ms.data().name);
      if (gs.data()?.babaId === uid) add(gs.ref, 'babaName', gs.data().babaName);
      if (rs.data()?.members?.[uid]) add(rs.ref, `members.${uid}.name`, rs.data().members[uid].name);
    }

    // evler / işletmeler
    const houses = await db.collection('houses').where('ownerUid', '==', uid).limit(20).get();
    houses.forEach((h) => add(h.ref, 'ownerName', h.data().ownerName));

    // fabrika sahibi + çalıştığı makine
    const fac = await db.collection('factories').doc(uid).get();
    if (fac.exists) add(fac.ref, 'ownerName', fac.data().ownerName);
    const job = user.employment;
    if (job?.factoryId && job?.machineId) {
      const mRef = db.collection('factories').doc(String(job.factoryId)).collection('machines').doc(String(job.machineId));
      const mSnap = await mRef.get();
      if (mSnap.exists && mSnap.data()?.workerId === uid) add(mRef, 'workerName', mSnap.data().workerName);
    }

    // v89: futbolcu profili + takımdaki gerçek futbolcu kaydı (kadro, maç, istatistik adı)
    const [fbs, rps] = await Promise.all([db.collection('footballers').doc(uid).get(), db.collection('futbolPlayers').doc(`real_${uid}`).get()]);
    if (fbs.exists) add(fbs.ref, 'name', fbs.data().name);
    if (rps.exists) add(rps.ref, 'name', rps.data().name);

    // Sixtagram profili
    const prof = await db.collection('sixtagramProfiles').doc(uid).get();
    if (prof.exists) add(prof.ref, 'displayName', prof.data().displayName);

    // arkadaş listelerinde benim adım
    const fr = await db.collection('friendships').doc(uid).get();
    const friendIds = Object.keys(fr.data()?.friends || {}).slice(0, 300);
    for (let i = 0; i < friendIds.length; i += 100) {
      const snaps = await Promise.all(friendIds.slice(i, i + 100).map((f) => db.collection('friendships').doc(f).get()));
      snaps.forEach((s) => {
        const entry = s.data()?.friends?.[uid];
        if (entry) add(s.ref, `friends.${uid}.name`, entry.name);
      });
    }

    // v124: ChatsApp sohbet listesindeki adım + bekleyen arkadaşlık isteklerindeki adım
    const [dms, reqFrom, reqTo] = await Promise.all([
      db.collection('dmChats').where('members', 'array-contains', uid).limit(300).get(),
      db.collection('friendRequests').where('fromUid', '==', uid).limit(100).get(),
      db.collection('friendRequests').where('toUid', '==', uid).limit(100).get(),
    ]);
    dms.forEach((d) => add(d.ref, `names.${uid}`, d.data()?.names?.[uid]));
    reqFrom.forEach((d) => add(d.ref, 'fromName', d.data().fromName));
    reqTo.forEach((d) => add(d.ref, 'toName', d.data().toName));

    const { changed, failed } = await applyFixesDetailed(fixes, new Map([[uid, name]]));
    // hatasız bittiyse "bekleyen eşitleme" işareti kalkar (hata varsa saatlik iş tekrar dener)
    if (!failed && user.nameSyncPending) await us.ref.update({ nameSyncPending: FieldValue.delete() }).catch(() => {});
    return { changed, failed };
  }

  // v124: eşitlemesi yarım kalan oyuncular (saatlik — socialCleanup içinde)
  async function retryPendingNames(limit = 30) {
    const snap = await db.collection('users').where('nameSyncPending', '==', true).limit(limit).get();
    let changed = 0;
    for (const d of snap.docs) {
      try {
        changed += (await syncPlayerName(d.id)).changed;
      } catch {
        /* bir sonraki saat tekrar denenir */
      }
    }
    return { pending: snap.size, changed };
  }

  // Haftalık tarama: ad kopyalarını topla → users ile karşılaştır → düzelt
  async function sweepNames() {
    const fixes = [];
    const add = (uid, ref, field, current) => uid && fixes.push({ uid, ref, field, current });

    const imam = await db.collection('imamState').doc('current').get();
    if (imam.exists && imam.data()?.uid) add(imam.data().uid, imam.ref, 'displayName', imam.data().displayName);

    for (const wRef of await worldRefs()) {
      const gangs = await wRef.collection('gangs').where('status', '==', 'active').get();
      for (const g of gangs.docs) {
        if (g.data().babaId) add(g.data().babaId, g.ref, 'babaName', g.data().babaName);
        const [members, roster] = await Promise.all([g.ref.collection('members').get(), g.ref.collection('public').doc('roster').get()]);
        members.forEach((m) => add(m.id, m.ref, 'name', m.data().name));
        Object.entries(roster.data()?.members || {}).forEach(([mid, v]) => add(mid, roster.ref, `members.${mid}.name`, v?.name));
      }
    }

    const houses = await db.collection('houses').get();
    houses.forEach((h) => add(h.data().ownerUid, h.ref, 'ownerName', h.data().ownerName));

    const fbsAll = await db.collection('footballers').get();
    fbsAll.forEach((f) => add(f.id, f.ref, 'name', f.data().name));
    const realPlayers = await db.collection('futbolPlayers').where('real', '==', true).get();
    realPlayers.forEach((r) => add(r.data().realUid, r.ref, 'name', r.data().name));

    const facs = await db.collection('factories').get();
    facs.forEach((f) => add(f.id, f.ref, 'ownerName', f.data().ownerName));

    const nameByUid = await namesOf(fixes.map((f) => f.uid));
    const changed = await applyFixes(fixes, nameByUid);

    // son 8 günde adını değiştirenler: anlık eşitlemenin kaçırdığı yerler (arkadaşlar, makine, Sixtagram)
    const recent = await db.collection('users').where('nameChangedAtMs', '>=', Date.now() - 8 * 24 * 3600 * 1000).limit(500).get();
    let recentChanged = 0;
    for (const u of recent.docs) {
      try {
        recentChanged += (await syncPlayerName(u.id)).changed;
      } catch {
        /* bir oyuncu hata verse de tarama sürer */
      }
    }
    return { checked: fixes.length, changed, recent: recent.size, recentChanged };
  }

  return { syncPlayerName, sweepNames, retryPendingNames };
}
