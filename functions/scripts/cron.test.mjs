// v138 — tek zamanlayıcı (cronTick): her iş eski sıklığında, doğru saatte çalışır mı?
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCron, parseSchedule } from '../cron.js';

const IST = (s) => Date.parse(`${s}+03:00`);
const runsInDay = (spec, day = '2026-11-02') => {
  const start = IST(`${day}T00:00:00`);
  const hits = [];
  for (let i = 0; i < 1440; i++) if (spec.due(start + i * 60_000)) hits.push(i);
  return hits;
};

test('aralıklı işler: dakikada/5 dk/10 dk/saatlik/2 saatlik/3 saatlik/günlük doğru sayıda', () => {
  assert.equal(runsInDay(parseSchedule('every 1 minutes')).length, 1440);
  assert.equal(runsInDay(parseSchedule('every 5 minutes', null, 2)).length, 288);
  assert.equal(runsInDay(parseSchedule('every 10 minutes', null, 3)).length, 144);
  assert.equal(runsInDay(parseSchedule('every 60 minutes', null, 4)).length, 24);
  assert.equal(runsInDay(parseSchedule('every 1 hours', 'Europe/Istanbul', 4)).length, 24);
  assert.equal(runsInDay(parseSchedule('every 2 hours', null, 1)).length, 12);
  assert.equal(runsInDay(parseSchedule('every 3 hours', null, 1)).length, 8);
  const daily = runsInDay(parseSchedule('every 24 hours', null, 5));
  assert.equal(daily.length, 1);
  assert.equal(Math.floor(daily[0] / 60), 4, 'günlük işler İstanbul 04:xx');
});

test('cron ifadeleri İstanbul saatiyle: 18:00, 19:00, xx:05, Pazartesi 04:40, 00:15–03:45', () => {
  assert.deepEqual(runsInDay(parseSchedule('0 18 * * *', 'Europe/Istanbul')), [18 * 60]);
  assert.deepEqual(runsInDay(parseSchedule('0 19 * * *', 'Europe/Istanbul')), [19 * 60]);
  assert.equal(runsInDay(parseSchedule('5 * * * *', 'Europe/Istanbul')).length, 24);
  assert.ok(runsInDay(parseSchedule('5 * * * *', 'Europe/Istanbul')).every((m) => m % 60 === 5));
  assert.deepEqual(runsInDay(parseSchedule('40 4 * * 1', 'Europe/Istanbul'), '2026-11-02'), [4 * 60 + 40], '2 Kas 2026 Pazartesi');
  assert.deepEqual(runsInDay(parseSchedule('40 4 * * 1', 'Europe/Istanbul'), '2026-11-03'), []);
  assert.deepEqual(runsInDay(parseSchedule('15,45 0-3 * * *', 'Europe/Istanbul')), [15, 45, 75, 105, 135, 165, 195, 225]);
});

test('tick: zamanı gelenleri çalıştırır, bir işin hatası diğerlerini durdurmaz', async () => {
  const cron = createCron();
  const ran = [];
  cron.register({ schedule: 'every 1 minutes' }, async () => ran.push('a'));
  cron.register({ schedule: 'every 1 minutes' }, async () => { throw new Error('x'); });
  cron.register({ schedule: '0 18 * * *', timeZone: 'Europe/Istanbul' }, async () => ran.push('futbol'));
  let r = await cron.tick(IST('2026-11-02T17:59:30'), { log: {} });
  assert.deepEqual(ran, ['a']);
  assert.equal(r.failed, 1);
  r = await cron.tick(IST('2026-11-02T18:00:02'), { log: {} });
  assert.deepEqual(ran, ['a', 'a', 'futbol']);
});

test('index.js: tüm onSchedule tanımları ayrıştırılabiliyor ve eski sıklıkta çalışıyor', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8') + fs.readFileSync(fileURLToPath(new URL('../gang/firebase.js', import.meta.url)), 'utf8');
  const re = /onSchedule\(\s*\{\s*schedule:\s*'([^']+)'(?:,\s*timeZone:\s*'([^']+)')?/g;
  const specs = [...src.matchAll(re)].map((m) => ({ schedule: m[1], timeZone: m[2] || null }));
  assert.ok(specs.length >= 24, `en az 24 iş bekleniyordu, ${specs.length}`);
  const cron = createCron();
  specs.forEach((s) => cron.register(s, async () => {}));
  const expect = (sch) => {
    let m = /^every (\d+) minutes?$/.exec(sch);
    if (m) return 1440 / Number(m[1]);
    m = /^every (\d+) hours?$/.exec(sch);
    if (m) return Math.max(1, 24 / Number(m[1]));
    return null;
  };
  cron.jobs.forEach((j) => {
    const n = runsInDay(j);
    const e = expect(j.schedule);
    if (e != null) assert.equal(n.length, e, j.schedule);
    else if (j.schedule === '40 4 * * 1') assert.equal(n.length, 1);
    else assert.ok(n.length >= 1, j.schedule);
  });
  assert.ok(!/onSchedule\(\{ schedule: '0 0 \* \* \*'/.test(src), 'dailyReset gerçek tetikleyici kalmalı');
});
