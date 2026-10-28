import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { houseAction, shopAction } from '../../services/gameActions';
import { botAvatar, botDefaults, botJobOf, botLabel, cleanBotConfig, BOT_ITEM_KEY, BOT_SERVE_LINES } from '../../../functions/botData.js';
import { HOUSE_PRODUCTS, HOUSE_TAKEABLES, VENUE_FREE_TAKE_KEYS } from '../../../functions/houseCatalogData.js';
import { MENU_TYPES, isMenuProduct, menuPriceOf } from '../../../functions/venue.js';
import { officePriceOf } from '../../../functions/officeData.js';

// =============================================================================
// v132 — BOTLAR (Lüks › Bot). Evde / işletmede / ofiste satın alınmış her bot
// eşyasının üstünde bir NPC durur. Ayarı houses/{id}.bots[eşya] (sunucu: botSet).
//   • Hareket: sabit (yakında oturak varsa oturur) · hareket et (yerinin yakınında
//     kısa yürüyüşler, arada oturur) · serbest gez (odada gezer, arada oturur)
//   • Sözler: 3 söz sırayla, aralıklı (boşsa konuşmaz)
//   • Garson: sol üstteki 🛎️ ile sipariş → garson bot oyuncuya yürür, siparişi verir
//     (ücretliyse menü fiyatıyla). Takılırsa ışınlanır.
// Konum herkesin kendi cihazında hesaplanır (Firebase'e yazma YOK).
// =============================================================================

const TICK_MS = 150;
const SPEED = 1.25; // m/sn
const SIT_NEAR = 0.8; // sabit bot: bu kadar yakında oturak varsa oturur
const DELIVER_DIST = 1.0;
const DELIVER_TIMEOUT_MS = 14_000;
const STUCK_MS = 12_000;
const MAX_BOTS = 12;
const SERVE_LINES = BOT_SERVE_LINES.slice(0, 4);
const rnd = Math.random;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

// Odada siparişe uygun ürünler: { product: { itemId, price } }
export function waiterMenu(houseDoc, { venue, isOwner, uid }) {
  const out = {};
  const items = houseDoc?.items || [];
  const bizType = houseDoc?.biz?.type || null;
  const menuBiz = Boolean(bizType && MENU_TYPES.includes(bizType));
  for (const it of items) {
    if (it.p !== 1) continue;
    if (venue && !VENUE_FREE_TAKE_KEYS.includes(it.k)) continue;
    for (const prod of HOUSE_TAKEABLES[it.k] || []) {
      if (!isMenuProduct(prod) || !HOUSE_PRODUCTS[prod] || out[prod]) continue;
      let price = 0;
      let kind = 'take';
      if (!venue && menuBiz && houseDoc.ownerUid !== uid) {
        kind = 'menu';
        price = menuPriceOf(houseDoc, prod);
      } else if (!venue && !isOwner && officePriceOf(houseDoc, prod) > 0) {
        // v132.1: ofisin ücretli ürünü de garsonla gelir (ziyaretçide buton yoktu)
        kind = 'office';
        price = officePriceOf(houseDoc, prod);
      }
      out[prod] = { product: prod, itemId: it.i, price, kind };
    }
  }
  return out;
}

export function useHouseBots({ engineRef, engineKey, phase, houseId, houseDoc, designItems, venue, mode, isOwner, user, npcsRef, pushOthers, flash }) {
  // --- bot listesi (sunucudaki kayıtlı hâl) ------------------------------------------
  const defs = useMemo(() => {
    const list = [];
    if (venue) {
      (venue.bots || []).forEach((b) => list.push({ i: b.i, x: b.x, z: b.z, cfg: cleanBotConfig(b.cfg), fresh: false }));
    } else {
      // v132.1: Tasarla'da odadaki (henüz satın alınmamış dahil) her platformda bot
      // görünür ve platformla birlikte taşınır; Gez'de sadece satın alınmış botlar.
      const build = mode === 'build' && Array.isArray(designItems);
      (build ? designItems : houseDoc?.items || []).forEach((it) => {
        if (it.k !== BOT_ITEM_KEY || (!build && it.p !== 1)) return;
        const raw = houseDoc?.bots?.[it.i];
        list.push({ i: it.i, x: it.x, z: it.z, cfg: cleanBotConfig(raw), fresh: !raw });
      });
    }
    return list.slice(0, MAX_BOTS).map((d) => {
      const job = botJobOf(d.cfg);
      const { name } = botDefaults(d.cfg);
      // hiç düzenlenmemiş bot mesleğinin sözlerini söyler; düzenlenince sadece yazılanlar
      const lines = d.fresh ? job.lines : d.cfg.l.filter(Boolean);
      return { ...d, ck: JSON.stringify(d.cfg), uid: `npc_bot_${d.i}`, name: botLabel(name), lines, avatar: botAvatar(d.cfg), waiter: d.cfg.w };
    });
  }, [venue, houseDoc?.items, houseDoc?.bots, mode, designItems]);
  const defsKey = defs.map((d) => `${d.uid}:${d.x}:${d.z}:${JSON.stringify(d.cfg)}`).join('|');

  const stRef = useRef(new Map()); // uid → durum
  const ordersRef = useRef([]); // bekleyen siparişler
  const [, force] = useState(0);
  const busyRef = useRef(false);

  // --- durumları eşitle (yeni / silinen / taşınan bot) ---------------------------------
  useEffect(() => {
    const m = stRef.current;
    const seen = new Set();
    defs.forEach((d) => {
      seen.add(d.uid);
      const cur = m.get(d.uid);
      if (!cur || cur.hx !== d.x || cur.hz !== d.z || cur.mv !== d.cfg.mv) {
        m.set(d.uid, { def: d, hx: d.x, hz: d.z, mv: d.cfg.mv, x: d.x, z: d.z, seat: null, path: [], left: false, next: Date.now() + between(1500, 5000), sitUntil: 0, walkSince: 0, sayAt: Date.now() + between(3000, 12000), sayIdx: 0, task: null, settled: false });
      } else cur.def = d;
    });
    [...m.keys()].forEach((k) => !seen.has(k) && m.delete(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defsKey]);

  // --- yardımcılar ------------------------------------------------------------------
  const goTo = useCallback(
    (st, tx, tz) => {
      const eng = engineRef.current;
      const path = eng?.botPath?.(st.x, st.z, tx, tz);
      st.path = path && path.length ? path.map((p) => ({ x: p.x, z: p.z })) : [{ x: tx, z: tz }];
      st.walkSince = Date.now();
    },
    [engineRef]
  );
  const standUp = (st) => {
    if (!st.seat) return;
    st.x = st.seat.x;
    st.z = st.seat.z;
    st.seat = null;
  };

  // --- ana döngü -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    let last = Date.now();
    const iv = setInterval(() => {
      const eng = engineRef.current;
      if (!eng || document.hidden) return;
      const now = Date.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const build = mode === 'build';
      const out = [];
      const keys = [];
      stRef.current.forEach((st, uid) => {
        const d = st.def;
        if (build) {
          // Tasarla: bot platformunun üstünde dikilir (düzenlerken nerede olduğu görünsün)
          st.seat = null;
          st.path = [];
          st.task = null;
          st.x = st.hx;
          st.z = st.hz;
          st.settled = false;
        } else {
          tick(st, uid, d, now, dt);
        }
        out.push({ uid, displayName: d.name, avatar: d.avatar, x: Math.round(st.x * 100) / 100, z: Math.round(st.z * 100) / 100, left: st.left, seat: st.seat ? `${st.seat.id}:${st.seat.idx}` : null, holdingVisible: build ? null : st.task?.carry || null });
        keys.push(d.ck);
        // konuşma (sırayla, aralıklı)
        if (!build && d.lines.length && now >= st.sayAt) {
          eng.say(uid, d.lines[st.sayIdx % d.lines.length]);
          st.sayIdx += 1;
          st.sayAt = now + between(22_000, 38_000);
        }
      });
      const key = out.map((o, n) => `${o.uid}:${o.displayName}:${keys[n]}:${o.x}:${o.z}:${o.seat}:${o.left}:${o.holdingVisible || ''}`).join('|');
      if (key !== npcsRef.current.key) {
        npcsRef.current = out;
        npcsRef.current.key = key;
        pushOthers();
      }
    }, TICK_MS);

    function tick(st, uid, d, now, dt) {
      const eng = engineRef.current;
      // 1) garson görevi
      if (d.waiter && !st.task && ordersRef.current.length) {
        const o = ordersRef.current.find((x) => !x.botUid || x.botUid === uid);
        if (o) {
          o.botUid = uid;
          ordersRef.current = ordersRef.current.filter((x) => x !== o);
          st.task = { kind: 'deliver', order: o, since: now, lastAim: 0, carry: o.product || null }; // v136: sipariş elinde
          standUp(st);
          st.path = [];
        }
      }
      if (st.task?.kind === 'deliver') {
        const me = eng.getSelfState?.();
        if (!me) return;
        const dist = Math.hypot(me.x - st.x, me.z - st.z);
        if (dist <= DELIVER_DIST || now - st.task.since > DELIVER_TIMEOUT_MS) {
          if (dist > DELIVER_DIST) {
            // takıldı → oyuncunun yanına ışınlan
            const p = eng.botFreePoint?.(me.x, me.z, 0.9) || { x: me.x + 0.6, z: me.z };
            st.x = p.x;
            st.z = p.z;
          }
          st.path = [];
          const o = st.task.order;
          st.task = { kind: 'serving', until: now + 2500, carry: o.product || null };
          serve(uid, d, o);
          return;
        }
        if (now - st.task.lastAim > 1500 || !st.path.length) {
          st.task.lastAim = now;
          goTo(st, me.x, me.z);
          // son noktayı oyuncunun dibine değil yanına
          const lastP = st.path[st.path.length - 1];
          if (lastP) {
            const ddx = lastP.x - me.x;
            const ddz = lastP.z - me.z;
            const dd = Math.hypot(ddx, ddz);
            if (dd < 0.6 && st.path.length >= 1) {
              const prev = st.path.length > 1 ? st.path[st.path.length - 2] : { x: st.x, z: st.z };
              const vx = prev.x - me.x;
              const vz = prev.z - me.z;
              const vl = Math.hypot(vx, vz) || 1;
              lastP.x = me.x + (vx / vl) * 0.7;
              lastP.z = me.z + (vz / vl) * 0.7;
            }
          }
        }
        walk(st, dt, now, true);
        return;
      }
      if (st.task?.kind === 'serving') {
        if (st.task.carry && now > st.task.until - 1600) st.task.carry = null; // ürün oyuncuya verildi
        if (now < st.task.until) return;
        st.task = null;
        st.next = now; // hemen yerine / gezmeye
        if (d.cfg.mv === 'sabit' || d.cfg.mv === 'hareket') {
          st.task = { kind: 'return' };
          goTo(st, st.hx, st.hz);
        }
        return;
      }
      if (st.task?.kind === 'return') {
        if (ordersRef.current.length && d.waiter) {
          st.task = null; // yolda yeni sipariş → onu götür
          return;
        }
        if (!st.path.length) {
          st.task = null;
          st.settled = false;
          return;
        }
        walk(st, dt, now, true);
        return;
      }
      // 2) yürüyorsa devam
      if (st.path.length) {
        walk(st, dt, now, false);
        return;
      }
      // 3) davranış
      const mv = d.cfg.mv;
      if (mv === 'sabit') {
        if (!st.settled) {
          st.settled = true;
          st.x = st.hx;
          st.z = st.hz;
          const s = eng.botSeats?.(st.hx, st.hz, SIT_NEAR, uid)?.[0];
          if (s) st.seat = s;
        }
        return;
      }
      if (st.pendingSeat && !st.seat) {
        // oturağa vardı
        const s = eng.botSeats?.(st.x, st.z, 0.9, uid)?.find((x) => x.id === st.pendingSeat.id && x.idx === st.pendingSeat.idx);
        st.pendingSeat = null;
        if (s) {
          st.seat = s;
          st.sitUntil = now + between(10_000, 26_000);
          st.next = st.sitUntil;
          return;
        }
      }
      if (now < st.next) return;
      // v132.1: botlar dans / el sallama gibi hareketler YAPMAZ (sadece yürür, oturur)
      standUp(st);
      const roam = mv === 'serbest';
      const { W, D } = eng.roomSize || { W: 18, D: 14 };
      const cx = roam ? 0 : st.hx;
      const cz = roam ? 0 : st.hz;
      const r = roam ? Math.max(W, D) / 2 : 1.6;
      if (rnd() < (roam ? 0.22 : 0.28)) {
        const seats = eng.botSeats?.(cx, cz, roam ? 99 : 2.6, uid) || [];
        if (seats.length) {
          const s = pick(seats.slice(0, roam ? 8 : 3));
          st.pendingSeat = s;
          goTo(st, s.x, s.z);
          return;
        }
      }
      const p = eng.botFreePoint?.(cx, cz, r);
      if (p) goTo(st, p.x, p.z);
      st.next = now + between(roam ? 5000 : 6000, roam ? 12_000 : 14_000);
    }

    function walk(st, dt, now, urgent) {
      let step = SPEED * (urgent ? 1.25 : 1) * dt;
      while (step > 0 && st.path.length) {
        const t = st.path[0];
        const dx = t.x - st.x;
        const dz = t.z - st.z;
        const dl = Math.hypot(dx, dz);
        if (dl > 0.02) st.left = dx < 0;
        if (dl <= step) {
          st.x = t.x;
          st.z = t.z;
          st.path.shift();
          step -= dl;
        } else {
          st.x += (dx / dl) * step;
          st.z += (dz / dl) * step;
          step = 0;
        }
      }
      if (st.path.length && now - st.walkSince > STUCK_MS) {
        // sıkıştı → hedefe ışınlan
        const end = st.path[st.path.length - 1];
        st.x = end.x;
        st.z = end.z;
        st.path = [];
      }
    }

    async function serve(uid, d, o) {
      const eng = engineRef.current;
      try {
        let r;
        if (o.kind === 'menu') r = await shopAction({ op: 'menuBuy', houseId, product: o.product, expect: o.price });
        else if (o.kind === 'office') r = await shopAction({ op: 'officeBuy', houseId, itemId: o.itemId, product: o.product, expect: o.price });
        else r = await houseAction({ op: 'take', houseId, itemId: o.itemId, product: o.product });
        const data = r?.data || r || {};
        eng?.say(uid, pick(SERVE_LINES));
        const label = HOUSE_PRODUCTS[o.product]?.label || data.label || '';
        flash?.(`${HOUSE_PRODUCTS[o.product]?.emoji || '🍽️'} ${label}${o.price ? ` −${o.price.toLocaleString('tr-TR')}` : ''}`);
      } catch (err) {
        const m = String(err?.message || '');
        eng?.say(uid, 'Kusura bakma, olmadı…');
        flash?.(m === 'gold' ? 'Altının yetmiyor.' : m.startsWith('limit') || m.startsWith('office-limit') ? 'Bu mekânda bugünkü harcama sınırına ulaştın.' : m.startsWith('price-changed') ? 'Fiyat az önce değişti, tekrar söyle.' : m === 'not-present' ? 'Mekânda değilsin.' : m || 'Sipariş verilemedi.');
      } finally {
        busyRef.current = false;
        force((n) => n + 1);
      }
    }
    return () => clearInterval(iv);
  }, [phase, mode, engineRef, engineKey, houseId, goTo, npcsRef, pushOthers, flash]);

  // --- garson ----------------------------------------------------------------------------
  const waiters = defs.filter((d) => d.waiter);
  const menu = useMemo(() => (waiters.length ? waiterMenu(houseDoc, { venue, isOwner, uid: user?.uid }) : {}), [waiters.length, houseDoc, venue, isOwner, user?.uid]);
  const products = Object.values(menu);
  const order = useCallback(
    (prod) => {
      const o = menu[prod];
      if (!o || !waiters.length) return false;
      if (ordersRef.current.length >= 3) {
        flash?.('Garson yetişemiyor, biraz bekle 🙂');
        return false;
      }
      ordersRef.current = [...ordersRef.current, { ...o, at: Date.now() }];
      const w = waiters[0];
      flash?.(`🛎️ ${w.name} siparişini getiriyor (${HOUSE_PRODUCTS[prod]?.emoji || ''} ${HOUSE_PRODUCTS[prod]?.label || prod})`);
      return true;
    },
    [menu, waiters, flash]
  );
  const tap = useCallback(
    (uid) => {
      const st = stRef.current.get(uid);
      if (!st) return false;
      const lines = st.def.lines;
      if (lines.length) {
        engineRef.current?.say(uid, lines[st.sayIdx % lines.length]);
        st.sayIdx += 1;
        st.sayAt = Date.now() + between(22_000, 38_000);
      }
      return true;
    },
    [engineRef]
  );
  return { list: defs, waiterReady: Boolean(user) && waiters.length > 0 && products.length > 0, products, order, tap, waiterName: waiters[0]?.name || 'Garson' };
}
