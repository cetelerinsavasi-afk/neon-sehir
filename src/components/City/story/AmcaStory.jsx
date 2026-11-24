// =============================================================================
// v168 — RIZA AMCA SENARYOSU (yeni oyuncu görevleri hikâyeyle).
// • İlerleme HER ZAMAN sunucuda (users.onboardingStep). Bu bileşen sadece görüntü: Amca, replikler,
//   sinematikler, mezar. Firestore'a dinleyici eklemez; yazma sadece iki olayla (checkOnboardingProgress):
//   'finale' (yeni oyuncu son sahneyi bitirdi) ve 'replay' (eski oyuncu "3 yıl önce"yi bitirdi).
// • Amca ve diğer karakterler sadece BU cihazda görünür (motora 'npc_' kimlikli uzak oyuncu olarak
//   verilir). Sinematikte ve Amca'nın arabasındayken oyuncu ağda gizlenir (onAway).
// • Amca asla kovalamaz / ışınlanmaz: oyuncu uzaktayken (görüş mesafesi dışında) bir sonraki
//   hedefin önüne geçer ve orada bekler; uzaktayken konuşmaları telefondan gelir.
// =============================================================================
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AvatarSvg from '../../AvatarSvg/AvatarSvg';
import { buildFullAvatarSvgMarkup } from '../../../lib/avatarShapes';
import { navRoute } from '../cityJobs.js';
import { checkOnboardingProgress } from '../../../services/gameActions';
import { ONBOARDING_TASK_COUNT, onboardingPosOf, storyStarted } from '../../../../functions/onboardingData.js';
import { ONBOARDING_TASKS } from '../../../hooks/useOnboarding';
import { createActor } from './storyActor.js';
import { createStoryProps } from './storyProps.js';
import { runFlashback, CANCELLED } from './storyFlashback.js';
import {
  PLACES, GRAVE, AMCA_ARRIVE_FROM, AMCA, AMCA_MID, AMCA_DARK, NEVZAT, AKREPLER, WHO, STORY_TASKS, IDX_CALL, OLD_HESAP,
  MEET_NEW, MEET_OLD, MEET_OLD_END, personalLines, TEA_OLD, OLD_TEA, CHAPTERS, CALL, CALL_OLD, AFTER_CALL, AFTER_CALL_OLD, FINALE, lineMs,
} from './storyData.js';
import { unlockAudio, music, stopMusic, silenceAll, sGun, sRicochet, sMetal, sHurt, sHeart, sDone, sChapter, sRing, sHangup } from './storyAudio.js';
import './AmcaStory.css';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a, b, r) => Boolean(a && b) && dist(a, b) < r;
const CANCEL = new Error(CANCELLED);
// şehir yol ızgarası: en yakın yol çizgisi (Amca'nın arabası yola park eder)
const ROAD_X = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
const ROAD_Z = [-140, -100, -60, -20, 20, 60, 100];
function nearestRoad(p) {
  const x = ROAD_X.reduce((b, v) => (Math.abs(v - p.x) < Math.abs(b - p.x) ? v : b), ROAD_X[0]);
  const z = ROAD_Z.reduce((b, v) => (Math.abs(v - p.z) < Math.abs(b - p.z) ? v : b), ROAD_Z[0]);
  const a = { x, z: Math.max(-140, Math.min(100, p.z)) };
  const b = { x: Math.max(-160, Math.min(160, p.x)), z };
  return dist(a, p) < dist(b, p) ? a : b;
}
const inCityRect = (p) => p && p.x > -170 && p.x < 205 && p.z > -150 && p.z < 110;
const corpseSvg = (av) => buildFullAvatarSvgMarkup(av, {}).replace(/<ellipse cx="160" cy="562"[^>]*\/>/, '');
const JUMP_D = 110; // Amca bundan uzaktaysa (görüş dışı) bir sonraki hedefe geçer
const PHONE_D = 45; // bundan uzaktayken replikler telefondan
const LS = (uid, k) => `amca:${uid}:${k}`;
const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* gizli sekme */
  }
};
const TITLE_BY_ID = Object.fromEntries(ONBOARDING_TASKS.map((t) => [t.id, t]));
const STATUS_TASK_IDS = [5, 9, 11, 12, 13, 14, 16, 19, 20]; // sunucu "zaten sağlanıyorsa" otomatik geçirir

// player → senaryo durumu
// pre: yeni oyuncu, hikâye başlamadı (sadece ⏪ 3 yıl önce düğmesi) · new: görevlerde, Amca yanında
// after: Amca öldü, son görev (çete) · old: görevleri bitmiş eski oyuncu · finished: hepsi bitti
function storyModeOf(player, startedLocal = false) {
  if (!player) return 'none';
  const pos = onboardingPosOf(player);
  const done = pos > ONBOARDING_TASK_COUNT;
  const dead = Boolean(player.amcaDead);
  if (!done) return dead ? 'after' : storyStarted(player) || startedLocal ? 'new' : 'pre';
  return dead ? 'finished' : 'old';
}

const AmcaStory = forwardRef(function AmcaStory({ eng, uid, player, gang = null, busy = false, jobActive = false, onAway, onFlashButton }, ref) {
  const [startedLocal, setStartedLocal] = useState(false); // "3 yıl önce" izlendi (sunucu onayı gelmeden)
  const mode = storyModeOf(player, startedLocal);
  const pos = player ? onboardingPosOf(player) : 0;
  const idx = mode === 'new' || mode === 'after' ? pos - 1 : -1;
  const task = idx >= 0 ? STORY_TASKS[idx] : null;

  const [line, setLine] = useState(null);
  const [cine, setCine] = useState(null); // black | bars | flash | siren | quiet
  const [title, setTitle] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [call, setCall] = useState(null);
  const [fight, setFight] = useState(null);
  const [hurtAt, setHurtAt] = useState(0);
  const [over, setOver] = useState(false);
  const [skip, setSkip] = useState(false);
  const [oldTask, setOldTask] = useState(null); // eski oyuncu: OLD_HESAP (Amca geldiyse)
  const [script, setScript] = useState(false); // sinematik / sahne oynuyor
  const [meeting, setMeeting] = useState(false); // karakol önünde karşılaşma

  const R = useRef({}).current; // tüm değişken durum (zamanlayıcı döngüsü ve sahneler için)
  R.eng = eng;
  R.uid = uid;
  R.busy = busy || jobActive;
  R.jobActive = jobActive;
  R.mode = mode;
  R.idx = idx;
  R.posNow = pos;
  R.player = player;
  R.gang = gang;
  R.task = mode === 'old' ? oldTask : task;
  if (import.meta.env?.DEV) window.__amca = R; // önizleme testleri
  if (!R.init) {
    Object.assign(R, { init: true, amca: null, npcs: [], props: null, grave: null, z: 'none', beats: {}, routeKey: null, routeOwned: false, queue: Promise.resolve(), gen: 0, skipLine: null, session: 0, prevPos: null, statusAsked: new Set(), cleanups: [], away: false, fightCtl: {}, lastJob: false });
  }

  // şehir motoru yeniden kurulduysa (telefon grafik belleğini geri aldı) eski sahnenin referansları bırakılır;
  // yeni motorda Amca hedefin önünde yeniden belirir
  useEffect(() => () => {
    R.session += 1;
    R.gen += 1;
    const safe = (f) => {
      try {
        f();
      } catch {
        /* motor kapanmış olabilir */
      }
    };
    R.cleanups.splice(0).forEach(safe);
    R.npcs.splice(0).forEach((n) => safe(() => n.remove()));
    safe(() => R.amca?.remove());
    safe(() => R.props?.dispose());
    safe(() => R.grave?.dispose());
    safe(() => {
      if (R.routeOwned && !R.jobActive) {
        eng?.jobRoute(null);
        eng?.jobTarget(null);
      }
      eng?.story?.hideRemotes(false);
      eng?.story?.hideNpc('Bekçi', false);
    });
    R.amca = null;
    R.props = null;
    R.grave = null;
    R.z = 'none';
    R.scriptOn = false;
    R.routeOwned = false;
  }, [eng, R]);

  // --- ağda gizlenme (sinematik + Amca'nın arabası) -------------------------------------------
  const setAway = useCallback((on) => {
    if (R.away === on) return;
    R.away = on;
    onAway?.(on);
  }, [R, onAway]);

  // --- replik kuyruğu --------------------------------------------------------------------
  const findActor = (id) => (R.amca?.st.id === id ? R.amca : R.npcs.find((n) => n.st.id === id));
  const say = useCallback((who, text, { phone = false, script = false } = {}) => {
    // sahne (sinematik / son sahne) oynarken sahne dışından gelen sözler düşer (karışmasın)
    if (R.scriptOn && !script) return R.queue;
    const g = R.gen;
    R.queue = R.queue.then(async () => {
      // şehir başka bir ekranın arkasındayken (panel, yarış, soygun, iş) replik bekler
      while (R.busy && !R.scriptOn && g === R.gen) await sleep(300);
      if (g !== R.gen || !R.eng) return;
      const self = R.eng.getSelf();
      const actor = WHO[who] ? findActor(WHO[who].id) : null;
      const far = actor && self && dist(actor.pos, self) > PHONE_D;
      const viaPhone = phone || far || (who === 'amca' && R.z === 'convoy');
      if (actor && !far) actor.say(text);
      if (who === 'me') R.eng.say(text);
      setLine({ who, text, phone: viaPhone });
      await new Promise((r) => {
        const t = setTimeout(r, lineMs(text));
        R.skipLine = () => {
          clearTimeout(t);
          r();
        };
      });
      setLine(null);
      await sleep(150);
    });
    return R.queue;
  }, [R]); // eslint-disable-line react-hooks/exhaustive-deps
  const sayAll = useCallback((list, who = 'amca', opts = {}) => {
    let p = R.queue;
    (list || []).forEach((l) => {
      p = typeof l === 'string' ? say(who, l, opts) : say(l.who, l.text, opts);
    });
    return p;
  }, [R, say]);
  const sayS = useCallback((who, text, o = {}) => say(who, text, { ...o, script: true }), [say]);
  const hush = useCallback(() => {
    R.gen += 1;
    R.skipLine?.();
    R.queue = Promise.resolve();
    setLine(null);
  }, [R]);

  // --- yön oku (meslek işi varken asla dokunulmaz) ---------------------------------------------
  const clearRoute = useCallback(() => {
    if (R.routeOwned && !R.jobActive) {
      R.eng?.jobRoute(null);
      R.eng?.jobTarget(null);
    }
    R.routeOwned = false;
    R.routeKey = null;
  }, [R]);

  // --- sahne temizliği -------------------------------------------------------------------
  const clearScene = useCallback(() => {
    R.cleanups.splice(0).forEach((f) => {
      try {
        f();
      } catch {
        /* yok */
      }
    });
    R.npcs.splice(0).forEach((n) => n.remove());
    R.props?.dispose();
    R.props = null;
    const k = R.eng?.story;
    k?.hideRemotes(false);
    k?.lockMove(false);
    k?.hideNpc('Bekçi', false);
    k?.crouch(false);
    k?.pose('self', null);
    k?.run(false);
    R.eng?.setHolding(null);
  }, [R]);

  // --- Amca -------------------------------------------------------------------------------
  const ensureAmca = useCallback(() => {
    if (R.amca?.alive) return R.amca;
    const gy = (x, z) => R.eng?.story?.groundY(x, z) ?? 0;
    R.amca = createActor(R.eng, AMCA, gy);
    return R.amca;
  }, [R]);
  const dropAmca = useCallback(() => {
    if (R.eng?.story?.riding()) R.eng.rideEnd();
    R.amca?.remove();
    R.amca = null;
    R.z = 'none';
  }, [R]);
  const amcaFace = () => (R.mode === 'old' ? (R.oldCalled ? AMCA_DARK : AMCA.avatar) : R.idx > IDX_CALL ? AMCA_DARK : AMCA.avatar);
  // Amca'yı hedefin önüne (ya da oyuncunun yakınındaki yola) koy, arabanın yanında beklesin
  const parkAmca = useCallback((t = R.task) => {
    const a = ensureAmca();
    a.setAvatar(amcaFace());
    const self = R.eng.getSelf();
    const pl = t?.to ? PLACES[t.to] : null;
    const spot = pl ? pl.park : inCityRect(self) ? nearestRoad(self) : PLACES.karakol.park;
    a.placeCar(spot.x, spot.z, Math.PI / 2);
    a.getOut();
    R.z = 'wait';
    R.beats.met = false;
  }, [R, ensureAmca]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- sunucuya olay (tekrar dener; olmazsa bir sonraki açılışta yeniden) ------------------------
  const sendEvent = useCallback(async (event) => {
    lsSet(LS(R.uid, 'pending'), event);
    for (let i = 0; i < 4; i++) {
      try {
        await checkOnboardingProgress({ event });
        lsSet(LS(R.uid, 'pending'), null);
        return true;
      } catch {
        await sleep(1500 * (i + 1));
      }
    }
    return false;
  }, [R]);

  // --- Nevzat'ın telefonu --------------------------------------------------------------------
  const runCall = useCallback(async (lines = CALL, after = AFTER_CALL) => {
    if (R.scriptOn) return;
    const a = R.amca;
    R.callOn = true;
    try {
      await callInner(a, lines, after);
    } finally {
      R.callOn = false;
    }
  }, [R]); // eslint-disable-line react-hooks/exhaustive-deps
  const callInner = async (a, lines, after) => {
    hush();
    sRing();
    music('tension', { vol: 0.6 });
    a?.say('📞');
    setCall({ i: -1, face: 'smile', lines });
    await sleep(2200);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      setCall((c) => ({ ...c, i, face: l.face || c.face }));
      if (l.face === 'mid') a?.setAvatar(AMCA_MID);
      if (l.face === 'dark') a?.setAvatar(AMCA_DARK);
      await sleep(lineMs(l.text) + 300);
    }
    sHangup();
    stopMusic(2.5);
    setCall((c) => ({ ...c, i: lines.length, ended: true }));
    await sleep(1300);
    setCall(null);
    a?.setAvatar(AMCA_DARK);
    lsSet(LS(R.uid, 'call'), '1');
    await sayAll(after);
  };

  // --- karakolun önünde karşılaşma -----------------------------------------------------------
  const runMeet = useCallback(async (lines) => {
    const sess = R.session;
    const alive = () => sess === R.session && R.eng;
    const e = R.eng;
    R.z = 'script';
    setMeeting(true);
    try {
      return await meetInner(e, alive, lines);
    } finally {
      setMeeting(false);
    }
  }, [R, ensureAmca, sayAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const meetInner = async (e, alive, lines) => {
    e.spawnAt({ region: 'karakol', out: true }); // karakolun kapısının önünde (dışarıda)
    await sleep(300);
    const a = ensureAmca();
    a.setAvatar(AMCA.avatar);
    a.placeCar(AMCA_ARRIVE_FROM.x, AMCA_ARRIVE_FROM.z, Math.PI / 2);
    a.getIn();
    const drive = a.driveTo(PLACES.karakol.park);
    await sleep(1200);
    music('warm', { vol: 0.8 });
    await drive;
    if (!alive()) return false;
    a.getOut();
    // v168.2: oyuncu bu arada yürüdüyse Amca onu bulana kadar yürür (en fazla birkaç adım)
    for (let k = 0; k < 4; k++) {
      const me = e.getSelf();
      const dx = a.pos.x - me.x;
      const dz = a.pos.z - me.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 1.6) break;
      await a.walkTo(me.x + (dx / d) * 0.9, me.z + (dz / d) * 0.9, d > 12 ? 3.4 : 2.3, d > 12);
      if (!alive()) return false;
    }
    a.emote('selam'); // el sallar
    e.emote('selam');
    await sayAll(lines);
    stopMusic(4);
    if (!alive()) return false;
    R.z = 'wait';
    const c = a.carPos;
    if (c) {
      await a.walkTo(c.x + Math.cos(c.yaw) * 2.1, c.z - Math.sin(c.yaw) * 2.1, 1.8);
      if (alive() && !e.isRiding() && R.z === 'wait') a.getIn();
    }
    return true;
  };

  // --- görev başlangıcı (go sözleri; "leave" görevinde Amca kendi gider) ------------------------
  const startTask = useCallback(async (t, { chapterFrom = null } = {}) => {
    if (!t) return;
    R.beats = {};
    clearRoute();
    if (t.chapter && t.chapter !== chapterFrom && R.mode !== 'old') {
      setChapter(t.chapter);
      sChapter();
      await sleep(1100);
    }
    await sayAll(t.go);
    const a = R.amca;
    if (t.leave && a?.carPos && !R.eng?.isRiding() && R.z !== 'script') {
      if (a.st.p !== 'd') {
        await a.walkTo(a.carPos.x + Math.cos(a.carPos.yaw) * 2.1, a.carPos.z - Math.sin(a.carPos.yaw) * 2.1, 2);
        a.getIn();
      }
      R.z = 'drive';
      a.driveTo(PLACES[t.to].park).then(() => {
        if (R.z === 'drive' && !R.eng?.isRiding()) {
          a.getOut();
          R.z = 'wait';
        }
      });
    }
    // (durum görevlerinin sunucu kontrolü aşağıdaki etkide: şart sağlanınca / şehre dönünce)
  }, [R, clearRoute, sayAll]);

  // --- v168.2 ESKİ OYUNCU: parkta, bankta yan yana çay — Amca anlatır, son sözde telefon çalar ----------
  const runTea = useCallback(async () => {
    const e = R.eng;
    const a = R.amca;
    const b = R.bench;
    if (!e || !a || !b || R.z === 'script' || R.scriptOn) return;
    const sess = R.session;
    const alive = () => sess === R.session && R.eng === e;
    R.z = 'script';
    setScript(true); // görev şeridi sahne boyunca gizli
    hush();
    clearRoute();
    try {
      if (e.isDriving()) e.exitCar();
      if (e.isRiding()) e.rideEnd();
      // Amca uzaktaysa (oyuncu ışınlandıysa) park girişine gelir, banka yürür
      if (dist(a.pos, b.other) > 30) {
        a.placeCar(PLACES.park.park.x, PLACES.park.park.z, Math.PI / 2);
        a.getOut();
      } else if (a.inCar) a.getOut();
      if (!e.story.sitSeat(b.i)) e.story.crouch(true); // oturak bu arada dolduysa olduğu yere çöker
      music('warm', { vol: 0.45 });
      await a.walkTo(b.other.x, b.other.z, 2.2);
      if (!alive()) return;
      a.sitAt(b.other.x, b.other.z, b.other.y);
      R.props = createStoryProps(e.story);
      R.props?.teaFor((b.me.x + b.other.x) / 2, b.me.y + 0.02, (b.me.z + b.other.z) / 2);
      await sleep(1500);
      for (const l of TEA_OLD) {
        if (!alive()) return;
        await say('amca', l);
        await sleep(900); // sözler arasında sessizlik
      }
      if (!alive()) return;
      // tam o sırada telefon
      stopMusic(0.8);
      await runCall(CALL_OLD, AFTER_CALL_OLD);
      if (!alive()) return;
      R.oldCalled = true;
      lsSet(LS(R.uid, 'old'), 'called');
      R.props?.dispose();
      R.props = null;
      a.stand();
      e.story.crouch(false); // banktan kalk
      R.task = OLD_HESAP;
      R.beats = {};
      setOldTask(OLD_HESAP);
      R.z = 'wait';
      const c = a.carPos;
      if (c) {
        await a.walkTo(c.x + Math.cos(c.yaw) * 2.1, c.z - Math.sin(c.yaw) * 2.1, 2);
        if (alive() && !e.isRiding() && R.z === 'wait') a.getIn();
      }
    } finally {
      if (R.z === 'script') R.z = 'wait';
      setScript(false);
    }
  }, [R, hush, clearRoute, say, runCall]);

  // --- SON SAHNE: hurdalık -----------------------------------------------------------------
  const runFinale = useCallback(async () => {
    const e = R.eng;
    const a = R.amca;
    if (!e || !a || R.z === 'script') return;
    const sess = R.session;
    const alive = () => sess === R.session && R.eng === e;
    const check = () => {
      if (!alive()) throw CANCEL;
    };
    const wait = (ms) => sleep(ms).then(check);
    const isOld = R.mode === 'old';
    R.z = 'script';
    R.scriptOn = true;
    setScript(true);
    hush();
    clearRoute();
    setAway(true);
    try {
      setCine('bars');
      await wait(400);
      if (e.isDriving()) e.exitCar();
      if (e.isRiding()) e.rideEnd();
      a.stopCar();
      a.removeCar();
      const k = e.story;
      R.props = createStoryProps(k);
      const P = R.props;
      P?.cover();
      k.hideNpc('Bekçi', true);
      k.hideRemotes(true);
      music('tension');
      e.teleport(274.4, 29);
      a.placeAt(274.4, 31.4);
      e.setCam(-Math.PI / 2 + 0.3, 0.22, 9.5); // siperin arkasından düşmanlara (doğuya) bakar
      const gy = (x, z) => k.groundY(x, z);
      const foes = [NEVZAT, ...AKREPLER].map((def, i) => {
        const f = createActor(e, { ...def, carId: null }, gy);
        R.npcs.push(f);
        f.placeAt(304 + i * 1.2, 29.5 + (i % 2 ? 1.6 : -1.6));
        f.hold(i === 0 ? 'altinTabanca' : i % 2 ? 'tufek' : 'pompali');
        return f;
      });
      const [nev, ...men] = foes;
      const spots = [{ x: 293.3, z: 26.8 }, { x: 293.3, z: 34 }, { x: 296.6, z: 30.7 }, { x: 297.1, z: 28.9 }];
      await Promise.all([nev.walkTo(288.2, 30.2, 2.2), ...men.map((m, i) => m.walkTo(spots[i].x - 4, spots[i].z, 2.2))]);
      check();
      foes.forEach((f) => f.look(true));
      for (const l of FINALE.talk) {
        if (l.text === 'Siper al!') {
          sayS(l.who, l.text);
          k.run(true);
          e.walkTo(277.5, 29.3);
          a.walkTo(277.5, 31.6, 5.6, true);
          e.setHolding('tabanca');
          a.hold('tabanca');
          await wait(700);
          continue;
        }
        if (l.text === 'Vurun!') {
          sayS(l.who, l.text);
          await wait(400);
          nev.walkTo(296.9, 30, 5.5, true).then(() => nev.alive && nev.crouch());
          men.forEach((m, i) => m.walkTo(spots[i].x, spots[i].z, 5, true).then(() => m.alive && m.crouch()));
          await wait(900);
          a.crouch();
          break;
        }
        await sayS(l.who, l.text);
        check();
      }
      // --- çatışma -----------------------------------------------------------------------
      const bodies = [];
      R.cleanups.push(() => bodies.forEach((b) => b.remove()));
      const kill = (f) => {
        const p = f.pos;
        f.remove();
        const b = P?.corpse(corpseSvg(f.st.avatar), p.x, p.z);
        if (b) bodies.push(b);
        return b;
      };
      const amcaAim = () => ({ ...a.pos, h: 1.15 });
      const meAim = () => ({ ...e.getSelf(), h: 1.15 });
      const coverHit = () => ({ x: 280.6, z: 28.6 + Math.random() * 3.2, h: 0.5 + Math.random() * 0.8 });
      const miss = (f) => ({ x: f.pos.x - 1.1, z: f.pos.z + (Math.random() - 0.5), h: 0.6 + Math.random() * 0.6 });
      music('action');
      const left = [...men];
      const hp = new Map(left.map((m) => [m, 2]));
      const exposed = new Set();
      const S = { on: true, crouched: false, hp: 100, last: 0 };
      const COVER = { x: 277.3, z: 29.3 };
      const ui = () => setFight((f) => ({ ...(f || {}), crouched: S.crouched, hp: S.hp, left: left.length }));
      const down = () => {
        const me = e.getSelf();
        if (dist(me, COVER) > 1.2) e.teleport(COVER.x, COVER.z);
        S.crouched = k.crouch(true) !== false;
        ui();
      };
      const up = () => {
        k.crouch(false);
        S.crouched = false;
        ui();
      };
      const wound = (m) => {
        const n = hp.get(m) - 1;
        hp.set(m, n);
        if (n <= 0 && left.includes(m)) {
          left.splice(left.indexOf(m), 1);
          exposed.delete(m);
          kill(m);
          ui();
        }
      };
      R.fightCtl = {
        crouch: () => (S.crouched ? up() : down()),
        fire: () => {
          const now = Date.now();
          if (!S.on || now - S.last < 420 || !left.length) return;
          S.last = now;
          if (S.crouched) up();
          const me = e.getSelf();
          const tg = [...exposed][0] || left.reduce((b, m) => (dist(m.pos, me) < dist(b.pos, me) ? m : b), left[0]);
          sGun(1);
          if (exposed.has(tg)) {
            P?.shot(meAim(), { ...tg.pos, h: 1.1 }, { hit: false });
            wound(tg);
          } else {
            P?.shot(meAim(), miss(tg));
            setTimeout(sRicochet, 60);
          }
        },
      };
      // v168.1: çatışmada da yürünür ve etrafa bakılır; kalkıp yürüyen oyuncu siperde sayılmaz
      const syncCrouch = () => {
        const c = k.isCrouched();
        if (c !== S.crouched) {
          S.crouched = c;
          ui();
        }
      };
      setFight({ crouched: false, hp: 100, left: left.length, hint: true });
      down();
      sayS('amca', 'Kafanı kaldırma! Kalkınca ateş et!');
      setTimeout(() => setFight((f) => f && { ...f, hint: false }), 5000);
      const foeLoop = (async () => {
        await sleep(1600);
        while (S.on && left.length && alive()) {
          const m = left[Math.floor(Math.random() * left.length)];
          exposed.add(m);
          m.stand();
          await sleep(650);
          for (let i = 0; i < 2 && left.includes(m) && alive(); i++) {
            sGun(0.75);
            syncCrouch();
            if (S.crouched) {
              P?.shot({ ...m.pos }, coverHit());
              setTimeout(Math.random() < 0.5 ? sMetal : sRicochet, 50);
            } else {
              P?.shot({ ...m.pos }, meAim(), { hit: false });
              sHurt();
              S.hp = Math.max(0, S.hp - 13);
              setHurtAt(Date.now());
              ui();
            }
            await sleep(220);
          }
          await sleep(500);
          if (left.includes(m)) m.crouch();
          exposed.delete(m);
          if (S.hp <= 0) {
            sayS('amca', 'Eğil dedim sana!');
            S.hp = 60;
            down();
          }
          await sleep(700 + Math.random() * 900);
        }
      })();
      const amcaLoop = (async () => {
        await sleep(2600);
        while (S.on && left.length && alive()) {
          a.stand();
          await sleep(250);
          const tg = [...exposed][0];
          sGun(0.9);
          if (tg && Math.random() < 0.55) {
            P?.shot(amcaAim(), { ...tg.pos, h: 1.1 }, { hit: false });
            wound(tg);
          } else if (left.length) P?.shot(amcaAim(), miss(left[0]));
          await sleep(300);
          if (alive()) a.crouch();
          await sleep(2400 + Math.random() * 1400);
        }
      })();
      const deadline = Date.now() + 45_000; // en geç 45 sn'de biter (takılma yok)
      while (left.length) {
        await wait(250);
        syncCrouch();
        if (Date.now() > deadline) left.slice().forEach((m) => {
          wound(m);
          wound(m);
        });
      }
      S.on = false;
      await Promise.all([foeLoop, amcaLoop]);
      check();
      setFight(null);
      stopMusic(1);
      await wait(800);
      k.crouch(false);
      a.stand();
      e.walkTo(281.8, 27.9);
      a.walkTo(282, 31.6, 2);
      await sayS('amca', 'Bitti Nevzat.');
      nev.stand();
      await nev.walkTo(290.4, 29.4, 2.4);
      check();
      nev.look(true);
      await sayS('nevzat', 'Bitmedi.');
      a.walkTo(283.6, 28.3, 7, true);
      sayS('amca', 'HAYIR!');
      await wait(450);
      sGun(1);
      P?.shot({ ...nev.pos }, { ...a.pos, h: 1.15 }, { hit: false });
      await wait(170);
      sGun(1);
      P?.shot({ ...nev.pos }, { ...a.pos, h: 1.05 }, { hit: false });
      setCine('flash');
      await wait(90);
      setCine('bars');
      const ap = a.pos;
      a.removePerson();
      R.amca = null;
      const amcaBody = P?.corpse(corpseSvg(AMCA_DARK), ap.x, ap.z);
      if (amcaBody) bodies.push(amcaBody);
      sHeart(3, 0.8);
      await wait(400);
      // son atış oyuncudan
      await new Promise((r) => {
        const t = setTimeout(r, 7000);
        R.fightCtl = {
          fire: () => {
            clearTimeout(t);
            r();
          },
        };
        setFight({ finalShot: true });
      });
      check();
      setFight(null);
      for (let i = 0; i < 3; i++) {
        sGun(1);
        P?.shot(meAim(), { ...nev.pos, h: 1.1 - i * 0.1 });
        await wait(180);
      }
      kill(nev);
      e.setHolding(null);
      k.run(false);
      await wait(1300);
      // --- tüm düşmanlar öldü: Amca'nın yanına çök, son sözleri ------------------------------
      e.walkTo(ap.x - 0.9, ap.z);
      await wait(1800);
      k.crouch(true);
      e.setCam(-Math.PI / 2 + 0.55, 0.36, 4.6); // Amca'nın başında, yandan
      music('sad', { vol: 0.5 });
      await wait(900);
      for (const l of FINALE.last) {
        await sayS('amca', l);
        check();
        await wait(500);
      }
      await wait(1200);
      setCine('black');
      await wait(1400);
      k.crouch(false);
      clearScene();
      // mezar (bu cihazda; sunucuda iz yok)
      if (!R.grave) {
        R.grave = createStoryProps(e.story);
        R.grave?.grave(GRAVE.x, GRAVE.z, GRAVE.ry);
      }
      // mezar taşının önünde, biraz yanında; kamera taşın yazısını görür
      e.teleportWorld(GRAVE.x + 1.3, GRAVE.z - 1.7);
      e.setCam(Math.PI - 0.15, 0.3, 6);
      await wait(900);
      stopMusic(2.5);
      setCine('quiet');
      await wait(3800);
      // v168.1: çakmak kartı kaldırıldı — sessizlikten sonra doğrudan oyun başlar
      setCine(null);
      e.setCam(null, 0.36, 9);
      R.z = 'none';
      setOver(true);
      setAway(false);
      // ilerleme sunucuda: yeni oyuncu → görev geçer; eski oyuncu → sadece mezar (görevlere dokunmaz)
      sendEvent(isOld ? 'replay' : 'finale');
      if (isOld) {
        lsSet(LS(R.uid, 'old'), null);
        setOldTask(null);
      }
    } catch (err) {
      if (err !== CANCEL) console.error('Amca son sahne', err);
      setFight(null);
      clearScene();
      setCine(null);
      setAway(false);
    } finally {
      R.scriptOn = false;
      setScript(false);
      R.fightCtl = {};
    }
  }, [R, hush, clearRoute, setAway, sayS, clearScene, sendEvent]);


  // --- 3 yıl önce (her oyuncu isteğe bağlı; bir kez izleyen tekrar izlerken geçebilir) ----------
  const playFlashback = useCallback(async () => {
    const e = R.eng;
    if (!e || R.scriptOn || R.busy) return;
    unlockAudio();
    const isOld = R.mode === 'old';
    const isStart = R.mode === 'pre'; // yeni oyuncu: hikâye burada başlar
    const back = { ...e.getSelf() };
    R.session += 1;
    const sess = R.session;
    const ctx = {
      eng: e,
      kit: e.story,
      props: null,
      npcs: R.npcs,
      say: sayS,
      setCine,
      setTitle,
      alive: () => sess === R.session && R.eng === e,
      onCleanup: (f) => R.cleanups.push(f),
    };
    const seen = lsGet(LS(R.uid, 'fb')) === '1';
    setSkip(seen);
    R.scriptOn = true;
    setScript(true);
    hush();
    clearRoute();
    setAway(true);
    const zWas = R.z;
    R.z = 'script';
    if (e.isDriving()) e.exitCar();
    if (e.isRiding()) e.rideEnd();
    e.story.hideRemotes(true);
    R.props = createStoryProps(e.story);
    ctx.props = R.props;
    let ok = false;
    try {
      await runFlashback(ctx);
      ok = true;
    } catch (err) {
      if (err?.message !== CANCELLED) console.error('3 yıl önce', err);
    }
    hush();
    // v168.2 DÜZELTME: "Geç" ile atlanınca oyuncu sahnedeki arabada (Emre'nin / polisin) yolcu olarak
    // kalıyordu → karakolun önünde yürüyemiyordu. Sahne hangi anda biterse bitsin arabadan inilir.
    if (e.isRiding()) e.rideEnd();
    clearScene();
    silenceAll();
    setSkip(false);
    if (ok) lsSet(LS(R.uid, 'fb'), '1');
    if (!R.eng) return;
    // yeni oyuncu: hikâye başlar → karakolun önünde Amca karşılar, görevler başlar
    if (isStart) {
      R.session += 1;
      R.starting = true;
      setStartedLocal(true);
      sendEvent('start');
      e.spawnAt({ region: 'karakol', out: true });
      e.setCam(null, 0.36, 9);
      await sleep(700);
      setTitle(null);
      setCine(null);
      setAway(false);
      R.scriptOn = false;
      setScript(false);
      try {
        const met = await runMeet(MEET_NEW);
        if (!met) return;
        lsSet(LS(R.uid, 'meet'), '1');
        const p = R.posNow || 1;
        R.prevPos = p;
        await startTask(STORY_TASKS[p - 1], { chapterFrom: null });
      } finally {
        R.starting = false;
      }
      return;
    }
    // dönüş: eski oyuncu (Amca henüz gelmediyse) karakolun önünde Amca'yla karşılaşır; yeni oyuncu kaldığı yere
    R.session += 1;
    const isMeet = isOld && !lsGet(LS(R.uid, 'old'));
    if (isMeet) {
      // karartmada karakolun önüne alınır, sonra perde açılır (otoyol arada görünmesin)
      e.spawnAt({ region: 'karakol', out: true });
      e.setCam(null, 0.36, 9);
      await sleep(700);
      setTitle(null);
      setCine(null);
      setAway(false);
      R.scriptOn = false;
      setScript(false);
      const met = await runMeet([...MEET_OLD, ...personalLines(R.player, R.gang), ...MEET_OLD_END]);
      if (!met) return;
      lsSet(LS(R.uid, 'old'), 'met');
      R.oldCalled = false;
      R.bench = null;
      R.beats = {};
      R.task = OLD_TEA;
      setOldTask(OLD_TEA);
      return;
    }
    e.teleportWorld(back.x, back.z); // şehir dışında (otoyol, Kervankent) da çalışır
    e.setCam(null, 0.36, 9);
    await sleep(900);
    setTitle(null);
    setCine(null);
    setAway(false);
    R.scriptOn = false;
    setScript(false);
    R.z = zWas === 'script' ? 'wait' : zWas;
    if (R.amca && (R.z === 'wait' || R.z === 'none')) parkAmca();
  }, [R, sayS, hush, clearRoute, setAway, clearScene, runMeet, parkAmca, sendEvent, startTask]);
  const skipFlashback = () => {
    R.session += 1;
    R.skipLine?.();
  };

  useImperativeHandle(ref, () => ({ playFlashback }), [playFlashback]);
  useEffect(() => {
    const on = Boolean(uid) && (mode === 'pre' || mode === 'new' || mode === 'old') && !script && !meeting;
    onFlashButton?.(on ? (mode === 'pre' ? 'pre' : 'on') : false);
  }, [uid, mode, script, meeting, onFlashButton]);

  // v196: görev şeridi (Rıza Amca) ekranda sürekli kalmaz — görev değişince / dokunulunca birkaç saniye görünür
  const [chipFresh, setChipFresh] = useState(true);
  const [chipKey, setChipKey] = useState('');
  useEffect(() => {
    if (!chipKey) return undefined;
    setChipFresh(true);
    const t = setTimeout(() => setChipFresh(false), 6500);
    return () => clearTimeout(t);
  }, [chipKey]);
  // v168.1: şehrin alttaki düğmeleri (Arabaya bin, Bağış yap…) açıkken görev şeridi ve replik onların ÜSTÜNE çıkar
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      let h = 0;
      if (!document.body.classList.contains('amca-cine')) {
        const el = document.querySelector('.cs-root .hs-actions');
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.height > 0) h = Math.max(0, Math.round(window.innerHeight - r.top + 10));
        }
      }
      setLift((p) => (Math.abs(p - h) > 4 ? h : p));
    }, 300);
    return () => clearInterval(iv);
  }, []);

  // ilk dokunuşta sesi aç (tarayıcı kuralı)
  useEffect(() => {
    const on = () => unlockAudio();
    window.addEventListener('pointerdown', on, { once: true });
    return () => window.removeEventListener('pointerdown', on);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('amca-cine', Boolean(cine) || Boolean(fight) || Boolean(call));
    return () => document.body.classList.remove('amca-cine');
  }, [cine, fight, call]);
  useEffect(() => {
    if (!chapter) return undefined;
    const t = setTimeout(() => setChapter(null), 2600);
    return () => clearTimeout(t);
  }, [chapter]);

  // --- mezar: Amca öldüyse (bu cihazda çizilir) ----------------------------------------------
  useEffect(() => {
    if (!eng || !(mode === 'after' || mode === 'finished')) return;
    if (!R.grave) {
      R.grave = createStoryProps(eng.story);
      R.grave?.grave(GRAVE.x, GRAVE.z, GRAVE.ry);
    }
  }, [eng, mode, R]);

  // --- kurulum: motor + oyuncu hazır olunca --------------------------------------------------
  useEffect(() => {
    if (!eng || !uid || !player) return undefined;
    const sess = ++R.session;
    const alive = () => sess === R.session;
    R.setupOn = true;
    R.setupTok = sess;
    (async () => {
      await sleep(600);
      if (!alive()) return;
      // yarım kalan sunucu olayı (bağlantı koptuysa) önce tamamlanır — sahne tekrar oynamaz
      const pending = lsGet(LS(uid, 'pending'));
      if (pending) {
        await sendEvent(pending);
        if (pending !== 'start') return; // son sahne olayı: sahne tekrar oynamaz
      }
      if (R.mode === 'new') {
        // "3 yıl önce"den gelen başlangıç akışı Amca'yı zaten kuruyor
        if (R.starting || (R.amca?.alive && R.prevPos != null)) return;
        R.prevPos = null; // kurulum bitene kadar görev değişimleri burada toplanır
        parkAmca(STORY_TASKS[R.posNow - 1]);
        // telefon sahnesi kaçtıysa (görev başka ekranda bittiyse) şimdi oynar
        if (R.posNow - 1 > IDX_CALL && !lsGet(LS(uid, 'call'))) await runCall();
        if (!alive() || R.mode !== 'new') return;
        const p = R.posNow;
        R.prevPos = p;
        await startTask(STORY_TASKS[p - 1], { chapterFrom: STORY_TASKS[p - 1]?.chapter });
      } else if (R.mode === 'old') {
        const st = lsGet(LS(uid, 'old'));
        if (st) {
          // 'met' → parkta çay (telefon orada çalar) · 'called' → hurdalık
          const t0 = st === 'called' ? OLD_HESAP : OLD_TEA;
          setOldTask(t0);
          R.task = t0;
          R.oldCalled = st === 'called';
          R.bench = null;
          parkAmca(t0);
          await sayAll(st === 'called' ? ['Hurdalığa evlat. Bu gece hesap kapanacak.'] : ['Hadi, parkta bir çay içelim.']);
        }
      }
    })().finally(() => {
      if (R.setupTok === sess) R.setupOn = false;
    });
    return () => {
      R.session += 1;
      R.setupOn = false;
    };
    // sadece motor / oyuncu değişince (görev değişimi aşağıda)
  }, [eng, uid, Boolean(player), mode === 'new' || mode === 'old']); // eslint-disable-line react-hooks/exhaustive-deps

  // --- görev değişimi (sunucu ilerletti) ---------------------------------------------------
  useEffect(() => {
    if (!eng || mode !== 'new' || R.prevPos == null) return;
    const prev = R.prevPos;
    if (pos === prev) return;
    R.prevPos = pos;
    if (pos < prev) {
      // (olmamalı) geri gittiyse: sessizce yeniden kur
      hush();
      parkAmca(STORY_TASKS[pos - 1]);
      startTask(STORY_TASKS[pos - 1]);
      return;
    }
    const was = STORY_TASKS[prev - 1];
    const now = STORY_TASKS[pos - 1];
    (async () => {
      sDone();
      if (pos === prev + 1) await sayAll(was?.done);
      else hush(); // birden çok görev aynı anda geçti (otomatik): ara sözler atlanır
      const passedCall = prev - 1 <= IDX_CALL && pos - 1 > IDX_CALL;
      if (passedCall && !lsGet(LS(uid, 'call'))) await runCall();
      await startTask(now, { chapterFrom: was?.chapter });
    })();
  }, [eng, mode, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // v168.1 DÜZELTME ("şüphem 20 oldu, görev geçmedi"): durum görevleri sadece görev başlarken bir kez
  // soruluyordu; şart SONRADAN sağlanınca kimse sormuyordu. Artık şart sağlandığında (şüphe ≥ 20, avatar,
  // aktif kredi) ya da başka bir ekrandan (yarış, galeri, karargah…) şehre dönülünce yeniden sorulur.
  // Görev başına en sık 6 sn'de bir (sunucu zaten şart sağlanmıyorsa hiçbir şey yazmaz).
  const curTaskId = mode === 'new' ? STORY_TASKS[pos - 1]?.taskId : null;
  const statusReady =
    curTaskId === 9 ? Number(player?.suspicion || 0) >= 20 : curTaskId === 16 ? Boolean(player?.avatar) : curTaskId === 14 ? Boolean(player?.credit) : null;
  useEffect(() => {
    if (!curTaskId || !STATUS_TASK_IDS.includes(curTaskId) || busy) return;
    if (statusReady === false) return; // şart henüz yok — sormaya gerek yok
    const now = Date.now();
    const last = R.statusAt?.[curTaskId] || 0;
    if (now - last < (statusReady === null ? 20000 : 6000)) return;
    (R.statusAt ||= {})[curTaskId] = now;
    checkOnboardingProgress().catch(() => {
      R.statusAt[curTaskId] = 0;
    });
  }, [curTaskId, statusReady, busy, R]);

  // Amca öldükten sonra (yeni oyuncu): sahne bittiyse Amca yok
  useEffect(() => {
    if (mode === 'after' || mode === 'finished') {
      if (!R.scriptOn) dropAmca();
      clearRoute();
    }
    if (mode === 'none') {
      dropAmca();
      clearRoute();
    }
  }, [mode, R, dropAmca, clearRoute]);

  // --- ana döngü: Amca'nın hareketi + yön oku (çerçeve başına hafif) ---------------------------
  useEffect(() => {
    if (!eng) return undefined;
    let raf = 0;
    let last = performance.now();
    const step = (t) => {
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      R.amca?.update(dt);
      R.npcs.forEach((n) => n.update(dt));
      R.props?.update(dt);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [eng, R]);

  useEffect(() => {
    if (!eng) return undefined;
    const iv = setInterval(() => {
      const e = R.eng;
      const a = R.amca;
      const t = R.task;
      const zz = R.z;
      // Amca'nın arabasındayken ağda görünmeyiz
      if (!R.scriptOn) setAway(Boolean(e?.story?.riding()));
      // meslek işi bitince yön oku yeniden çizilsin
      if (R.lastJob !== R.jobActive) {
        R.lastJob = R.jobActive;
        R.routeKey = null;
        R.routeOwned = false;
      }
      if (!e || !a || !t || zz === 'script' || zz === 'none') return;
      if (R.setupOn || R.callOn) return; // karşılaşma / telefon sahnesi bitmeden hedef tetiklenmez
      const me = e.getSelf();
      const riding = e.isRiding() && e.story.riding();
      const driving = e.isDriving();
      const probe = e.jobProbe();
      const pl = t.to ? PLACES[t.to] : null;
      const car = a.carPos;
      const d = car ? dist(car, me) : 99;
      if (riding && t.leave) {
        // ışınlanma görevi: Amca'nın arabasıyla gidilmez (görev ışınlanınca geçer) — kibarca indirir
        e.rideEnd();
        if (!R.beats.leaveSaid) {
          R.beats.leaveSaid = true;
          say('amca', 'Sen haritadan ışınlan evlat, ben arkandan gelirim.');
        }
        return;
      }
      if (riding) {
        // Amca seni götürüyor
        if ((zz !== 'drive' || !a.driving) && pl && !near(car, pl.park, 6)) {
          a.getIn();
          R.z = 'drive';
          a.driveTo(pl.park).then(async () => {
            if (R.z !== 'drive') return;
            await sleep(400);
            if (e.isRiding()) e.rideEnd();
            a.getOut();
            R.z = 'wait';
          });
        } else if (zz !== 'drive') {
          // v168.1 TAKILMA DÜZELTMESİ: hedefin yanındayken ya da hedefi olmayan görevde arabaya binilirse
          // Amca bir yere gitmiyordu, oyuncu arabada kalıyordu → kısa beklemeden sonra kibarca indirir
          a.getIn();
          R.idleRide = (R.idleRide || 0) + 0.25;
          if (R.idleRide > 1.5) {
            R.idleRide = 0;
            e.rideEnd();
            say('amca', pl ? 'Geldik evlat, in bakalım.' : 'Bu işi kendin halledeceksin evlat.');
          }
        }
        if (zz === 'drive' || a.driving) R.idleRide = 0;
        if (t.ride && !R.beats.ride && a.driving && car && car.spd > 2) {
          R.beats.ride = true;
          sleep(900).then(() => R.task === t && sayAll(t.ride));
        }
      } else if (zz === 'drive' && !a.driving) {
        a.getOut();
        R.z = 'wait';
      }
      // kendi arabanla gidiyorsan Amca arkandan gelir (konvoy)
      if (!riding && driving && probe) {
        // v168.1: uzakta beklerken de (70 m'den uzak) arkandan gelir; çok uzaksa (140+) arkana geçer
        if (R.z !== 'convoy') {
          a.getIn();
          a.follow(() => {
            const p = e.jobProbe();
            return p ? (inCityRect(p) ? nearestRoad(p) : p) : null;
          });
          R.z = 'convoy';
        }
        if (R.z === 'convoy' && t.ride && !R.beats.ride && probe.speed > 3) {
          R.beats.ride = true;
          sleep(900).then(() => R.task === t && sayAll(t.ride));
        }
      } else if (R.z === 'convoy' && !driving) {
        a.stopCar();
        R.z = 'wait';
      }
      // görüş dışında kaldıysa: hedefin önüne geç, orada bekle (kovalamaz, ışınlanmaz)
      if (R.z === 'wait' && !riding && d > JUMP_D) {
        const spot = pl ? pl.park : inCityRect(me) ? nearestRoad(me) : null;
        if (spot && !near(car, spot, 8) && dist(spot, me) > 25) {
          a.placeCar(spot.x, spot.z, Math.PI / 2);
          a.getOut();
          R.beats.met = false;
        }
      }
      if (R.z === 'convoy' && d > 140) {
        const sp = inCityRect(probe || me) ? nearestRoad(probe || me) : probe || me;
        a.placeCar(sp.x - 12, sp.z, Math.PI / 2);
      }
      if (R.z === 'wait' && d < 18 && !R.beats.meet && t.meet) {
        R.beats.meet = true;
        sayAll(t.meet);
      }
      if (R.busy) return; // panel / yarış / soygun / iş: söz ve yön oku bekler
      // v168.2 eski oyuncu: çay — hedef parktaki bank; banka gelince sahne başlar
      if (t.tea) {
        if (!R.bench) R.bench = e.story.benchNear(PLACES.park.at.x, PLACES.park.at.z, 45);
        const bp = R.bench ? R.bench.me : pl?.at;
        if (bp && near(me, bp, 7) && !riding && !driving) {
          runTea();
          return;
        }
        if (bp && !R.jobActive) {
          const key = `tea_${Math.round(me.x / 6)}_${Math.round(me.z / 6)}`;
          if (key !== R.routeKey) {
            R.routeKey = key;
            let pts = null;
            try {
              pts = navRoute(me, bp);
            } catch {
              pts = null;
            }
            e.jobRoute(pts && pts.length > 1 ? pts : [me, bp], '#ffb347');
            e.jobTarget({ x: bp.x, z: bp.z, color: '#ffb347', r: 2 });
            R.routeOwned = true;
          }
        }
        return;
      }
      if (pl && !R.beats.there && near(me, pl.at, 22) && !riding) {
        R.beats.there = true;
        if (t.finale) {
          runFinale();
          return;
        }
        sayAll(t.there);
      }
      if (t.finale && pl && near(me, pl.at, 26) && (riding || driving)) {
        runFinale();
        return;
      }
      // yön oku (meslek işi varken hiç dokunulmaz)
      if (R.jobActive) return;
      if (pl && !near(me, pl.at, 8)) {
        const key = `${t.taskId}_${Math.round(me.x / 6)}_${Math.round(me.z / 6)}`;
        if (key !== R.routeKey) {
          R.routeKey = key;
          let pts = null;
          try {
            pts = navRoute(me, pl.at);
          } catch {
            pts = null;
          }
          e.jobRoute(pts && pts.length > 1 ? pts : [me, pl.at], '#ffb347');
          e.jobTarget({ x: pl.at.x, z: pl.at.z, color: '#ffb347', r: 2.5 });
          R.routeOwned = true;
        }
      } else if (R.routeOwned) clearRoute();
    }, 250);
    return () => clearInterval(iv);
  }, [eng, R, setAway, say, sayAll, runFinale, runTea, clearRoute]);

  // --- söküm: şehir kapanınca her şey silinir (bellek / ses / ağ) ------------------------------
  useEffect(() => () => {
    silenceAll();
    if (R.away) onAway?.(false);
    document.body.classList.remove('amca-cine');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- arayüz -------------------------------------------------------------------------
  const curTask = R.task;
  const meta = curTask ? TITLE_BY_ID[curTask.taskId] : null;
  const chipTitle = curTask?.title || meta?.title;
  const chipEmoji = curTask?.emoji || meta?.emoji;
  useEffect(() => {
    setChipKey(`${chipTitle || ''}|${mode}`); // yeni görev → şerit birkaç saniye görünür
  }, [chipTitle, mode]);
  const showChip = chipFresh && Boolean(chipTitle) && !meeting && !line && !chapter && !cine && !call && !fight && !script && !busy && (mode === 'new' || mode === 'after' || (mode === 'old' && oldTask));
  const nameOf = (w) => (w === 'me' ? 'Sen' : WHO[w]?.name || '');
  const avOf = (w) => (w === 'amca' ? R.amca?.st.avatar || AMCA_DARK : WHO[w]?.avatar);
  const showLine = line && (!busy || script);
  const callLines = call?.lines || CALL;
  if (mode === 'none' && !line && !cine) return null;
  return createPortal(
    <div className={`amca-root${cine ? ' cine-on' : ''}`}>
      {fight && (
        <div className="amca-fight">
          {!fight.finalShot && (
            <>
              <div className="hp">
                <span>❤️</span>
                <i style={{ width: `${fight.hp ?? 100}%` }} />
              </div>
              <div className="left">Akrep: {fight.left ?? 4}</div>
              {fight.hint && <div className="hint">🛡️ Eğil: siper al · 🔫 Ateş et: kalk ve ateş et</div>}
              <button type="button" className={`crouch${fight.crouched ? ' on' : ''}`} onClick={() => R.fightCtl.crouch?.()}>
                {fight.crouched ? '⬆️ Kalk' : '🛡️ Eğil'}
              </button>
            </>
          )}
          <button type="button" className={`fire${fight.finalShot ? ' final' : ''}`} onClick={() => R.fightCtl.fire?.()}>
            🔫 Ateş et
          </button>
        </div>
      )}
      {hurtAt > 0 && <div className="amca-hurt" key={hurtAt} />}
      {chapter && !cine && (
        <div className="amca-chapter">
          <span>BÖLÜM {chapter}</span>
          <b>{CHAPTERS[chapter]}</b>
        </div>
      )}
      {showChip && (
        <div className="amca-chip" style={lift ? { bottom: Math.max(118, lift) } : undefined} onClick={() => window.dispatchEvent(new CustomEvent('neon-onboarding-open'))}>
          <i>{chipEmoji}</i>
          <div>
            <small>{curTask?.sub || (mode === 'after' ? "Rıza Amca'nın son sözü" : 'Rıza Amca')}</small>
            <b>{chipTitle}</b>
          </div>
        </div>
      )}
      {showLine && (
        <div className={`amca-line who-${line.who}`} style={lift && !cine ? { bottom: Math.max(112, lift) } : undefined} onClick={() => R.skipLine?.()}>
          {line.who !== 'me' && avOf(line.who) && (
            <div className="amca-face">
              <AvatarSvg avatar={avOf(line.who)} size={44} rounded />
              {line.phone && <em>📞</em>}
            </div>
          )}
          <div>
            <small>{nameOf(line.who)}</small>
            <p>{line.text}</p>
          </div>
        </div>
      )}
      {call && (
        <div className={`amca-call${call.ended ? ' ended' : ''}`}>
          <div className={`side amca${callLines[call.i]?.who === 'amca' ? ' talk' : ''}`}>
            <AvatarSvg avatar={call.face === 'dark' ? AMCA_DARK : call.face === 'mid' ? AMCA_MID : AMCA.avatar} size={150} rounded />
            <b>Rıza Amca</b>
          </div>
          <div className="mid">
            <span>{call.i < 0 ? '📞 Gizli numara arıyor…' : call.ended ? 'Arama sona erdi' : '📞'}</span>
            {call.i >= 0 && callLines[call.i] && <p key={call.i}>{callLines[call.i].text}</p>}
          </div>
          <div className={`side nevzat${call.i >= 1 ? ' on' : ''}${callLines[call.i]?.who === 'nevzat' ? ' talk' : ''}`}>
            <AvatarSvg avatar={NEVZAT.avatar} size={150} rounded />
            <b>{call.i >= 1 ? NEVZAT.name : 'Gizli numara'}</b>
          </div>
        </div>
      )}
      {cine && cine !== 'quiet' && <div className={`amca-bars${cine === 'flash' ? ' flash' : ''}${cine === 'siren' ? ' siren' : ''}${cine === 'black' ? ' black' : ''}`} />}
      {title && (
        <div className="amca-title">
          {title.split('\n\n').map((p, i) => (
            <p key={p} className={i ? 'sub' : ''}>{p}</p>
          ))}
        </div>
      )}
      {cine === 'quiet' && <div className="amca-quiet" />}
      {skip && cine && (
        <button type="button" className="amca-skip" onClick={skipFlashback}>
          Geç ⏭
        </button>
      )}
      {over && (
        <div className="amca-over" onAnimationEnd={() => setOver(false)}>
          <b>Şehir senin.</b>
        </div>
      )}
    </div>,
    document.body
  );
});

export default AmcaStory;
