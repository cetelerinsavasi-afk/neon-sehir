// v188 — bildirim rozetleri RTDB'den: sunucu özeti yazar, yazma sadece sunucu, okuma giriş yapmış herkese
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBadgeFeed, chatBadge, sixBadge, newer, BADGE_TEXT_MAX } from '../badgeFeed.js';

function fakeRtdb() {
  const data = new Map();
  return {
    data,
    rtdb: async () => ({
      ref: (path) => ({
        transaction: async (fn) => {
          const next = fn(data.get(path) ?? null);
          if (next !== undefined) data.set(path, next);
          return { committed: next !== undefined };
        },
      }),
    }),
  };
}

test('sohbet özeti: alanlar ve uzunluklar sınırlı', () => {
  const b = chatBadge({ id: 'm1', uid: 'u1', displayName: 'A'.repeat(99), text: 'x'.repeat(999), at: 5, avatar: 'gizli' });
  assert.deepEqual(Object.keys(b).sort(), ['at', 'id', 'name', 'text', 'uid']);
  assert.equal(b.name.length, 40);
  assert.equal(b.text.length, BADGE_TEXT_MAX);
  assert.equal(chatBadge({ id: 'm', uid: 'u', text: 'a', at: 1 }).name, 'Oyuncu');
  assert.deepEqual(sixBadge({ uid: 'u', at: '7', extra: 1 }), { uid: 'u', at: 7 });
});

test('geç kalan eski özet yenisinin üstüne yazılmaz', async () => {
  assert.equal(newer({ at: 10 }, { at: 9 }), undefined);
  assert.deepEqual(newer({ at: 10 }, { at: 10 }), { at: 10 });
  assert.deepEqual(newer(null, { at: 1 }), { at: 1 });
  const f = fakeRtdb();
  const feed = createBadgeFeed({ rtdb: f.rtdb });
  await feed.chat({ id: 'b', uid: 'u2', displayName: 'B', text: 'ikinci', at: 200 });
  await feed.chat({ id: 'a', uid: 'u1', displayName: 'A', text: 'birinci', at: 100 });
  assert.equal(f.data.get('badge/chat').id, 'b');
  await feed.six({ uid: 'u1', at: 300 });
  assert.deepEqual(f.data.get('badge/six'), { uid: 'u1', at: 300 });
});

test('RTDB hatası asıl işlemi bozmaz', async () => {
  const errs = [];
  const feed = createBadgeFeed({ rtdb: async () => { throw new Error('rtdb yok'); }, log: { error: (...a) => errs.push(a) } });
  assert.equal(await feed.chat({ id: 'x', uid: 'u', text: 't', at: 1 }), false);
  assert.equal(errs.length, 1);
});

test('index.js: mesaj ve gönderi yazıldıktan SONRA özet yazılır (3 yer)', () => {
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /const msgRef = await db\.collection\('globalChat'\)\.add\(\{[\s\S]{0,300}?\}\);\s*\/\/ v188[^\n]*\n\s*await badgeFeed\.chat\(\{ id: msgRef\.id, uid, displayName, text, at: Date\.now\(\) \}\);/);
  assert.match(src, /await batch\.commit\(\);\n\s*await badgeFeed\.six\(\{ uid, at: nowMs \}\);/);
  assert.match(src, /await batch\.commit\(\);\n\s*await badgeFeed\.six\(\{ uid: BELEDIYE_SIX_UID, at: nowMs \}\);/);
  assert.match(src, /const badgeFeed = createBadgeFeed\(\{ rtdb: cityDb \}\);/);
});

test('database.rules.json: badge okuma giriş yapmış herkese, yazma kimseye (sadece sunucu)', () => {
  const rules = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')).rules;
  assert.deepEqual(rules.badge, { '.read': 'auth != null', '.write': false });
});
