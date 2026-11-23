// v188 — istemci "kaç kişi var" sayıları: Firestore yedek yolları kaldırıldı (stats/presence
// dinleyicisi ve 30 sn'lik 400 belgelik yoklama). Sayılar sadece RTDB'den (occ).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../../src/hooks/usePolledPresence.js', import.meta.url), 'utf8');
const code = hook.replace(/\/\/.*$/gm, '');

test('istemci kancası Firestore kullanmaz', () => {
  assert.doesNotMatch(code, /firebase\/firestore/);
  assert.doesNotMatch(code, /getDocs|onSnapshot|collection\(|'stats'/);
  assert.doesNotMatch(code, /setInterval/);
  assert.match(code, /useOccCounts/);
});

test('başka hiçbir istemci dosyası stats/presence okumaz', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(f)) {
        const s = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '');
        if (/doc\(\s*db\s*,\s*'stats'\s*,\s*'presence'\s*\)|'stats\/presence'/.test(s)) hits.push(p);
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});
