// =============================================================================
// v147 — Şehir çevrimiçi katmanı (SADECE Realtime Database, Firestore YOK).
//
// Maliyet ilkeleri:
//   • Firestore'a hiçbir şey yazılmaz/okunmaz (konum, araba, sohbet, profil).
//   • Harita 64 m'lik hücrelere bölünür; herkes sadece kendi hücresini ve 8
//     komşusunu dinler → uzaktaki oyuncuların verisi hiç inmez.
//   • Konum sadece değişince ve en sık ~3 kez/sn yazılır; duran oyuncu 20 sn'de
//     bir "buradayım" der. Alan adları kısa (az veri).
//   • RTDB'ye yazılamazsa (izin/bağlantı) Firestore'a DÜŞÜLMEZ; sadece paylaşım
//     durur (oyuncu tek başına gezmeye devam eder).
//   • Bağlantı koparsa kayıtlar sunucuda kendiliğinden silinir (onDisconnect).
// Yollar (kurallar: database.rules.json › city):
//   city/p/{hücre}/{uid}  konum/poz      city/c/{hücre}/{uid}  araba
//   city/m/{hücre}/{uid}  son mesaj      city/u/{uid}           ad + avatar (1 kez)
//   city/s/{sahip}/{k}    yolcu koltuğu (k = 1…3)
// =============================================================================
import { app } from '../../firebase';

const DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
export const CELL = 64;
const OFF = 3000; // dünya → pozitif hücre numarası (v157: otoyol + Kervankent; sunucu functions/cityPhoto.js ile AYNI)
export const cellOf = (x, z) => `${Math.max(0, Math.floor((x + OFF) / CELL))}_${Math.max(0, Math.floor((z + OFF) / CELL))}`;
const neighbors = (cell) => {
  const [a, b] = cell.split('_').map(Number);
  const out = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (a + i >= 0 && b + j >= 0) out.push(`${a + i}_${b + j}`);
  return out;
};
const FRESH_MS = 45_000; // bundan eski kayıt = çıkmış say
const HEARTBEAT_MS = 20_000;
const MOVE_MS = 330; // yürürken en sık
const DRIVE_MS = 220; // sürerken en sık
const CHAT_MS = 1600;
// v192 — RTDB İNDİRME MALİYETİ (kalabalıkta): her yazım, çevredeki (3×3 hücre) HERKESE iner; 100 kişi aynı
// yerdeyse bu saatte GB'larca indirme demek (RTDB: ayda 10 GB ücretsiz, sonra GB başı 1 $). Üç önlem:
//  1) Kalabalıkta yazım aralığı uzar: çevrende ≤15 kişi → aynı (bugünkü his değişmez), 16–30 → ×1,5,
//     31–60 → ×2, 60+ → ×3 (arabada en çok ×2). Alıcı taraf ara değeri kayıt aralığına göre uzatır, akıcı kalır.
//  2) Arabadayken (sürücü / yolcu) kişi kaydı konum için yazılmaz (konumu araba kaydı taşır): sadece
//     durum değişince ya da 3 sn'de bir. Eskiden araba + kişi kaydı ikisi de saniyede ~4,5 kez gidiyordu.
//  3) Araba kaydı hücre içinde yalnızca DEĞİŞEN alanlarla güncellenir (update). Modifiye JSON'u (≤700 bayt)
//     eskiden her konum kaydıyla (saniyede ~4,5 kez) yeniden gidiyordu; artık sadece değişince / 15 sn'de bir.
const IN_CAR_POS_MS = 3000;
const CAR_FULL_MS = 15_000;
export const crowdK = (n) => (n <= 15 ? 1 : n <= 30 ? 1.5 : n <= 60 ? 2 : 3);

let modP = null;
const rt = () => {
  if (!modP) modP = import('firebase/database').then((m) => ({ m, db: m.getDatabase(app, DB_URL) }));
  return modP;
};
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// v192 — readOnly: MİSAFİR (giriş yapmamış) şehri boş görmesin diye diğer oyuncuları SADECE izler: hiçbir şey
// yazmaz, sohbet (m) dinlemez. Kurallar: city/p, city/c, city/u girişsiz okunabilir (database.rules.json).
export function createCityNet({ uid, name, avatar, onPlayer, onPlayerGone, onCar, onCarGone, onChat, onStatus, readOnly = false }) {
  let dead = false;
  let offline = !DB_URL;
  let failures = 0;
  let myCell = null;
  let myCarCell = null;
  let subCells = new Set();
  const unsubs = new Map(); // hücre → [unsub…]
  const cellPlayers = new Map(); // hücre → { uid: kayıt }
  const cellCars = new Map();
  const lastChatT = new Map(); // uid → son gösterilen mesaj zamanı
  const profiles = new Map(); // uid → { n, a } | 'loading'
  const shownPlayers = new Set();
  const shownCars = new Set();
  let lastSent = null;
  let lastSentAt = 0;
  let lastCar = null;
  let lastCarAt = 0;
  let lastChatAt = 0;
  let myRide = null; // { owner, k }
  const armed = new Set();

  // v147.1: tek bir reddedilen/zaman aşımına uğrayan yazım şehri KALICI çevrimdışı
  // yapmıyor (mobil ağda yazımlar topluca gidince reddedilebiliyordu → oyuncu
  // diğerlerine görünmez oluyordu). Üst üste 6 hata → kısa ara, 20 sn sonra yeniden dene.
  let retryT = 0;
  const fail = (err) => {
    const code = String(err?.code || err?.message || '');
    failures += 1;
    if (failures >= 6 && !offline) {
      offline = true;
      console.warn('Şehir çevrimiçi geçici olarak kapalı (RTDB):', code);
      onStatus?.('offline');
      clearTimeout(retryT);
      retryT = setTimeout(() => {
        if (dead) return;
        offline = false;
        failures = 0;
        armed.clear();
        lastSent = null;
        lastCar = null;
        onStatus?.('online');
        setProfile(curName, curAvatar);
      }, 20_000);
    }
  };
  async function put(path, val) {
    if (offline || dead || readOnly) return false;
    try {
      const { m, db } = await rt();
      const r = m.ref(db, path);
      if (!armed.has(path)) {
        armed.add(path);
        m.onDisconnect(r).remove().catch(() => armed.delete(path));
      }
      await withTimeout(m.set(r, { ...val, t: m.serverTimestamp() }), 8000);
      failures = 0;
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }
  // v192: alanları birleştirerek yaz (sadece değişenler iner). Kayıt yoksa / ilk yazımsa put kullanılır.
  async function patch(path, val) {
    if (offline || dead || readOnly) return false;
    if (!armed.has(path)) return put(path, val);
    try {
      const { m, db } = await rt();
      await withTimeout(m.update(m.ref(db, path), { ...val, t: m.serverTimestamp() }), 8000);
      failures = 0;
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }
  async function drop(path) {
    if (readOnly) return;
    try {
      const { m, db } = await rt();
      const r = m.ref(db, path);
      armed.delete(path);
      m.onDisconnect(r).cancel().catch(() => {});
      await m.remove(r);
    } catch {
      /* zaten yok */
    }
  }
  // tek seferlik okuma (önizleme taklidinde de çalışsın diye onValue + bırak)
  async function once(path) {
    const { m, db } = await rt();
    return new Promise((res) => {
      let off = null;
      let done = false;
      off = m.onValue(
        m.ref(db, path),
        (snap) => {
          if (done) return;
          done = true;
          res(snap.val());
          setTimeout(() => off?.(), 0);
        },
        () => res(null)
      );
    });
  }

  // --- profil (ad + avatar) — girişte 1 kez yazılır, diğerleri 1 kez okur ---------
  let curName = name;
  let curAvatar = avatar;
  function setProfile(n, a) {
    // v159: gerçek ad henüz yoksa son bilinen ad korunur; hiç ad yoksa profil yazılmaz
    // (eskiden 'Oyuncu' yazılıyor ve diğer oyuncular bu adı oturum boyunca önbellekte tutuyordu)
    if (n) curName = n;
    if (a) curAvatar = a;
    n = curName;
    a = curAvatar;
    if (n === 'Oyuncu') n = '';
    if (!n && !a) return;
    // v147.1: avatar JSON'u kesilmez (kesik JSON → başkalarında varsayılan avatar); çok uzunsa aksesuarsız
    let aj = JSON.stringify(a || {});
    if (aj.length > 7900) aj = JSON.stringify({ ...(a || {}), acc: undefined });
    if (aj.length > 7900) aj = '{}';
    put(`city/u/${uid}`, { n: String(n || '').slice(0, 40), a: aj });
  }
  // v159.1 — PROFİL TAZELEME: profil eskiden oturum boyunca BİR KEZ okunuyordu. Oyuncu şehre ilk
  // girdiğinde (oyuncu bilgisi gelmeden) ilk adını / varsayılan görünümünü yazmışsa diğerleri onu
  // hep o hâliyle görüyordu (fotoğrafta ise sunucudaki gerçek ad / görünüm çıkıyordu). Artık görünen
  // oyuncuların profili 90 sn'de bir sessizce yeniden okunur (eski hâli gösterilmeye devam eder).
  function parseAv(v) {
    try {
      return v?.a ? JSON.parse(v.a) : null;
    } catch {
      return null;
    }
  }
  function fetchProfile(id, prev) {
    if (prev) prev.busy = true;
    once(`city/u/${id}`).then((v) => {
      const now = Date.now();
      const tries = (prev?.tries || 0) + 1;
      if (v?.n || v?.a) {
        const noName = !v.n || v.n === 'Oyuncu';
        profiles.set(id, { n: v.n || 'Oyuncu', a: parseAv(v), tries: noName ? tries : 0, retryAt: now + (noName && tries < 8 ? 8000 : 90000) });
      } else if (prev) profiles.set(id, { ...prev, busy: false, tries, retryAt: now + (tries < 8 ? 6000 : 60000) });
      else profiles.set(id, { n: 'Oyuncu', a: null, tries, retryAt: now + 4000 }); // henüz yazılmamış (yeni girdi)
      refresh();
    });
  }
  function profileOf(id) {
    const p = profiles.get(id);
    if (!p) {
      profiles.set(id, 'loading');
      fetchProfile(id, null);
      return null;
    }
    if (p === 'loading') return null;
    if (!p.busy && p.retryAt && Date.now() > p.retryAt) fetchProfile(id, p);
    return p;
  }

  // --- dinleme (3×3 hücre) -----------------------------------------------------------
  async function subscribe(cell) {
    const { m, db } = await rt();
    if (dead || !subCells.has(cell)) return;
    const offs = [];
    offs.push(
      m.onValue(m.ref(db, `city/p/${cell}`), (s) => {
        cellPlayers.set(cell, s.val() || {});
        soon();
      })
    );
    offs.push(
      m.onValue(m.ref(db, `city/c/${cell}`), (s) => {
        cellCars.set(cell, s.val() || {});
        soon();
      })
    );
    if (!readOnly) offs.push(
      m.onValue(m.ref(db, `city/m/${cell}`), (s) => {
        const v = s.val() || {};
        const now = Date.now();
        Object.entries(v).forEach(([id, msg]) => {
          if (id === uid || !msg?.x || !msg.t) return;
          if (now - msg.t > 20_000) return;
          if ((lastChatT.get(id) || 0) >= msg.t) return;
          lastChatT.set(id, msg.t);
          onChat?.(id, String(msg.x).slice(0, 200), profileOf(id));
        });
      })
    );
    unsubs.set(cell, offs);
  }
  function unsubscribe(cell) {
    (unsubs.get(cell) || []).forEach((f) => f?.());
    unsubs.delete(cell);
    cellPlayers.delete(cell);
    cellCars.delete(cell);
  }
  function setInterest(cell) {
    const want = new Set(neighbors(cell));
    subCells.forEach((c) => {
      if (!want.has(c)) unsubscribe(c);
    });
    const old = subCells;
    subCells = want;
    want.forEach((c) => {
      if (!old.has(c)) subscribe(c);
    });
    refresh();
  }
  // v191 — KALABALIKTA KASMA: hücredeki HERHANGİ bir oyuncu hareket edince (10 oyuncu ≈ saniyede 30-45
  // kez) bütün oyuncular yeniden motora gönderiliyordu; motor da her seferinde her oyuncunun avatarını
  // (~8 KB) metne çevirip karşılaştırıyordu → saniyede yüzlerce gereksiz iş, çöp toplayıcı takılmaları.
  // Oyuncu sayısı arttıkça iş karesiyle büyüyordu (100 kişide oynanmaz). Artık:
  //  • aynı anda gelen hücre güncellemeleri tek bir birleştirmede işlenir (en sık ~20 kez/sn)
  //  • motora yalnızca kaydı (zaman damgası) ya da profili DEĞİŞEN oyuncu / araba gönderilir.
  // Ağdan inen veri, yazım sıklığı, RTDB / Firestore kullanımı AYNI.
  let soonT = 0;
  let lastRefreshAt = 0;
  function soon() {
    if (soonT || dead) return;
    const wait = Math.max(0, 50 - (Date.now() - lastRefreshAt));
    soonT = setTimeout(() => {
      soonT = 0;
      refresh();
    }, wait);
  }
  const sentP = new Map(); // uid → { t, x, z, pr } (motora en son gönderilen)
  const sentC = new Map(); // uid → { t, x, z, n }
  // tüm hücrelerden birleştir → motora bildir
  function refresh() {
    if (dead) return;
    lastRefreshAt = Date.now();
    const now = Date.now();
    const players = new Map();
    cellPlayers.forEach((obj) => {
      Object.entries(obj).forEach(([id, rec]) => {
        if (id === uid || !rec || typeof rec.x !== 'number') return;
        if (rec.t && now - rec.t > FRESH_MS) return;
        const cur = players.get(id);
        if (!cur || (rec.t || 0) > (cur.t || 0)) players.set(id, rec);
      });
    });
    const cars = new Map();
    cellCars.forEach((obj) => {
      Object.entries(obj).forEach(([id, rec]) => {
        if (id === uid || !rec || typeof rec.x !== 'number') return;
        if (rec.t && now - rec.t > 10 * 60_000) return; // park halindeki araba 10 dk
        const cur = cars.get(id);
        if (!cur || (rec.t || 0) > (cur.t || 0)) cars.set(id, rec);
      });
    });
    players.forEach((rec, id) => {
      const pr = profileOf(id);
      if (!pr) return; // profil gelince tekrar çağrılır
      shownPlayers.add(id);
      const last = sentP.get(id);
      if (last && last.pr === pr && last.t === rec.t && last.x === rec.x && last.z === rec.z) return; // değişmedi
      sentP.set(id, { t: rec.t, x: rec.x, z: rec.z, pr });
      onPlayer?.(id, { ...rec, n: pr.n, a: pr.a });
    });
    // v147.1: hücre değiştiren / anlık kopan oyuncu hemen silinmez (yanıp sönme yok)
    shownPlayers.forEach((id) => {
      if (players.has(id)) {
        missP.delete(id);
        return;
      }
      if (!missP.has(id)) missP.set(id, now);
      else if (now - missP.get(id) > 3500) {
        missP.delete(id);
        shownPlayers.delete(id);
        sentP.delete(id);
        onPlayerGone?.(id);
      }
    });
    cars.forEach((rec, id) => {
      shownCars.add(id);
      const pr = profiles.get(id);
      const n = pr && pr !== 'loading' ? pr.n : null;
      const last = sentC.get(id);
      if (last && last.t === rec.t && last.x === rec.x && last.z === rec.z && last.n === n) return; // değişmedi
      sentC.set(id, { t: rec.t, x: rec.x, z: rec.z, n });
      onCar?.(id, { ...rec, n });
    });
    shownCars.forEach((id) => {
      if (cars.has(id)) {
        missC.delete(id);
        return;
      }
      if (!missC.has(id)) missC.set(id, now);
      else if (now - missC.get(id) > (myRide?.owner === id ? 9000 : 3500)) {
        missC.delete(id);
        shownCars.delete(id);
        sentC.delete(id);
        onCarGone?.(id);
      }
    });
  }
  // eskiyen kayıtlar (sekmesi kapanmadan donan telefonlar) 5 sn'de bir temizlenir
  const missP = new Map();
  const missC = new Map();
  const sweep = setInterval(refresh, 1500);

  // --- yazma (motor her ~100 ms tick çağırır) --------------------------------------------
  const changed = (a, b) => {
    if (!a || !b) return true;
    if (Math.hypot(a.x - b.x, a.z - b.z) > 0.2) return true;
    if (Math.abs((a.y ?? 0) - (b.y ?? 0)) > 0.3) return true; // v196: evde kat değişti
    for (const k of ['l', 'm', 'p', 'sy', 'e', 'et', 'h', 'ro', 'rk', 'r', 'hm', 'fj', 'hl', 'fd', 'lz']) if (a[k] !== b[k]) return true; // v196: eve girdi / çıktı hemen gitsin · v216.3: fırlama · v219: helikopter, masadaki yemek
    return false;
  };
  // v160 — ŞEHİR ÖRTÜLÜYKEN GÖRÜNMEZ: karargah / ev / işletme ekranı şehrin üstünde açıkken
  // (şehir arkada bekler) oyuncu eskiden kapının önünde durmaya devam ediyordu (20 sn'de bir
  // "buradayım"). Artık şehir örtülünce konum + son mesaj + araba kaydı silinir, yazım durur;
  // dönünce ilk tick'te hemen yeniden yazılır.
  let away = false;
  let awayT = 0;
  function setAway(on) {
    on = Boolean(on);
    if (on === away || dead) return;
    away = on;
    clearTimeout(awayT);
    const clear = () => {
      if (myCell) {
        drop(`city/p/${myCell}/${uid}`);
        drop(`city/m/${myCell}/${uid}`);
      }
      if (myCarCell) drop(`city/c/${myCarCell}/${uid}`);
    };
    if (on) {
      clear();
      // yolda olan son bir yazım silmeden sonra ulaşırsa diye bir kez daha
      awayT = setTimeout(() => away && !dead && clear(), 1500);
    } else {
      lastSent = null;
      lastSentAt = 0;
      lastCar = null;
      lastCarAt = 0;
    }
  }
  let lastCarFullAt = 0;
  const sameButPos = (a, b) => {
    if (!a || !b) return false;
    for (const k of ['l', 'm', 'p', 'sy', 'e', 'et', 'h', 'ro', 'rk', 'r', 'hm']) if (a[k] !== b[k]) return false;
    return true;
  };
  function tick(state, car) {
    if (dead || away) return;
    const now = Date.now();
    const k = crowdK(shownPlayers.size);
    const cell = cellOf(state.x, state.z);
    if (readOnly) {
      // misafir: sadece çevresini dinler (yazım yok)
      if (cell !== myCell) {
        myCell = cell;
        setInterest(cell);
      }
      return;
    }
    if (cell !== myCell) {
      const old = myCell;
      myCell = cell;
      setInterest(cell);
      if (old) {
        drop(`city/p/${old}/${uid}`);
        drop(`city/m/${old}/${uid}`);
      }
      lastSent = null;
    }
    const inCar = state.p === 'd' || state.p === 'r' || state.p === 'h'; // v219: helikopter (konumu hl taşır, sürüş sıklığında)
    // arabadayken sadece konum değiştiyse seyrek (konumu araba kaydı taşır); yürürken kalabalığa göre
    const minGap = state.hl ? DRIVE_MS : inCar ? (sameButPos(state, lastSent) ? IN_CAR_POS_MS : DRIVE_MS) : MOVE_MS * k;
    if ((changed(state, lastSent) && now - lastSentAt >= minGap) || now - lastSentAt >= HEARTBEAT_MS) {
      lastSent = state;
      lastSentAt = now;
      put(`city/p/${cell}/${uid}`, state);
    }
    // araba
    if (car) {
      const cc = cellOf(car.x, car.z);
      if (cc !== myCarCell) {
        if (myCarCell) drop(`city/c/${myCarCell}/${uid}`);
        myCarCell = cc;
        lastCar = null;
      }
      const moved = !lastCar || Math.hypot(car.x - lastCar.x, car.z - lastCar.z) > 0.15 || Math.abs(car.y - lastCar.y) > 0.02 || car.d !== lastCar.d || car.dn !== lastCar.dn || car.v !== lastCar.v || car.m !== lastCar.m || car.j !== lastCar.j || Math.abs(car.s - lastCar.s) > 1.5;
      if ((moved && now - lastCarAt >= DRIVE_MS * Math.min(2, k)) || now - lastCarAt >= HEARTBEAT_MS * 3) {
        // tam kayıt: ilk yazım / hücre değişti / araç, modifiye ya da iş durumu değişti / 15 sn'de bir
        const full = !lastCar || car.v !== lastCar.v || car.m !== lastCar.m || car.j !== lastCar.j || now - lastCarFullAt > CAR_FULL_MS;
        lastCar = car;
        lastCarAt = now;
        if (full) {
          lastCarFullAt = now;
          put(`city/c/${cc}/${uid}`, car);
        } else {
          const { m: _m, j: _j, v: _v, ...motion } = car;
          patch(`city/c/${cc}/${uid}`, motion);
        }
      }
    } else if (myCarCell) {
      drop(`city/c/${myCarCell}/${uid}`);
      drop(`city/s/${uid}`); // yolcuları indir
      myCarCell = null;
      lastCar = null;
    }
  }
  function say(text) {
    if (readOnly) return false;
    const now = Date.now();
    if (now - lastChatAt < CHAT_MS || !myCell) return false;
    lastChatAt = now;
    put(`city/m/${myCell}/${uid}`, { x: String(text).slice(0, 200) });
    return true;
  }
  // yolcu koltuğu: boş ilk koltuğu atomik olarak kap
  async function claimSeat(owner, seats) {
    if (offline || readOnly) return null;
    try {
      const { m, db } = await rt();
      for (let k = 1; k < Math.min(30, seats); k++) {
        const r = m.ref(db, `city/s/${owner}/${k}`);
        const res = await withTimeout(m.runTransaction(r, (cur) => (cur ? undefined : uid)), 5000);
        if (res?.committed) {
          m.onDisconnect(r).remove().catch(() => {});
          myRide = { owner, k };
          return k;
        }
      }
    } catch (e) {
      fail(e);
    }
    return null;
  }
  function releaseSeat() {
    if (!myRide) return;
    drop(`city/s/${myRide.owner}/${myRide.k}`);
    myRide = null;
  }
  function stop() {
    if (dead) return;
    releaseSeat();
    const paths = [myCell && `city/p/${myCell}/${uid}`, myCell && `city/m/${myCell}/${uid}`, myCarCell && `city/c/${myCarCell}/${uid}`, myCarCell && `city/s/${uid}`, `city/u/${uid}`].filter(Boolean);
    paths.forEach((p) => drop(p));
    dead = true;
    clearInterval(sweep);
    clearTimeout(soonT);
    clearTimeout(awayT);
    clearTimeout(retryT);
    try {
      offConn?.();
    } catch {
      /* yoksay */
    }
    [...unsubs.keys()].forEach(unsubscribe);
  }

  if (!offline && !readOnly) setProfile(name, avatar);
  else onStatus?.('offline');
  // v147.1: bağlantı kopup gelince (mobil ağ) sunucu kayıtlarımızı silmiş olur
  // (onDisconnect) → hemen yeniden yaz + profil
  let offConn = null;
  let wasConnected = false;
  if (!offline) {
    rt()
      .then(({ m, db }) => {
        if (dead) return;
        offConn = m.onValue(m.ref(db, '.info/connected'), (snap) => {
          const c = snap.val() === true;
          if (c && wasConnected === false && armed.size) {
            armed.clear();
            lastSent = null;
            lastCar = null;
            setProfile(curName, curAvatar);
          }
          wasConnected = c;
        });
      })
      .catch(() => {});
  }
  // v191: engelleme listesi değişince herkes motora yeniden gönderilsin (engeli kalkan hemen görünür)
  function resync() {
    sentP.clear();
    sentC.clear();
    refresh();
  }
  const api = { tick, say, claimSeat, releaseSeat, setProfile, setAway, stop, resync, isOffline: () => offline };
  if (import.meta.env?.DEV) window.__cityNet = { api, dbg: () => ({ offline, failures, myCell, subs: [...subCells], lastSentAt, dead, shown: [...shownPlayers], prof: [...profiles.keys()], unsubs: [...unsubs.keys()], cells: Object.fromEntries([...cellPlayers].map(([c, v]) => [c, Object.keys(v)])) }) };
  return api;
}

// v200 — kişisel kutu: cityBox/{uid} = { g: ısmarlama { f, n, i, t }, k: evden çıkarılma { h, t } }.
// Sadece sunucu yazar; sahibi okur ve okuduğunu siler. Tek küçük dinleyici (Firestore yok).
export function watchCityBox(uid, cb) {
  let off = () => {};
  let dead = false;
  rt()
    .then(({ m, db }) => {
      if (dead) return;
      off = m.onValue(m.ref(db, `cityBox/${uid}`), (s) => cb(s.val() || {}), () => {});
    })
    .catch(() => {});
  return () => {
    dead = true;
    off();
  };
}
export function clearCityBox(uid, key) {
  rt()
    .then(({ m, db }) => m.remove(m.ref(db, `cityBox/${uid}/${key}`)))
    .catch(() => {});
}

// =============================================================================
// v219 — paylaşılan küçük düğümler (helikopter kilidi, aktivite parkı topları): city/heli, city/ball/{f|b}
// Sadece motor (cityExtras.js) kullanır. Misafir (readOnly) okur ama yazamaz.
// =============================================================================
export function createSharedNet({ readOnly = false } = {}) {
  let offset = 0;
  let offOff = null;
  let dead = false;
  rt()
    .then(({ m, db }) => {
      if (dead) return;
      offOff = m.onValue(m.ref(db, '.info/serverTimeOffset'), (s) => (offset = Number(s.val()) || 0));
    })
    .catch(() => {});
  const subs = new Set();
  const TS = { '.sv': 'timestamp' };
  return {
    TS: () => TS,
    now: () => Date.now() + offset,
    sub(path, cb) {
      let off = null;
      let gone = false;
      rt()
        .then(({ m, db }) => {
          if (gone || dead) return;
          off = m.onValue(m.ref(db, path), (s) => cb(s.val()), () => {});
        })
        .catch(() => {});
      const un = () => {
        gone = true;
        subs.delete(un);
        try {
          off?.();
        } catch {
          /* yoksay */
        }
      };
      subs.add(un);
      return un;
    },
    set(path, val) {
      if (readOnly || dead) return;
      rt().then(({ m, db }) => withTimeout(m.set(m.ref(db, path), val), 8000)).catch(() => {});
    },
    update(path, val) {
      if (readOnly || dead) return;
      rt().then(({ m, db }) => withTimeout(m.update(m.ref(db, path), val), 8000)).catch(() => {});
    },
    // transaction: fn(cur) → yeni değer | undefined (vazgeç). Promise<boolean> (yazıldı mı)
    async tx(path, fn) {
      if (readOnly || dead) return false;
      try {
        const { m, db } = await rt();
        const r = await withTimeout(m.runTransaction(m.ref(db, path), (cur) => fn(cur), { applyLocally: false }), 8000);
        return Boolean(r?.committed);
      } catch {
        return false;
      }
    },
    onDisc(path, val) {
      if (readOnly || dead) return;
      rt()
        .then(({ m, db }) => (val && typeof val === 'object' ? m.onDisconnect(m.ref(db, path)).update(val) : m.onDisconnect(m.ref(db, path)).set(val)))
        .catch(() => {});
    },
    cancelDisc(path) {
      rt()
        .then(({ m, db }) => m.onDisconnect(m.ref(db, path)).cancel())
        .catch(() => {});
    },
    dispose() {
      dead = true;
      subs.forEach((u) => u());
      try {
        offOff?.();
      } catch {
        /* yoksay */
      }
    },
  };
}
