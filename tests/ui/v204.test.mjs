// v204 — Firestore maliyeti + spor salonu mini oyun boyutu + banyo renkleri (kaynak kontrolleri)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).replace(/\/\/.*$/gm, '');

test('soygun panosu sadece açık planları okur (status sorguda)', () => {
  assert.match(code('src/hooks/useOpenHeistPlans.js'), /where\('target', '==', target\), where\('status', '==', 'open'\)/);
});

test('Neon Şehir sohbeti 10 mesajla açılır, eskiler sayfa sayfa gelir', () => {
  const s = code('src/hooks/useGlobalChat.js');
  assert.match(s, /FIRST_PAGE = 10\b/);
  assert.match(s, /startAfter\(oldest\.createdAt\)/);
  assert.match(s, /limit\(OLDER_PAGE\)/);
  const g = code('src/components/ChatsAppScreen/GroupChat.jsx');
  assert.match(g, /loadOlder/);
  assert.match(g, /ca-load-older/);
});

test('birebir sohbet 20 mesajla açılır (eskiden 150)', () => {
  const s = code('src/components/ChatsAppScreen/DmChat.jsx');
  assert.match(s, /DM_FIRST = 20\b/);
  assert.doesNotMatch(s, /limit\(150\)/);
});

test('ana sayfa hatırlatması makineleri canlı dinlemez', () => {
  const s = code('src/hooks/useOnboarding.js');
  assert.doesNotMatch(s, /useMyFactory\(\)/);
  assert.match(s, /useMyFactoryRunNeeded\(todayKey\)/);
  assert.match(code('src/hooks/useMyFactory.js'), /getCountFromServer/);
});

test('sunucu: minTrig yazılır, kredi/fabrika değeri makineleri saymakla hesaplanır', () => {
  const s = code('functions/index.js');
  assert.match(s, /async function markMiningRan/);
  assert.match(s, /minTrig: admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(s, /async function countMachinesByType/);
  const credit = s.slice(s.indexOf('async function computeCreditScore'), s.indexOf('export const getCreditInfo'));
  assert.doesNotMatch(credit, /collection\('machines'\)\.get\(\)/);
});

test('spor salonu mini oyunu geniş katmanda açılır', () => {
  const s = code('src/components/Venue3D/venueGameParts.jsx');
  assert.match(s, /<Layer wide onClose=\{\(\) => setGame\(null\)\}>/);
  assert.match(s, /Workshop\/Workshop\.css/);
});

test('banyo: lavabo ve küvette altın sarısı yok (mat siyah)', () => {
  const s = code('src/components/HouseScreen/houseCatalog.js');
  for (const [a, b] of [
    ['function sinkBath(', 'function shower('],
    ['function bathtub(', 'function jacuzzi('],
  ]) {
    const body = s.slice(s.indexOf(a), s.indexOf(b));
    assert.doesNotMatch(body, /GOLD\(\)/, a);
    assert.match(body, /BLACKH\(\)/, a);
  }
});
