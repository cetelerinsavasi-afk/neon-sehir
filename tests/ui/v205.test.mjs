// v205 — futbol: maç saati dışında okuma yok, stadyuma kadar hafif dinleyiciler (kaynak + saat kontrolleri)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');

// futbolSmartQuery'deki saat kuralının aynısı (17:55–19:30 İstanbul canlı)
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });
const minuteOf = (iso) => {
  const [h, m] = fmt.format(new Date(iso)).split(':').map(Number);
  return (h % 24) * 60 + m;
};

test('canlı pencere 17:55–19:30 (İstanbul)', () => {
  const s = code('src/lib/futbolSmartQuery.js');
  assert.match(s, /LIVE_FROM = 17 \* 60 \+ 55/);
  assert.match(s, /LIVE_TO = 19 \* 60 \+ 30/);
  const live = (iso) => {
    const m = minuteOf(iso);
    return m >= 17 * 60 + 55 && m < 19 * 60 + 30;
  };
  assert.equal(live('2026-11-26T14:54:00Z'), false); // 17:54
  assert.equal(live('2026-11-26T14:55:00Z'), true); // 17:55
  assert.equal(live("2026-11-26T16:29:00Z"), true); // 19:29
  assert.equal(live("2026-11-26T16:30:00Z"), false); // 19:30
});

test('fikstür, kupa maçları ve istatistik tablosu akıllı okuma kullanır', () => {
  assert.match(code('src/hooks/useFutbolMatches.js'), /useFutbolSmartQuery\(key/);
  assert.doesNotMatch(code('src/hooks/useFutbolMatches.js'), /onSnapshot/);
  assert.match(code('src/hooks/useFutbolCup.js'), /useFutbolSmartQuery\(season \? `fcm:/);
  assert.match(code('src/hooks/useFutbolPro.js'), /useFutbolSmartQuery\(season && b/);
  const s = code('src/lib/futbolSmartQuery.js');
  assert.match(s, /getDocsFromCache\(q\)/);
  assert.match(s, /c\.size >= mark\.n/);
});

test('ana sayfa hatırlatmaları futbolu canlı dinlemez', () => {
  const o = code('src/hooks/useOnboarding.js');
  assert.doesNotMatch(o, /useMyFutbolTeam\(\)/);
  assert.match(o, /useMyFutbolTeamLite\(\)/);
  const b = code('src/hooks/useBizReminders.js');
  assert.doesNotMatch(b, /useFootballer\(/);
  assert.match(b, /useMyFootballerTeamLite\(\)/);
  assert.match(code('src/components/FutbolScreen/FutbolFullScreen.jsx'), /refreshFutbolLite\(\)/);
});
