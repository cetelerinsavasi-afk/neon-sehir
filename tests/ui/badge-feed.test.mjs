// v188 — rozetler / üst şerit: istemci RTDB badge düğümünü dinler; globalChat (limit 1) ve
// stats/sixtagram Firestore dinleyicileri kalktı. Sohbet ekranı (GroupChat) Firestore'da kalır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
const FB = 'data:text/javascript,' + encodeURIComponent('export const app = {};');
export async function resolve(spec, ctx, next) {
  if (spec === '../firebase') return { url: FB, shortCircuit: true };
  return next(spec, ctx);
}`));
const { parseBadges } = await import('../../src/lib/badgeFeed.js');
const read = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');

test('parseBadges: boş / bozuk değerler güvenli', () => {
  assert.deepEqual(parseBadges(null), { chat: null, six: null });
  assert.deepEqual(parseBadges({ chat: 'x', six: 5 }), { chat: null, six: null });
  assert.deepEqual(parseBadges({ chat: { uid: 'u' } }).chat, null, 'kimliksiz mesaj yok sayılır');
  const p = parseBadges({ chat: { id: 'm1', uid: 'u1', name: 'Ali', text: 'selam', at: '12' }, six: { uid: 'u2', at: 9 } });
  assert.deepEqual(p.chat, { id: 'm1', uid: 'u1', name: 'Ali', text: 'selam', at: 12 });
  assert.deepEqual(p.six, { uid: 'u2', at: 9 });
});

test('rozet kancası ve üst şerit Firestore dinlemez', () => {
  for (const f of ['hooks/useUnreadNotifications.js', 'components/TopNotificationBanner/TopNotificationBanner.jsx', 'lib/badgeFeed.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /useGlobalChat|'stats', 'sixtagram'|sixtagramPosts|from 'firebase\/firestore'/, f);
    assert.match(s, /useBadges|onValue/, f);
  }
});

test('sohbet ekranı Firestore okumaya devam eder', () => {
  assert.match(read('components/ChatsAppScreen/GroupChat.jsx'), /useGlobalChat\(\)/);
});
