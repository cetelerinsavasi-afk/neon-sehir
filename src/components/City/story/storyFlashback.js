// =============================================================================
// v168 — "3 yıl önce": köprüde Emre'nin vurulması (sinematik).
// Her şey bu cihazda olur; oyuncu ağda o sırada gizlidir (CityScreen › setAway).
// Kurallar (kullanıcı revizesi): polis arabaları ve ambulans sahnenin ARKASINDA durur; polisler ve
// sağlıkçı yolun kenarından yürür — hiçbir araç/kişi araçların ya da cesedin içinden geçmez.
// =============================================================================
import { buildFullAvatarSvgMarkup } from '../../../lib/avatarShapes';
import { frameAt, TAGS } from '../world/route.js';
import { createActor } from './storyActor.js';
import { EMRE, NEVZAT, AKREPLER, POLISLER, SAGLIKCI, FLASHBACK as T } from './storyData.js';
import { music, stopMusic, sGun, sHeart, sBrake, sDoor, sTitle, sSiren, sCuffs, sEngine } from './storyAudio.js';

export const CANCELLED = 'amca-cancelled';
const corpseSvg = (av) => buildFullAvatarSvgMarkup(av, {}).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, '');

// yol koordinatı → dünya (s: otoyol boyunca metre, lat: sağa + metre)
const G = (s, lat = 0) => {
  const f = frameAt(s);
  return { x: f.x + f.rx * lat, z: f.z + f.rz * lat, yaw: f.yaw };
};
const along = (s0, s1, lat, step = 5) => {
  const out = [];
  const dir = s1 > s0 ? 1 : -1;
  for (let s = s0; dir > 0 ? s <= s1 : s >= s1; s += step * dir) out.push(G(s, lat));
  return out;
};

// ctx: { eng, kit, props, say(who, text), setCine, setTitle, npcs[], alive() }
export async function runFlashback(ctx) {
  const { eng, kit, props, say, setCine, setTitle, npcs } = ctx;
  const sleep = (ms) =>
    new Promise((r) => setTimeout(r, ms)).then(() => {
      if (!ctx.alive()) throw new Error(CANCELLED);
    });
  const check = () => {
    if (!ctx.alive()) throw new Error(CANCELLED);
  };
  const gy = (x, z) => props?.gy(x, z) ?? 0;
  const mk = (def) => {
    const a = createActor(eng, def, gy);
    npcs.push(a);
    return a;
  };
  const K = TAGS.kopruA;
  const sStart = K - 12;
  const sStop = K + 112; // Emre'nin arabası burada durur
  const sBlock = K + 128; // Nevzat'ın arabası yolu keser
  setCine('black');
  props?.setLevel(frameAt(K).y + 1);

  const emre = mk(EMRE);
  const nevzat = mk(NEVZAT);
  const men = AKREPLER.slice(0, 3).map(mk);
  const p0 = G(sStart, 2);
  emre.placeCar(p0.x, p0.z, p0.yaw);
  emre.getIn();
  const pb = G(sBlock, 0);
  nevzat.placeCar(pb.x, pb.z, pb.yaw + Math.PI / 2);
  const np = G(sBlock - 4, 0.6);
  nevzat.placeAt(np.x, np.z);
  men.forEach((m, i) => {
    const p = G(sBlock - 5 - (i % 2) * 1.5, [-3.2, 2.9, -0.8][i]);
    m.placeAt(p.x, p.z);
    m.hold(i === 1 ? 'pompali' : 'tufek');
  });
  eng.teleportWorld(p0.x, p0.z);
  await sleep(700);
  eng.rideStart(EMRE.id, 1);
  await sleep(1500);
  setCine('bars');
  sEngine(true);
  music('warm', { vol: 0.7 });
  const drive = emre.driveAlong([p0, ...along(sStart + 5, sStop, 2)], { cruise: 11 });
  await sleep(500);
  for (const l of T.drive) await say(l.who, l.text);
  check();
  // 3. replik: barikata yaklaşırken
  const stopAt = G(sStop, 2);
  while (emre.carPos && Math.hypot(emre.carPos.x - stopAt.x, emre.carPos.z - stopAt.z) > 48) await sleep(100);
  const approach = say(T.approach.who, T.approach.text);
  while (emre.carPos && Math.hypot(emre.carPos.x - stopAt.x, emre.carPos.z - stopAt.z) > 20) await sleep(100);
  sBrake();
  music('tension');
  await drive;
  await approach;
  check();
  sEngine(false);
  eng.rideEnd();
  emre.getOut(-1);
  sDoor();
  setTimeout(sDoor, 250);
  const me0 = G(sStop + 2.5, 3.7);
  eng.teleportWorld(me0.x, me0.z);
  eng.setCam(me0.yaw + Math.PI + 0.5, 0.26, 10);
  const ep = G(sStop + 5.5, 1.4);
  emre.walkTo(ep.x, ep.z, 1.6);
  const nv = G(sStop + 10, 1.8);
  await nevzat.walkTo(nv.x, nv.z, 1.6);
  check();
  for (const l of T.block) await say(l.who, l.text);
  check();
  nevzat.hold('altinTabanca');
  emre.hold('tabanca');
  await sleep(250);
  sGun(1);
  props?.shot({ ...nevzat.pos }, { ...emre.pos, h: 1.15 }, { hit: false });
  setCine('flash');
  await sleep(80);
  setCine('bars');
  await sleep(140);
  sGun(1);
  props?.shot({ ...nevzat.pos }, { ...emre.pos, h: 1 }, { hit: false });
  const v = emre.pos;
  emre.removePerson();
  const body = props?.corpse(corpseSvg(EMRE.avatar), v.x, v.z);
  ctx.onCleanup(() => body?.remove());
  await sleep(700);
  kit?.run(true);
  eng.walkTo(v.x - 0.9, v.z - 0.6);
  await sleep(1500);
  kit?.run(false);
  stopMusic(0.6);
  sHeart(5);
  eng.setCam(me0.yaw + Math.PI * 0.5, 0.55, 5);
  await sleep(600);
  await say(T.hurt.who, T.hurt.text);
  check();
  sSiren();
  music('tension', { vol: 0.6 });
  setCine('siren');
  eng.setCam(me0.yaw + Math.PI + 0.7, 0.34, 13);
  nevzat.hold(null);

  // --- polis ve ambulans ARKADAN gelir, Emre'nin arabasının gerisinde durur ---------------------
  const cops = POLISLER.map(mk);
  const medic = mk(SAGLIKCI);
  const SHOULDER = -4.5; // yolun sol kenarı (yürüme şeridi)
  const plan = [
    { s0: sStop - 70, lane: -2, end: sStop - 9, lat2: -2.6 }, // 1. ekip arabası (sol şerit)
    { s0: sStop - 85, lane: 2, end: sStop - 15, lat2: 1.0 }, // 2. ekip (Emre'nin arabasının arkası)
    { s0: sStop - 100, lane: 2, end: sStop - 21, lat2: 3.6 }, // 3. ekip (sağ kenara çeker)
  ];
  const arrivals = plan.map((p, i) => {
    const a = G(p.s0, p.lane);
    cops[i].placeCar(a.x, a.z, a.yaw);
    cops[i].getIn();
    return cops[i].driveAlong([a, ...along(p.s0 + 5, p.end - 8, p.lane), G(p.end, p.lat2)], { cruise: 18 });
  });
  const amb = G(sStop - 120, 2);
  medic.placeCar(amb.x, amb.z, amb.yaw);
  medic.getIn();
  const medicWalk = medic
    .driveAlong([amb, ...along(sStop - 115, sStop - 33, 2), G(sStop - 28, 1.5)], { cruise: 16 })
    .then(async () => {
      if (!ctx.alive()) return;
      medic.getOut(1);
      // yolun kenarından yürüyerek gelir, Emre'nin yanına çöker
      const side = frameAt(sStop + 5.5);
      const tgt = { x: v.x - side.rx * 0.85, z: v.z - side.rz * 0.85 };
      const ok = await medic.walkPath([G(sStop - 27, SHOULDER), G(sStop + 3.6, SHOULDER), tgt], 2.8, true);
      if (ok && ctx.alive()) medic.crouch();
    });
  void medicWalk;
  await Promise.all(arrivals);
  check();
  cops.slice(0, 3).forEach((c) => c.getOut(1));
  const radio = G(sStop - 15, -0.4); // 2. ekip arabasının solunda (geri dönüş şeridinin dışında)
  cops[3].placeAt(radio.x, radio.z); // 4. polis telsizle arabanın yanında kalır
  cops[3].hold('tabanca');
  // üç polis kenardan yürüyüp oyuncuyu çevirir
  const ring = [
    [G(sStop - 8, SHOULDER), G(sStop + 2.8, SHOULDER), G(sStop + 2.8, -1.8)],
    [G(sStop - 14, SHOULDER), G(sStop + 7.6, SHOULDER), G(sStop + 7.6, -1.6)],
    [G(sStop - 20, SHOULDER), G(sStop + 8.6, SHOULDER), G(sStop + 8.6, 3.2)],
  ];
  ring.forEach((pts, i) => {
    cops[i].hold('tabanca');
    cops[i].walkPath(pts, 2.8, true);
  });
  await sleep(2600);
  await say(T.handsUp.who, T.handsUp.text);
  check();
  const posed = ['self', NEVZAT.id, ...men.map((m) => m.st.id)];
  posed.forEach((id) => kit?.pose(id, 'handsup'));
  ctx.onCleanup(() => posed.forEach((id) => kit?.pose(id, null)));
  men.forEach((m) => m.hold(null));
  eng.setHolding(null);
  await sleep(1100);
  for (const l of T.frame) await say(l.who, l.text);
  await sleep(300);
  setCine('black');
  stopMusic(2);
  posed.forEach((id) => kit?.pose(id, null));
  sCuffs();
  await sleep(1400);
  // --- karartmada: oyuncu ekip arabasına bindirilir, sol şeritten geri götürülür (yol boş) -------
  const car = cops[0];
  const o = G(sStop - 4, -2.4);
  car.placeCar(o.x, o.z, o.yaw + Math.PI);
  car.getIn();
  eng.rideStart(POLISLER[0].id, 2);
  await sleep(900);
  setCine('bars');
  car.driveAlong([o, ...along(sStop - 10, sStop - 130, -2.4)], { cruise: 12, slowEnd: false });
  await sleep(4200);
  setCine('black');
  await sleep(900);
  eng.rideEnd();
  eng.setCam(null, 0.36, 9);
  setTitle(T.after);
  sTitle();
  await sleep(2600);
}
