// SADECE önizleme (v78): Zamana karşı yarış — ?m=training|bet|champ&lv=1&car=1&clv=1
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TimeAttackRace from '../src/components/RaceTrackScreen/TimeAttackRace';
import { useRaceRoomById } from '../src/hooks/useRaceRoomById';
import { fakeDb, raceTa, PREVIEW_UID } from './mocks/backend.js';
import * as R from '../functions/raceSim.js';
import '../src/index.css';
import '../src/styles/theme.css';

const q = new URLSearchParams(location.search);
const mode = q.get('m') || 'training';
const lv = Number(q.get('lv') || 1);
const car = Number(q.get('car') || 1);
const clv = Number(q.get('clv') || 1);
const me = { displayName: 'Önizleme', vehicleId: 'v1', vehicleModel: R.carStats(car).name, catalogId: car, level: clv, finishMs: null, dnf: false };
let n = 0;
async function createTraining(level) {
  const id = `t${++n}`;
  const bot = R.trainingBotRun(level);
  await fakeDb.doc(`raceRooms/${id}`).set({ engine: 'ta', status: 'racing', isTraining: true, trainingLevel: level, creatorUid: PREVIEW_UID, participantUids: [PREVIEW_UID, 'bot'], players: { [PREVIEW_UID]: { ...me }, bot: { displayName: `Seviye ${level} Bot`, vehicleModel: R.carStats(bot.catalogId).name, catalogId: bot.catalogId, level: 1, finishMs: bot.ms, isBot: true } } });
  return { ok: true, roomId: id };
}
window.__createTraining = createTraining;

async function setup() {
  await fakeDb.doc(`users/${PREVIEW_UID}`).set({ gold: 10000 }, { merge: true });
  await fakeDb.doc('users/rakip1').set({ gold: 10000 });
  if (mode === 'training') return (await createTraining(lv)).roomId;
  if (mode === 'champ') {
    await fakeDb.doc('raceRooms/c1').set({ engine: 'ta', status: 'racing', isChampionship: true, championshipCatalogId: car, championshipDateKey: '2026-10-09', creatorUid: PREVIEW_UID, participantUids: [PREVIEW_UID], players: { [PREVIEW_UID]: { ...me } } });
    return 'c1';
  }
  const oc = Number(q.get('ocar') || car);
  const olv = Number(q.get('olv') || 1);
  await fakeDb.doc('raceRooms/b1').set({ engine: 'ta', status: 'racing', betAmount: 1000, creatorUid: PREVIEW_UID, participantUids: [PREVIEW_UID, 'rakip1'], deadlineMs: Date.now() + 240000, players: { [PREVIEW_UID]: { ...me }, rakip1: { displayName: 'Rakip Ali', vehicleId: 'v2', vehicleModel: R.carStats(oc).name, catalogId: oc, level: olv, finishMs: null, dnf: false } } });
  // sahte rakip: 1,5 sn gecikmeli başlar, hayalet yazar, bitince sonucu gönderir
  const st = R.carStats(oc, olv);
  const S = R.newCarState();
  const rec = R.createInputRecorder();
  const samples = [];
  while (!S.done && S.f < R.MAX_RACE_FRAMES) {
    const { bits, steer } = R.botInput(S, st, Number(q.get('oskill') || 0.9));
    let b = bits;
    if (steer > 0.25) b |= R.IN_R;
    else if (steer < -0.25) b |= R.IN_L;
    rec.push(b);
    R.stepCar(S, st, b);
    if (S.f % 6 === 0 || S.done) samples.push([S.f, Math.round(S.x * 10) / 10, Math.round(S.y * 10) / 10, Math.round(S.a * 1000) / 1000, S.nos ? 1 : 0]);
  }
  const ctx = { auth: { uid: 'rakip1' } };
  setTimeout(async () => {
    await raceTa.start({ ...ctx, data: { roomId: 'b1' } });
    const t0 = performance.now() + 3000;
    const iv = setInterval(async () => {
      const f = Math.max(0, ((performance.now() - t0) / 1000) * 60);
      const upto = samples.filter((s) => s[0] <= f);
      const done = upto.length === samples.length;
      await fakeDb.doc('raceGhosts/b1_rakip1').set({ uid: 'rakip1', roomId: 'b1', s: upto.slice(-14).flat(), fin: done ? R.framesToMs(S.f) : null, at: Date.now() });
      if (done) {
        clearInterval(iv);
        await raceTa.finish({ ...ctx, data: { roomId: 'b1', runs: rec.runs } }).catch((e) => console.error('rakip finish', e));
      }
    }, 700);
  }, 1500);
  return 'b1';
}

function App({ first }) {
  const [id, setId] = useState(first);
  const { room } = useRaceRoomById(id);
  if (!room) return <p style={{ color: '#fff' }}>Yükleniyor…</p>;
  return <TimeAttackRace key={room.id} room={room} myUid={PREVIEW_UID} onExit={() => console.log('exit')} onSwitchRoom={setId} />;
}
setup().then((id) => createRoot(document.getElementById('root')).render(<App first={id} />));
