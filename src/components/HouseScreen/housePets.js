import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ANIMAL_BY_KEY, PETSHOP_SPOTS, MAX_ROOM_PETS, isAnimalKey, petLines, petName, petTintOf } from '../../../functions/animalData.js';

// =============================================================================
// v137 — ODADAKİ EV HAYVANLARI (Mobilya › Hayvanlar). Satın alınmış her hayvan
// eşyasının (pati platformu) üstünde bir hayvan durur. Ayarı houses/{id}.pets
// (sunucu: petSet), rengi eşyanın renk seçeneği (items[].c).
//   • sabit dur · hareket et (platformun yakınında dolaşır) · serbest gez (odada
//     gezer; arada mama kabına, yatağına, kulübesine gider)
//   • Sözler: 3 söz sırayla, aralıklı (düzenlenmemişse türünün sesleri)
// Konum herkesin kendi cihazında hesaplanır (Firebase'e yazma YOK).
// =============================================================================

const TICK_MS = 150;
const SPEED = 0.85; // m/sn
const STUCK_MS = 12_000;
const rnd = Math.random;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);

export function useHousePets({ engineRef, engineKey, phase, houseDoc, designItems, venue, mode, npcsRef, pushOthers }) {
  const items = mode === 'build' && Array.isArray(designItems) ? designItems : houseDoc?.items || [];
  const defs = useMemo(() => {
    if (venue) return [];
    const build = mode === 'build' && Array.isArray(designItems);
    const list = [];
    items.forEach((it) => {
      if (!isAnimalKey(it.k) || (!build && it.p !== 1)) return;
      const raw = houseDoc?.pets?.[it.i] || null;
      const a = ANIMAL_BY_KEY[it.k];
      list.push({
        i: it.i,
        x: it.x,
        z: it.z,
        k: it.k,
        uid: `npc_pet_${it.i}`,
        name: petName(it.k, raw),
        lines: petLines(it.k, raw),
        mv: raw?.mv || 'hareket',
        pet: { id: a.art, tint: petTintOf(it.k, it.c) },
      });
    });
    return list.slice(0, MAX_ROOM_PETS);
  }, [venue, items, houseDoc?.pets, mode, designItems]);
  const defsKey = defs.map((d) => `${d.uid}:${d.x}:${d.z}:${d.mv}:${d.name}:${d.lines.join('|')}:${d.pet.tint?.c || ''}`).join('|');
  // hayvanların gidebileceği petshop eşyaları (satın alınmış)
  const spots = useMemo(
    () =>
      (houseDoc?.items || [])
        .filter((it) => it.p === 1 && PETSHOP_SPOTS[it.k])
        .map((it) => {
          const ry = (it.r || 0) * (Math.PI / 4);
          // eşyanın önü (+z yerel) — kulübe / ahır gibi büyük eşyalarda kapının önü
          const off = it.k === 'ps_kulube' ? 0.62 : it.k === 'ps_ahir' ? 0.2 : it.k === 'ps_kumes' ? 0.75 : it.k === 'ps_saray' ? 0.42 : 0.28;
          return { x: it.x + Math.sin(ry) * off, z: it.z + Math.cos(ry) * off, kind: PETSHOP_SPOTS[it.k] };
        }),
    [houseDoc?.items]
  );
  const spotsRef = useRef(spots);
  spotsRef.current = spots;

  const stRef = useRef(new Map());
  useEffect(() => {
    const m = stRef.current;
    const seen = new Set();
    defs.forEach((d) => {
      seen.add(d.uid);
      const cur = m.get(d.uid);
      if (!cur || cur.hx !== d.x || cur.hz !== d.z || cur.mv !== d.mv) {
        m.set(d.uid, { def: d, hx: d.x, hz: d.z, mv: d.mv, x: d.x, z: d.z, path: [], left: false, next: Date.now() + between(1500, 5000), walkSince: 0, sayAt: Date.now() + between(4000, 14000), sayIdx: 0 });
      } else cur.def = d;
    });
    [...m.keys()].forEach((k) => !seen.has(k) && m.delete(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defsKey]);

  const goTo = useCallback(
    (st, tx, tz) => {
      const path = engineRef.current?.botPath?.(st.x, st.z, tx, tz);
      st.path = path && path.length ? path.map((p) => ({ x: p.x, z: p.z })) : [{ x: tx, z: tz }];
      st.walkSince = Date.now();
    },
    [engineRef]
  );

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
      stRef.current.forEach((st, uid) => {
        const d = st.def;
        if (build) {
          st.path = [];
          st.x = st.hx;
          st.z = st.hz;
        } else tick(st, now, dt);
        out.push({ uid, displayName: d.name, pet: d.pet, x: Math.round(st.x * 100) / 100, z: Math.round(st.z * 100) / 100, left: st.left, seat: null, holdingVisible: null });
        if (!build && d.lines.length && now >= st.sayAt) {
          eng.say(uid, d.lines[st.sayIdx % d.lines.length]);
          st.sayIdx += 1;
          st.sayAt = now + between(25_000, 45_000);
        }
      });
      const key = out.map((o) => `${o.uid}:${o.displayName}:${o.pet.id}:${o.pet.tint?.c || ''}:${o.x}:${o.z}:${o.left}`).join('|');
      if (key !== npcsRef.current.key) {
        npcsRef.current = out;
        npcsRef.current.key = key;
        pushOthers();
      }
    }, TICK_MS);

    function tick(st, now, dt) {
      if (st.path.length) {
        walk(st, dt, now);
        return;
      }
      const mv = st.def.mv;
      if (mv === 'sabit') {
        st.x = st.hx;
        st.z = st.hz;
        return;
      }
      if (now < st.next) return;
      const eng = engineRef.current;
      const roam = mv === 'serbest';
      // serbest gezen hayvan arada mama kabına / yatağına / kulübesine gider
      const sp = roam ? spotsRef.current : spotsRef.current.filter((s) => Math.hypot(s.x - st.hx, s.z - st.hz) < 3);
      if (sp.length && rnd() < 0.35) {
        const s = pick(sp);
        goTo(st, s.x + between(-0.15, 0.15), s.z + between(-0.1, 0.1));
        st.next = now + between(s.kind === 'rest' ? 14_000 : 7000, s.kind === 'rest' ? 30_000 : 14_000);
        return;
      }
      const { W, D } = eng?.roomSize || { W: 18, D: 14 };
      const cx = roam ? 0 : st.hx;
      const cz = roam ? 0 : st.hz;
      const r = roam ? Math.max(W, D) / 2 : 1.4;
      const p = eng?.botFreePoint?.(cx, cz, r);
      if (p) goTo(st, p.x, p.z);
      st.next = now + between(roam ? 4000 : 5000, roam ? 11_000 : 13_000);
    }

    function walk(st, dt, now) {
      let step = SPEED * dt;
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
        const end = st.path[st.path.length - 1];
        st.x = end.x;
        st.z = end.z;
        st.path = [];
      }
    }
    return () => clearInterval(iv);
  }, [phase, mode, engineRef, engineKey, goTo, npcsRef, pushOthers]);

  // dokununca sıradaki sözünü söyler
  const tap = useCallback(
    (uid) => {
      const st = stRef.current.get(uid);
      if (!st) return false;
      const lines = st.def.lines;
      if (lines.length) {
        engineRef.current?.say(uid, lines[st.sayIdx % lines.length]);
        st.sayIdx += 1;
        st.sayAt = Date.now() + between(25_000, 45_000);
      }
      return true;
    },
    [engineRef]
  );
  return { list: defs, tap };
}
