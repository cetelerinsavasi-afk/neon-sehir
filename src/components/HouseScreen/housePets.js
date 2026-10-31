import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ANIMAL_BY_KEY, MAX_ROOM_PETS, PETSHOP_SPOTS, isAnimalKey, petLines, petName, petTintOf, spotFor } from '../../../functions/animalData.js';

// =============================================================================
// v137 — ODADAKİ EV HAYVANLARI (Mobilya › Hayvanlar). Satın alınmış her hayvan
// eşyasının (pati platformu) üstünde bir hayvan durur. Ayarı houses/{id}.pets
// (sunucu: petSet), rengi eşyanın renk seçeneği (items[].c).
//   • sabit dur (ayakta / otur — yanında koltuk varsa koltuğa, yatağının üstündeyse yatağa)
//   • hareket et (platformunun çevresinde) · serbest gez (bütün odada): arada gezer,
//     yere oturur, koltuğa çıkar, yatağına yatar, mama yer / su içer, oyuncakla oynar;
//     kedi tırmalama ağacına / kedi sarayına çıkar, köpek kulübesine, tavuk kümese
//     girer, at ahıra, kuş kafese, hamster çarkta koşar (v137.1)
//   • Sözler: 3 söz sırayla, aralıklı (düzenlenmemişse türünün sesleri)
//   • Yaklaşınca 🤗 Sev → kalpler (v137.1)
// Konum herkesin kendi cihazında hesaplanır (Firebase'e yazma YOK).
// =============================================================================

const TICK_MS = 150;
const SPEED = 0.85; // m/sn
const STUCK_MS = 12_000;
const LOVE_DIST = 1.4;
const rnd = Math.random;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);
const LOVE_LINES = {
  kedi: ['*mırlar* 💕', '*başını eline sürter*', 'Mrrrr… 💕'],
  kopek: ['*kuyruk sallar* 💕', '*elini yalar*', 'Hav! 💕'],
  kumes: ['*mutlu gıdaklar* 💕', '*kanat çırpar*'],
  kafes: ['*tüylerini kabartır* 💕', 'Seni seviyorum! 💕'],
  at: ['*başını omzuna yaslar* 💕', '*mutlu kişner*'],
  kemirgen: ['*burnunu kıpırdatır* 💕', '*ellerine tırmanır*'],
  diger: ['💕', '*mutlu*', '*sokulur*'],
};
const EAT_LINES = { eat: ['*mama yer* 😋', '*nom nom*', '*kabı yalar*'], drink: ['*su içer* 💧', '*şap şap*'] };

// eşyanın yerel noktası → dünya
function itemPoint(it, [px, pz]) {
  const ry = (it.r || 0) * (Math.PI / 4);
  return { x: it.x + px * Math.cos(ry) + pz * Math.sin(ry), z: it.z - px * Math.sin(ry) + pz * Math.cos(ry) };
}

export function useHousePets({ engineRef, engineKey, phase, houseDoc, designItems, venue, mode, npcsRef, pushOthers }) {
  const build = mode === 'build' && Array.isArray(designItems);
  const items = build ? designItems : houseDoc?.items;
  const defs = useMemo(() => {
    if (venue) return [];
    const list = [];
    (items || []).forEach((it) => {
      if (!isAnimalKey(it.k) || (!build && it.p !== 1)) return;
      const raw = houseDoc?.pets?.[it.i] || null;
      const a = ANIMAL_BY_KEY[it.k];
      list.push({
        i: it.i,
        x: it.x,
        z: it.z,
        k: it.k,
        g: a.g,
        uid: `npc_pet_${it.i}`,
        name: petName(it.k, raw),
        lines: petLines(it.k, raw),
        mv: raw?.mv || 'hareket',
        ps: raw?.ps === 'otur' ? 'otur' : 'ayakta',
        pet: { id: a.art, tint: petTintOf(it.k, it.c) },
      });
    });
    return list.slice(0, MAX_ROOM_PETS);
  }, [venue, items, build, houseDoc?.pets]);
  const defsKey = defs.map((d) => `${d.uid}:${d.x}:${d.z}:${d.mv}:${d.ps}:${d.name}:${d.lines.join('|')}:${d.pet.tint?.c || ''}`).join('|');
  // petshop eşyaları (satın alınmış): etkileşim noktaları
  const spots = useMemo(() => (houseDoc?.items || []).filter((it) => it.p === 1 && PETSHOP_SPOTS[it.k]).map((it) => ({ k: it.k, it })), [houseDoc?.items]);
  const spotsRef = useRef(spots);
  spotsRef.current = spots;
  // bu tür için kullanılabilir noktalar
  const spotsFor = (g) =>
    spotsRef.current
      .map(({ k, it }) => {
        const s = spotFor(k, g);
        if (!s) return null;
        const p = itemPoint(it, s.p);
        return { ...s, k, id: it.i, x: p.x, z: p.z };
      })
      .filter(Boolean);

  const stRef = useRef(new Map());
  const [nearPet, setNearPet] = useState(null); // { uid, name }
  const nearRef = useRef(null);
  useEffect(() => {
    const m = stRef.current;
    const seen = new Set();
    defs.forEach((d) => {
      seen.add(d.uid);
      const cur = m.get(d.uid);
      if (!cur || cur.hx !== d.x || cur.hz !== d.z || cur.mv !== d.mv || cur.ps !== d.ps) {
        m.set(d.uid, { def: d, hx: d.x, hz: d.z, mv: d.mv, ps: d.ps, x: d.x, z: d.z, path: [], left: false, next: Date.now() + between(1500, 5000), walkSince: 0, sayAt: Date.now() + between(4000, 14000), sayIdx: 0, act: null, goal: null, settledAt: 0 });
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
      const isBuild = mode === 'build';
      const out = [];
      const me = isBuild ? null : eng.getSelfState?.();
      let near = null;
      stRef.current.forEach((st, uid) => {
        const d = st.def;
        if (isBuild) {
          st.path = [];
          st.act = null;
          st.goal = null;
          st.x = st.hx;
          st.z = st.hz;
          st.settledAt = 0;
        } else tick(st, uid, now, dt);
        const a = st.act;
        out.push({
          uid,
          displayName: d.name,
          pet: d.pet,
          x: Math.round(st.x * 100) / 100,
          z: Math.round(st.z * 100) / 100,
          left: st.left,
          seat: a?.seat ? `${a.seat.id}:${a.seat.idx}` : null,
          y: a?.y || 0,
          pose: a?.pose || 'stand',
          hidden: Boolean(a?.hidden),
          holdingVisible: null,
        });
        if (!isBuild && d.lines.length && now >= st.sayAt && !a?.hidden) {
          eng.say(uid, d.lines[st.sayIdx % d.lines.length]);
          st.sayIdx += 1;
          st.sayAt = now + between(25_000, 45_000);
        }
        if (me && !a?.hidden) {
          const dist = Math.hypot(me.x - st.x, me.z - st.z);
          if (dist < LOVE_DIST && (!near || dist < near.dist)) near = { uid, name: d.name, dist };
        }
      });
      const key = out.map((o) => `${o.uid}:${o.displayName}:${o.pet.id}:${o.pet.tint?.c || ''}:${o.x}:${o.z}:${o.left}:${o.seat}:${o.y}:${o.pose}:${o.hidden}`).join('|');
      if (key !== npcsRef.current.key) {
        npcsRef.current = out;
        npcsRef.current.key = key;
        pushOthers();
      }
      const nk = near ? `${near.uid}:${near.name}` : '';
      if (nk !== nearRef.current) {
        nearRef.current = nk;
        setNearPet(near ? { uid: near.uid, name: near.name } : null);
      }
    }, TICK_MS);

    // sabit: ayakta / otur (yanında koltuk varsa koltukta; yatağın / rafın üstündeyse orada)
    function still(st, uid, now) {
      st.x = st.hx;
      st.z = st.hz;
      if (st.settledAt && now - st.settledAt < 4000) return;
      st.settledAt = now;
      const eng = engineRef.current;
      const on = spotsFor(st.def.g).find((s) => (s.act === 'bed' || s.act === 'perch') && Math.hypot(s.x - st.hx, s.z - st.hz) < 0.4);
      if (st.def.ps === 'otur') {
        if (st.act?.seat) return;
        const seat = st.def.g !== 'at' ? eng?.botSeats?.(st.hx, st.hz, 0.8, uid)?.[0] : null;
        st.act = seat ? { seat, pose: 'sit' } : { pose: on?.act === 'bed' ? 'bed' : 'sit', y: on?.y || 0 };
      } else st.act = on ? { pose: 'stand', y: on.y || 0 } : null;
    }

    function startGoal(st, uid, now) {
      const g = st.goal;
      st.goal = null;
      const eng = engineRef.current;
      if (g.kind === 'seat') {
        // koltuk hâlâ boş mu?
        const seat = eng?.botSeats?.(st.x, st.z, 0.7, uid)?.find((s) => s.id === g.seat.id && s.idx === g.seat.idx);
        st.act = seat ? { seat, pose: 'sit', until: now + between(12_000, 26_000) } : { pose: 'sit', until: now + between(6000, 12_000) };
        return;
      }
      const s = g.spot;
      const T = { eat: [6000, 10_000], drink: [5000, 8000], bed: [15_000, 32_000], enter: [10_000, 24_000], perch: [12_000, 26_000], play: [6000, 11_000], stall: [15_000, 30_000] }[s.act] || [6000, 12_000];
      st.act = { pose: s.act === 'eat' || s.act === 'drink' ? 'eat' : s.act === 'bed' ? 'bed' : s.act === 'perch' ? 'sit' : s.act === 'play' ? 'run' : 'stand', y: s.y || 0, hidden: s.act === 'enter', until: now + between(T[0], T[1]) };
      if (EAT_LINES[s.act] && rnd() < 0.6) engineRef.current?.say(uid, pick(EAT_LINES[s.act]));
      if (s.act === 'play' && rnd() < 0.5) engineRef.current?.say(uid, '*oynar* 🎾');
    }

    function tick(st, uid, now, dt) {
      if (st.loveUntil && now < st.loveUntil) return; // sevilirken durur
      if (st.path.length) {
        walk(st, dt, now);
        if (!st.path.length && st.goal) startGoal(st, uid, now);
        return;
      }
      if (st.def.mv === 'sabit') {
        still(st, uid, now);
        return;
      }
      if (st.act) {
        if (now < (st.act.until || 0)) return;
        st.act = null;
        st.next = now + between(800, 2500);
        return;
      }
      if (now < st.next) return;
      const eng = engineRef.current;
      const roam = st.def.mv === 'serbest';
      const roll = rnd();
      // 1) petshop eşyası (yemek, yatak, kulübe…)
      const sp = spotsFor(st.def.g).filter((s) => Math.hypot(s.x - st.hx, s.z - st.hz) < (roam ? 99 : 3.2));
      if (sp.length && roll < 0.4) {
        const s = pick(sp);
        st.goal = { kind: 'spot', spot: s };
        goTo(st, s.x, s.z);
        return;
      }
      // 2) koltuğa çık (atlar hariç)
      if (roll < 0.58 && st.def.g !== 'at') {
        const seats = eng?.botSeats?.(roam ? st.x : st.hx, roam ? st.z : st.hz, roam ? 8 : 2.6, uid) || [];
        if (seats.length) {
          const s = pick(seats.slice(0, 4));
          st.goal = { kind: 'seat', seat: s };
          goTo(st, s.x, s.z);
          return;
        }
      }
      // 3) yere otur
      if (roll < 0.72) {
        st.act = { pose: 'sit', until: now + between(6000, 15_000) };
        return;
      }
      // 4) gez
      const { W, D } = eng?.roomSize || { W: 18, D: 14 };
      const p = eng?.botFreePoint?.(roam ? 0 : st.hx, roam ? 0 : st.hz, roam ? Math.max(W, D) / 2 : 1.4);
      if (p) goTo(st, p.x, p.z);
      st.next = now + between(roam ? 3000 : 4000, roam ? 9000 : 11_000);
    }

    function walk(st, dt, now) {
      if (st.act) st.act = null; // kalkıp yürür
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // 🤗 Sev: kalpler + mutlu söz; hayvan bir an durup sana döner
  const love = useCallback(
    (uid) => {
      const st = stRef.current.get(uid);
      const eng = engineRef.current;
      if (!st || !eng) return;
      const me = eng.getSelfState?.();
      st.path = [];
      st.goal = null;
      st.loveUntil = Date.now() + 2600;
      if (me && !st.act?.seat) st.left = me.x < st.x;
      eng.petLove?.(uid);
      eng.say(uid, pick(LOVE_LINES[st.def.g] || LOVE_LINES.diger));
      st.sayAt = Date.now() + between(20_000, 35_000);
    },
    [engineRef]
  );
  return { list: defs, tap, love, nearPet };
}
