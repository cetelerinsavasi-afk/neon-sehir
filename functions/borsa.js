// =============================================================================
// v176 — NEON BORSA: seyyar satıcı hisseleri (sunucu + istemci ortak saf kurallar)
// -----------------------------------------------------------------------------
// KURALLAR (kullanıcı kararları):
//   • 6 mekân (seyyar satıcı) + v177: 4 şirket (hastane, nakliye, terminal, taksi durağı), her birinin 100 hissesi. Hisseler 1'er 1'er alınıp satılır.
//   • Fiyat: n = satılmış hisse sayısı. Alış (n+1)×1.000, satış n×1.000. 100'ü dolunca alış
//     durur (satış 100.000). Alışta %1 komisyon eklenir, satışta %1 kesilir — komisyon
//     oyundan çıkar (kimseye yazılmaz). ör. n=1: alış 2.020, satış 990.
//   • Oyuncu başına mekân başına en çok 10 hisse (%10).
//   • Al-satta vergi yok. Hisse satış parası borca gitmez.
//   • Günlük gelir: seyyar satıcının günlük cirosu (bağış + menü) gece hisse sahiplerine
//     hisse başı eşit yazılır (tek hisse varsa gelirin tamamı onun). Hiç hissedar yoksa o
//     günün geliri belediyeye (seyyar_sahipsiz · Ticaret).
//   • Gelir sınırsız birikir. Toplarken o günün "Hisse Senedi Gelir Vergisi" (Ticaret
//     Bakanlığı, %1–%20) kesilir; borç varsa vergiden sonra kalanın yarısı borca gider.
//   • 20 gün boyunca hiç al-sat yapmayan ve gelir toplamayan oyuncunun hisseleri gece
//     satılır (en uzun süredir pasif olan önce, en değerli hisseden başlayarak), biriken
//     geliri vergi + borç payı düşülüp yatırılır, SMS gider.
//   • Hesap silinince hisseleri havuza döner.
//
// FIRESTORE (maliyet):
//   borsa/piyasa — TEK belge: mekân başına { n, h (hissedar), acc, inc[10], ch[168] }.
//     Uygulama açıkken dinlenir. Gece dağıtımı her hissedara yazmaz: "hisse başı birikmiş
//     gelir" sayacı (acc, binde bir altın) artar; oyuncunun geliri = hisse × (acc − a).
//   users/{uid}.borsa — { <mekân>: { n, a, p, c } } (n hisse, a son hesaplaşmadaki acc,
//     p hesaplaşmış biriken gelir, c hisselerin alış maliyeti) + borsaSon (son işlem, ms).
//     Oyuncu belgesi zaten dinleniyor → ek okuma yok.
//   Gelir verisi: buyFromVendor zaten yazdığı devlet defteri parçasına hs_<kod> sayacı
//   ekler (ek yazma yok). Saat başı iş (cronTick) dünün parçalarını okur (≤16 okuma/gün).
// =============================================================================

export const BORSA_UNIT = 1000;
export const BORSA_SHARES = 100;
export const BORSA_MAX_PER_PLAYER = 10;
export const BORSA_COMMISSION = 0.01;
export const BORSA_IDLE_DAYS = 20;
export const BORSA_CHART_LEN = 24 * 7; // saatlik nokta, 7 gün
export const BORSA_INC_LEN = 10; // son 10 günün geliri
export const BORSA_ACC_SCALE = 1000; // acc: binde bir altın / hisse
export const BORSA_DOC = 'borsa/piyasa';
export const BORSA_TAX_RATE_ID = 'hisse';

// Mekânlar (kimlik = vendorData VENDORS[..].venue) · sk: buyFromVendor istatistik kodu
export const BORSA_COS = [
  { id: 'kokorecci', vendor: 'seyyar_satici_1', sk: 'kk', name: 'Kokoreçci' },
  { id: 'simitci', vendor: 'seyyar_satici_2', sk: 'sm', name: 'Simitçi' },
  { id: 'donerci', vendor: 'seyyar_satici_3', sk: 'dn', name: 'Balık Ekmekçi' },
  { id: 'kofteci', vendor: 'seyyar_satici_4', sk: 'kf', name: 'Köfteci' },
  { id: 'midyeci', vendor: 'seyyar_satici_5', sk: 'md', name: 'Midyeci' },
  { id: 'dondurmaci', vendor: 'seyyar_satici_6', sk: 'dd', name: 'Dondurmacı' },
  // v177 — şirketler: gelir = o gün satılan yeni ticari aracın yarısı + şoför gelirlerinin %10'u
  { id: 'hastane', sk: 'hn', name: 'Hastane', kind: 'sirket' },
  { id: 'nakliye', sk: 'nk', name: 'Nakliye', kind: 'sirket' },
  { id: 'terminal', sk: 'tm', name: 'Terminal', kind: 'sirket' },
  { id: 'taksi', sk: 'tk', name: 'Taksi Durağı', kind: 'sirket' },
];
export const BORSA_CO_IDS = BORSA_COS.map((c) => c.id);
export const BORSA_CO_BY_ID = Object.fromEntries(BORSA_COS.map((c) => [c.id, c]));
export const borsaCoOfVendor = (vendorId) => BORSA_COS.find((c) => c.vendor === vendorId) || null;
export const isBorsaCo = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BORSA_CO_BY_ID, id);
// buyFromVendor'un devlet defteri parçasına eklediği gelir sayacı
export const borsaIncomeStatKey = (sk) => `hs_${sk}`;
// v177: şirket kimliğinden gelir sayacı (fleet.js)
export const borsaCompanyStatKey = (coId) => (BORSA_CO_BY_ID[coId] ? borsaIncomeStatKey(BORSA_CO_BY_ID[coId].sk) : null);

// ---- fiyatlar (n = şu an satılmış hisse) ----
export const buyBase = (n) => (n >= BORSA_SHARES ? null : (n + 1) * BORSA_UNIT);
export const sellBase = (n) => Math.max(0, n) * BORSA_UNIT;
export const buyCost = (n) => (n >= BORSA_SHARES ? null : Math.ceil(buyBase(n) * (1 + BORSA_COMMISSION)));
export const sellGet = (n) => (n <= 0 ? 0 : Math.floor(sellBase(n) * (1 - BORSA_COMMISSION)));

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const int = (v) => Math.max(0, Math.floor(num(v)));

// Piyasa belgesindeki bir mekân (eksikse boş)
export function coState(market, id) {
  const c = market?.co?.[id] || {};
  return {
    n: Math.min(BORSA_SHARES, int(c.n)),
    h: int(c.h),
    acc: int(c.acc),
    inc: Array.isArray(c.inc) ? c.inc.map(int).slice(-BORSA_INC_LEN) : [],
    // v182: 1 hissenin günlük kazancı (son 10 gün; hissedarı yoksa tek hisse hepsini alırdı)
    ps: Array.isArray(c.ps) ? c.ps.map(int).slice(-BORSA_INC_LEN) : [],
    ch: Array.isArray(c.ch) ? c.ch.map(int).slice(-BORSA_CHART_LEN) : [],
  };
}
// Oyuncunun bir mekândaki payı (eksikse boş)
export function holdState(player, id) {
  const h = player?.borsa?.[id] || {};
  return { n: int(h.n), a: int(h.a), p: int(h.p), c: int(h.c) };
}
// Biriken (henüz toplanmamış, vergisiz) gelir
export function pendingOf(hold, co) {
  const d = Math.max(0, int(co?.acc) - int(hold?.a));
  return int(hold?.p) + Math.floor((int(hold?.n) * d) / BORSA_ACC_SCALE);
}
// Hesaplaşma: biriken gelir p'ye geçer, a güncel acc olur (hisse sayısı değişmeden önce)
export function settle(hold, co) {
  return { ...hold, p: pendingOf(hold, co), a: int(co?.acc) };
}
export function pendingAll(player, market) {
  const by = {};
  let total = 0;
  for (const id of BORSA_CO_IDS) {
    const v = pendingOf(holdState(player, id), coState(market, id));
    if (v > 0) {
      by[id] = v;
      total += v;
    }
  }
  return { by, total };
}
// Toplama: vergi (o günün oranı) + borç varsa vergiden sonra kalanın yarısı borca
export function splitCollect(gross, taxFrac, debt) {
  const g = int(gross);
  const tax = Math.min(g, Math.round(g * Math.max(0, num(taxFrac))));
  const net = g - tax;
  const d = int(debt);
  const toDebt = d > 0 ? Math.min(d, Math.floor(net / 2)) : 0;
  return { gross: g, tax, net, toDebt, pay: net - toDebt };
}
// 24 saat önceye göre % değişim (ch: saat başı noktalar, sonuncusu bu saatin başı; cur: şimdiki fiyat).
// Kullanıcı isteği: yatırımlardaki gibi 1 saatlik değil, 24 saatlik değişim.
export function change24h(ch, cur) {
  const pts = Array.isArray(ch) ? ch : [];
  if (pts.length < 25) return null;
  const prev = num(pts[pts.length - 25]);
  if (prev <= 0) return cur > 0 ? null : 0;
  return ((num(cur) - prev) / prev) * 100;
}
export const avgIncome = (inc) => (inc?.length ? inc.reduce((a, b) => a + num(b), 0) / inc.length : 0);
// Liste sırası: son 10 günün gelir ortalaması (yüksekten düşüğe)
export function sortCos(market) {
  return [...BORSA_COS].sort((a, b) => avgIncome(coState(market, b.id).inc) - avgIncome(coState(market, a.id).inc) || a.name.localeCompare(b.name, 'tr'));
}
// Bir oyuncunun tüm hisselerini sırayla satarsa eline geçecek (en değerliden; her satış fiyatı düşürür)
export function sellAllValue(holdN, coN) {
  let total = 0;
  let n = int(coN);
  for (let i = 0; i < int(holdN) && n > 0; i++) total += sellGet(n--);
  return total;
}

// =============================================================================
// Sunucu
// =============================================================================
// deps: { db, FieldValue, HttpsError, goldTag, stateWrite, taxFrac: () => oran (0..1),
//         dayKey(ms), addDayKey(k, n), now }
export function createBorsa({ db, FieldValue, HttpsError, goldTag, stateWrite, taxFrac, dayKey, addDayKey, now = () => Date.now(), log = console }) {
  const fail = (code, msg) => {
    throw new HttpsError(code, msg);
  };
  const marketRef = () => db.doc(BORSA_DOC);
  const userRef = (uid) => db.collection('users').doc(uid);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const hasAny = (player, skip = {}) =>
    BORSA_CO_IDS.some((id) => {
      const h = { ...holdState(player, id), ...(skip[id] || {}) };
      return h.n > 0 || h.p > 0;
    });

  // ---- Al / Sat (1 hisse) -------------------------------------------------
  async function trade(uid, data) {
    const id = data?.co;
    const op = data?.op;
    if (!isBorsaCo(id)) fail('invalid-argument', 'Geçersiz mekân.');
    if (op !== 'al' && op !== 'sat') fail('invalid-argument', 'Geçersiz işlem.');
    const t = now();
    return db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const market = mSnap.data() || {};
      const co = coState(market, id);
      let hold = settle(holdState(user, id), co);
      const u = { borsaSon: t };
      const m = { updatedAtMs: t };
      let price;
      if (op === 'al') {
        if (co.n >= BORSA_SHARES) fail('failed-precondition', 'Bu mekânın hisseleri tükendi.');
        if (hold.n >= BORSA_MAX_PER_PLAYER) fail('failed-precondition', `Bir mekândan en fazla ${BORSA_MAX_PER_PLAYER} hisse alabilirsin.`);
        price = buyCost(co.n);
        if ((user.gold || 0) < price) fail('failed-precondition', 'Yetersiz altın.');
        const base = buyBase(co.n);
        u.gold = FieldValue.increment(-price);
        u.goldTag = goldTag('borsa', { borsaKom: -(price - base) });
        hold = { ...hold, n: hold.n + 1, c: hold.c + base };
        m.co = { [id]: { n: co.n + 1, h: co.h + (hold.n === 1 ? 1 : 0) } };
      } else {
        if (hold.n <= 0) fail('failed-precondition', 'Bu mekânda hissen yok.');
        price = sellGet(co.n);
        const base = sellBase(co.n);
        const avg = Math.floor(hold.c / hold.n);
        u.gold = FieldValue.increment(price);
        u.goldTag = goldTag('borsa', { borsaKz: base - avg, borsaKom: -(base - price) });
        hold = { ...hold, n: hold.n - 1, c: hold.n - 1 > 0 ? hold.c - avg : 0 };
        m.co = { [id]: { n: Math.max(0, co.n - 1), h: Math.max(0, co.h - (hold.n === 0 ? 1 : 0)) } };
      }
      if (hold.n > 0 || hold.p > 0) u[`borsa.${id}`] = hold;
      else u[`borsa.${id}`] = FieldValue.delete();
      if (!hasAny(user, { [id]: hold })) u.borsaSon = FieldValue.delete();
      tx.update(userRef(uid), u);
      tx.set(marketRef(), m, { merge: true });
      return { ok: true, op, co: id, price, n: hold.n, coN: m.co[id].n };
    });
  }

  // ---- v181: Hisselerim › Hepsini sat (tüm mekânlar, onaylı) -------------------
  // Her mekânda hisseler sırayla satılır (her satışta fiyat bir basamak düşer — tek tek satmakla aynı).
  // Biriken gelir silinmez (sonra toplanır). expect: ekranda gösterilen toplam; değiştiyse satış olmaz.
  async function sellAll(uid, data) {
    const t = now();
    return db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const market = mSnap.data() || {};
      const u = {};
      const m = { co: {}, updatedAtMs: t };
      let total = 0;
      let kz = 0;
      let kom = 0;
      let shares = 0;
      const after = {};
      for (const id of BORSA_CO_IDS) {
        const co = coState(market, id);
        const hold = settle(holdState(user, id), co);
        if (hold.n <= 0) continue;
        let n = co.n;
        let base = 0;
        let got = 0;
        for (let i = 0; i < hold.n && n > 0; i++) {
          base += sellBase(n);
          got += sellGet(n);
          n -= 1;
        }
        total += got;
        kz += base - hold.c;
        kom += base - got;
        shares += hold.n;
        m.co[id] = { n, h: Math.max(0, co.h - 1) };
        const left = { ...hold, n: 0, c: 0 };
        after[id] = left;
        u[`borsa.${id}`] = left.p > 0 ? left : FieldValue.delete();
      }
      if (!shares) fail('failed-precondition', 'Satılacak hissen yok.');
      if (data?.expect != null && Number(data.expect) !== total) fail('aborted', `price-changed:${total}`);
      u.gold = FieldValue.increment(total);
      u.goldTag = goldTag('borsa', { borsaKz: kz, borsaKom: -kom });
      u.borsaSon = hasAny(user, after) ? t : FieldValue.delete();
      tx.update(userRef(uid), u);
      tx.set(marketRef(), m, { merge: true });
      return { ok: true, op: 'satHepsi', total, shares };
    });
  }

  // ---- Gelirleri topla ------------------------------------------------------
  async function collect(uid) {
    const t = now();
    const day = dayKey(t);
    return db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user) fail('failed-precondition', 'Oyuncu bulunamadı.');
      const market = mSnap.data() || {};
      const { by, total } = pendingAll(user, market);
      if (total <= 0) fail('failed-precondition', 'Toplanacak gelir yok.');
      const r = splitCollect(total, taxFrac(day), user.debtToState);
      const u = { gold: FieldValue.increment(r.pay), goldTag: goldTag('borsaGelir'), borsaSon: t };
      if (r.toDebt) u.debtToState = FieldValue.increment(-r.toDebt);
      for (const id of BORSA_CO_IDS) {
        const h = holdState(user, id);
        if (!h.n && !h.p) continue;
        const co = coState(market, id);
        u[`borsa.${id}`] = h.n > 0 ? { ...h, p: 0, a: co.acc } : FieldValue.delete();
      }
      if (!BORSA_CO_IDS.some((id) => holdState(user, id).n > 0)) u.borsaSon = FieldValue.delete();
      tx.update(userRef(uid), u);
      stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'vergi_hisse', amount: r.tax, atMs: t, dayKey: day, stat: { bs_topla_n: 1, bs_brut: r.gross } });
      return { ok: true, ...r, by };
    });
  }

  // ---- Gece: bir günün gelirini dağıt ---------------------------------------
  async function incomesOf(day) {
    const snap = await db.collection('stateLedger').where('dayKey', '==', day).get();
    const out = Object.fromEntries(BORSA_CO_IDS.map((id) => [id, 0]));
    snap.docs.forEach((d) => {
      const st = d.data()?.stat || {};
      for (const c of BORSA_COS) out[c.id] += int(st[borsaIncomeStatKey(c.sk)]);
    });
    return out;
  }
  // İlk açılış: son 10 günün eski seyyar cirosu (sy_<kod>_ciro) ortalama için tohumlanır
  async function seedIncomes(today) {
    const from = addDayKey(today, -BORSA_INC_LEN);
    const snap = await db.collection('stateDays').where('dayKey', '>=', from).get();
    const days = snap.docs
      .map((d) => d.data())
      .filter((d) => d.dayKey < today)
      .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1))
      .slice(-BORSA_INC_LEN);
    const inc = Object.fromEntries(BORSA_CO_IDS.map((id) => [id, []]));
    days.forEach((d) => BORSA_COS.forEach((c) => inc[c.id].push(int(d.stat?.[`sy_${c.sk}_ciro`]))));
    return inc;
  }

  // Saat başı (cronTick): grafik noktası + (gerekirse) biten günlerin dağıtımı + 20 gün kuralı.
  // Dağıtım kaçırılan günleri de (en çok 7) sırayla yapar; distDay ile iki kez yapılmaz.
  async function hourly() {
    const t = now();
    const today = dayKey(t);
    const yday = addDayKey(today, -1);
    const hourKey = `${today}T${String(new Date(t + 3 * 3600_000).getUTCHours()).padStart(2, '0')}`;
    const pre = (await marketRef().get()).data() || null;
    const init = !pre?.distDay;
    const seeds = init ? await seedIncomes(today).catch(() => null) : null;
    const dues = [];
    if (!init) for (let d = addDayKey(pre.distDay, 1); d <= yday && dues.length < 7; d = addDayKey(d, 1)) dues.push(d);
    if (!init && dues.length && dues[dues.length - 1] < yday) dues.push(yday); // 7 günden eski kaçırılanlar atlanır
    const incomes = {};
    for (const d of dues) incomes[d] = await incomesOf(d);
    const res = await db.runTransaction(async (tx) => {
      const mSnap = await tx.get(marketRef());
      const market = mSnap.data() || null;
      const out = { distributed: [], unowned: {}, chart: false, init: false };
      const patch = { co: {}, updatedAtMs: t };
      const nowInit = !market?.distDay;
      if (nowInit) {
        // ilk kurulum: bugünün geliri yarın (00:00'dan sonra) dağıtılır
        patch.v = 1;
        patch.distDay = yday;
        patch.startDay = today;
        out.init = true;
      }
      const doDist = !nowInit && dues.length > 0 && market.distDay === pre?.distDay;
      for (const c of BORSA_COS) {
        const co = coState(market, c.id);
        const p = {};
        if (nowInit) {
          p.n = co.n;
          p.h = co.h;
          p.acc = co.acc;
          p.inc = co.inc.length ? co.inc : (seeds?.[c.id] || []).slice(-BORSA_INC_LEN);
        }
        if (doDist) {
          let acc = co.acc;
          let inc = co.inc;
          let ps = co.ps;
          for (const d of dues) {
            const gross = int(incomes[d]?.[c.id]);
            if (co.n > 0) acc += Math.floor((gross * BORSA_ACC_SCALE) / co.n);
            else if (gross > 0) out.unowned[d] = (out.unowned[d] || 0) + gross;
            inc = [...inc, gross].slice(-BORSA_INC_LEN);
            ps = [...ps, co.n > 0 ? Math.floor(gross / co.n) : gross].slice(-BORSA_INC_LEN);
          }
          p.acc = acc;
          p.inc = inc;
          p.ps = ps;
        }
        if (market?.chHour !== hourKey) {
          p.ch = [...co.ch, sellBase(co.n)].slice(-BORSA_CHART_LEN);
          out.chart = true;
        }
        if (Object.keys(p).length) patch.co[c.id] = p;
      }
      if (out.chart) patch.chHour = hourKey;
      if (doDist) {
        patch.distDay = dues[dues.length - 1];
        out.distributed = dues;
        for (const [d, amt] of Object.entries(out.unowned)) stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'seyyar_sahipsiz', amount: amt, atMs: t, dayKey: d });
      }
      if (nowInit || doDist || out.chart) tx.set(marketRef(), patch, { merge: true });
      return out;
    });
    if (res.distributed.length) {
      log.log?.(`borsa: ${res.distributed.join(', ')} geliri dağıtıldı`);
      await sweepIdle().catch((err) => log.error?.('borsa 20 gün', err));
    }
    return res;
  }

  // ---- 20 gün kuralı --------------------------------------------------------
  async function sweepIdle() {
    const cutoff = now() - BORSA_IDLE_DAYS * 86_400_000;
    const snap = await db.collection('users').where('borsaSon', '<', cutoff).orderBy('borsaSon', 'asc').limit(100).get();
    let n = 0;
    for (const d of snap.docs) {
      try {
        if (await liquidate(d.id, cutoff)) n++;
      } catch (err) {
        log.error?.(`borsa tasfiye ${d.id}`, err);
      }
    }
    return n;
  }
  async function liquidate(uid, cutoff) {
    const t = now();
    const day = dayKey(t);
    return db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user || !(Number(user.borsaSon) < cutoff)) return false;
      const market = mSnap.data() || {};
      const { total } = pendingAll(user, market);
      // en değerli hisseden başlayarak sat
      const order = BORSA_CO_IDS.filter((id) => holdState(user, id).n > 0).sort((a, b) => coState(market, b).n - coState(market, a).n);
      let sale = 0;
      let kom = 0;
      let kz = 0;
      const m = { co: {}, updatedAtMs: t };
      for (const id of order) {
        const h = holdState(user, id);
        const co = coState(market, id);
        let n = co.n;
        let base = 0;
        for (let i = 0; i < h.n && n > 0; i++) {
          base += sellBase(n);
          sale += sellGet(n);
          kom += sellBase(n) - sellGet(n);
          n--;
        }
        kz += base - h.c;
        m.co[id] = { n, h: Math.max(0, co.h - 1) };
      }
      const r = splitCollect(total, taxFrac(day), user.debtToState);
      const u = { borsa: FieldValue.delete(), borsaSon: FieldValue.delete(), gold: FieldValue.increment(sale + r.pay), goldTag: goldTag('borsa', { borsaKz: kz, borsaKom: -kom, borsaGelir: r.pay }) };
      if (r.toDebt) u.debtToState = FieldValue.increment(-r.toDebt);
      tx.update(userRef(uid), u);
      if (order.length) tx.set(marketRef(), m, { merge: true });
      if (r.tax) stateWrite(tx, db, FieldValue, { kind: 'in', cat: 'vergi_hisse', amount: r.tax, atMs: t, dayKey: day });
      const parts = [];
      if (order.length) parts.push(`hisselerin ${fmt(sale)} altına satıldı`);
      if (r.gross) parts.push(`biriken gelirin ${fmt(r.gross)} altından vergi (${fmt(r.tax)})${r.toDebt ? ` ve borç payı (${fmt(r.toDebt)})` : ''} düşülüp ${fmt(r.pay)} altın olarak yatırıldı`);
      tx.set(userRef(uid).collection('messages').doc(), {
        text: `📈 Neon Borsa: 20 gündür işlem yapmadığın için ${parts.join(', ')}. Toplam ${fmt(sale + r.pay)} altın hesabına geçti.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        type: 'borsa_tasfiye',
      });
      return true;
    });
  }

  // ---- Hesap silme: hisseler havuza döner -----------------------------------
  async function releaseForDeletion(uid) {
    return db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef(uid)), tx.get(marketRef())]);
      const user = uSnap.data();
      if (!user?.borsa) return 0;
      const market = mSnap.data() || {};
      const m = { co: {}, updatedAtMs: now() };
      let shares = 0;
      for (const id of BORSA_CO_IDS) {
        const h = holdState(user, id);
        if (!h.n) continue;
        const co = coState(market, id);
        m.co[id] = { n: Math.max(0, co.n - h.n), h: Math.max(0, co.h - 1) };
        shares += h.n;
      }
      tx.update(userRef(uid), { borsa: FieldValue.delete(), borsaSon: FieldValue.delete() });
      if (shares) tx.set(marketRef(), m, { merge: true });
      return shares;
    });
  }

  return { trade, sellAll, collect, hourly, sweepIdle, liquidate, releaseForDeletion, incomesOf };
}
