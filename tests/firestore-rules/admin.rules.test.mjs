// UGC Faz D3 (Yönetim Paneli) Firestore rules testleri.
// Çalıştırma (proje kökünden):  cd tests/firestore-rules && npm i && npm test
import test, { before, after, beforeEach } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-neon-rules-admin',
    firestore: { rules: fs.readFileSync(path.join(here, '../../firestore.rules'), 'utf8') },
  });
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const s = (p, d) => setDoc(doc(db, p), d);
    await s('users/admin1', { displayName: 'A', role: 'admin' });
    await s('users/mod1', { displayName: 'M', role: 'moderator' });
    await s('users/player', { displayName: 'P' });
    await s('users/faker', { displayName: 'F', role: 'superuser' });
    await s('reports/r1', { reporterUid: 'player', targetUid: 'bad', status: 'open' });
    await s('admin_logs/l1', { action: 'mute', actorUid: 'mod1', atMs: 1 });
    await s('bans/bad', { active: true, untilMs: 1 });
    await s('bans/player', { active: false });
    await s('mutes/bad', { untilMs: 1 });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();

test('yetkililer şikâyetleri, denetim kayıtlarını, ban ve susturmaları okuyabilir', async () => {
  for (const uid of ['admin1', 'mod1']) {
    await assertSucceeds(getDoc(doc(as(uid), 'reports/r1')));
    await assertSucceeds(getDocs(collection(as(uid), 'admin_logs')));
    await assertSucceeds(getDoc(doc(as(uid), 'bans/bad')));
    await assertSucceeds(getDoc(doc(as(uid), 'mutes/bad')));
  }
});

test('oyuncular ve geçersiz roller okuyamaz (kendi ban/susturma kaydı hariç)', async () => {
  for (const uid of ['player', 'faker']) {
    await assertFails(getDoc(doc(as(uid), 'reports/r1')));
    await assertFails(getDocs(collection(as(uid), 'admin_logs')));
    await assertFails(getDoc(doc(as(uid), 'bans/bad')));
    await assertFails(getDoc(doc(as(uid), 'mutes/bad')));
  }
  await assertSucceeds(getDoc(doc(as('player'), 'bans/player')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reports/r1')));
});

test('kimse (yetkili dahil) istemciden yazamaz; oyuncu kendine rol veremez', async () => {
  for (const uid of ['admin1', 'mod1', 'player']) {
    await assertFails(setDoc(doc(as(uid), 'admin_logs/x'), { action: 'fake' }));
    await assertFails(setDoc(doc(as(uid), 'bans/player'), { active: true }));
    await assertFails(updateDoc(doc(as(uid), 'reports/r1'), { status: 'dismissed' }));
    await assertFails(setDoc(doc(as(uid), 'mutes/bad'), { untilMs: 0 }));
  }
  await assertFails(updateDoc(doc(as('player'), 'users/player'), { role: 'admin' }));
});
