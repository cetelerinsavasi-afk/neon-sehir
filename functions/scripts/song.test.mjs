// v92 — Sixtagram "Şarkı Yap" veri doğrulaması
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSong, emptySong, songDurationSec, SONG_SLOTS } from '../songData.js';

test('boş şarkı paylaşılamaz; dolu şarkı temizlenir', () => {
  const s = emptySong();
  assert.match(sanitizeSong(s).error, /Boş şarkı/);
  s.pats[0].d[0] = 0b1000100010001;
  s.pats[1].t[2][3] = 65535;
  s.title = '  Gece \u0007Yolu  ';
  const r = sanitizeSong(s);
  assert.ok(!r.error, r.error);
  assert.equal(r.song.title, 'Gece Yolu');
  assert.equal(r.song.type, 'song');
  assert.equal(r.song.pats[1].t[2][3], 65535);
});

test('geçersiz alanlar reddedilir', () => {
  const ok = emptySong();
  ok.pats[0].d[0] = 1;
  const bad = (patch) => sanitizeSong({ ...JSON.parse(JSON.stringify(ok)), ...patch }).error;
  assert.ok(bad({ bpm: 300 }));
  assert.ok(bad({ kit: '__proto__' }));
  assert.ok(bad({ scale: 'yok' }));
  assert.ok(bad({ key: 12 }));
  assert.ok(bad({ mode: 'x' }));
  assert.ok(bad({ cp: 4 }));
  assert.ok(bad({ song: [5, ...Array(SONG_SLOTS - 1).fill(-1)] }));
  assert.ok(bad({ tr: [{ i: 'piyano', v: 80 }] }));
  assert.ok(bad({ pats: [{ d: [70000, 0, 0, 0, 0, 0, 0], t: [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]] }, ...ok.pats.slice(1)] }));
});

test('şarkı modunda sıra boşsa bölüm moduna döner; süre hesaplanır', () => {
  const s = emptySong();
  s.pats[0].d[0] = 1;
  s.mode = 'song';
  const r = sanitizeSong(s);
  assert.equal(r.song.mode, 'pattern');
  assert.ok(Math.abs(songDurationSec(r.song) - 4 * 16 * (60 / 100 / 4)) < 1e-9);
  s.song[0] = 0;
  s.song[2] = 0;
  const r2 = sanitizeSong(s);
  assert.equal(r2.song.mode, 'song');
  assert.ok(Math.abs(songDurationSec(r2.song) - 3 * 16 * 0.15) < 1e-9);
});

test('bölüm modunda seçili bölüm boşsa ilk dolu bölüme geçilir', () => {
  const s = emptySong();
  s.pats[2].d[1] = 3;
  s.cp = 1;
  assert.equal(sanitizeSong(s).song.cp, 2);
});

test('v105: paylaşım modu aranjeye göre; boş bölümlü sıra → bölüm modu; varsayılan ölçek minör', async () => {
  const { emptySong: es, sanitizeSong: san, shareModeOf: smo } = await import('../songData.js');
  const s = es();
  assert.equal(s.scale, 'minor');
  s.pats[0].d[0] = 1; // A dolu
  s.pats[1].d[0] = 4; // B dolu
  // sıra yok → bölüm (mod düğmesi 'song' olsa bile)
  s.mode = 'song';
  assert.equal(san(s).song.mode, 'pattern');
  // A B A → şarkı (mod düğmesi 'pattern' olsa bile)
  s.mode = 'pattern';
  s.song[0] = 0; s.song[1] = 1; s.song[2] = 0;
  assert.equal(san(s).song.mode, 'song');
  // sırada boş C → bölüm modu
  s.song[3] = 2;
  const r = smo(s);
  assert.equal(r.mode, 'pattern');
  assert.deepEqual(r.emptyLetters, ['C']);
  assert.equal(san(s).song.mode, 'pattern');
  // proje taslağı (allowEmpty) seçilen modu korur
  s.mode = 'song';
  assert.equal(san(s, true).song.mode, 'song');
});
