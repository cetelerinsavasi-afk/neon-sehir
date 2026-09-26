// UGC Moderasyonu (Faz D1) Firestore rules testleri.
// Çalıştırma (proje kökünden):  cd tests/firestore-rules && npm i && npm test
// (firebase-tools kurulu olmalı; emülatör jar'ı ilk çalıştırmada indirilir)
import test, { before, after, beforeEach } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
let env;
const HOUR = 60 * 60 * 1000;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neon-rules-mod',
    firestore: { rules: fs.readFileSync(path.join(here, '../../firestore.rules'), 'utf8') },
  });
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const s = (p, d) => setDoc(doc(db, p), d);
    const presence = { displayName: 'X', avatar: null, x: 10, y: 10, facing: 'right', pose: 'idle', holding: null, seat: null, chatText: null, chatTs: null };
    for (const uid of ['normal', 'muted', 'expired']) {
      await s(`parkPresence/${uid}`, presence);
      await s(`interiorPresence/${uid}`, { ...presence, locationId: 'banka' });
    }
    await s('mutes/muted', { untilMs: Date.now() + 24 * HOUR, level: 'mute24h' });
    await s('mutes/expired', { untilMs: Date.now() - HOUR, level: 'mute24h' });
    await s('userBlocks/normal', { blocked: { muted: { at: 1, name: 'M' } } });
    await s('reports/r1', { reporterUid: 'normal', targetUid: 'muted', textSnapshot: 'x' });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

test('balon: susturulmamış oyuncu balon yazabilir', async () => {
  await assertSucceeds(updateDoc(doc(as('normal'), 'parkPresence/normal'), { chatText: 'selam', chatTs: 1 }));
  await assertSucceeds(updateDoc(doc(as('normal'), 'interiorPresence/normal'), { chatText: 'selam', chatTs: 1 }));
});

test('balon: susturulmuş oyuncu YENİ metin yazamaz ama hareket edebilir ve balonu temizleyebilir', async () => {
  await assertFails(updateDoc(doc(as('muted'), 'parkPresence/muted'), { chatText: 'hakaret', chatTs: 1 }));
  await assertFails(updateDoc(doc(as('muted'), 'interiorPresence/muted'), { chatText: 'hakaret', chatTs: 1 }));
  await assertSucceeds(updateDoc(doc(as('muted'), 'parkPresence/muted'), { x: 50, y: 60 }));
  await assertSucceeds(updateDoc(doc(as('muted'), 'interiorPresence/muted'), { x: 50, y: 60 }));
  await assertSucceeds(updateDoc(doc(as('muted'), 'parkPresence/muted'), { chatText: null }));
});

test('balon: süresi dolmuş susturma engel olmaz', async () => {
  await assertSucceeds(updateDoc(doc(as('expired'), 'parkPresence/expired'), { chatText: 'döndüm', chatTs: 1 }));
});

test('şikâyetler istemciye tamamen kapalı', async () => {
  await assertFails(getDoc(doc(as('normal'), 'reports/r1')));
  await assertFails(setDoc(doc(as('normal'), 'reports/r2'), { reporterUid: 'normal' }));
});

test('engelleme listesi yalnızca sahibine okunur, kimse yazamaz', async () => {
  await assertSucceeds(getDoc(doc(as('normal'), 'userBlocks/normal')));
  await assertFails(getDoc(doc(as('muted'), 'userBlocks/normal')));
  await assertFails(setDoc(doc(as('normal'), 'userBlocks/normal'), { blocked: {} }));
});

test('susturma kaydı yalnızca sahibine okunur, kimse yazamaz/silemez', async () => {
  await assertSucceeds(getDoc(doc(as('muted'), 'mutes/muted')));
  await assertFails(getDoc(doc(as('normal'), 'mutes/muted')));
  await assertFails(setDoc(doc(as('muted'), 'mutes/muted'), { untilMs: 0 }));
  await assertFails(updateDoc(doc(as('muted'), 'mutes/muted'), { untilMs: 0 }));
});
