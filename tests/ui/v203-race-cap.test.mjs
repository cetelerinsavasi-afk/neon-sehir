// v203 — bahisli yarışta araba başına bahis sınırı (galeri vergisiz fiyatının 1/10'u).
// Çalıştır: node --test tests/ui/v203-race-cap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { raceBetCap, canRaceForBet } from '../../functions/raceBetCap.js';
import { VEHICLE_CATALOG } from '../../functions/catalogData.js';
import { CAR_IDS } from '../../functions/vehicleKinds.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('Üstün Cabrio → 100.000; Klasik Tur Arabası → 300 (fiyat/10)', () => {
  assert.equal(raceBetCap(10), 100_000);
  assert.equal(raceBetCap('10'), 100_000);
  assert.equal(raceBetCap(1), 300);
  assert.equal(raceBetCap(6), 25_000);
});

test('her araba: sınır = vergisiz galeri fiyatı / 10', () => {
  for (const id of CAR_IDS) assert.equal(raceBetCap(id), Math.floor(VEHICLE_CATALOG[id].price / 10), `katalog ${id}`);
});

test('ticari araç / motor / bilinmeyen → 0 (bahisli yarışa giremez)', () => {
  for (const id of [11, 13, 21, 25, 27, 999, null, undefined, 'x']) assert.equal(raceBetCap(id), 0, String(id));
});

test('canRaceForBet: kurucu kendi sınırına kadar; katılan sınırı bahse yeten arabayla', () => {
  assert.equal(canRaceForBet(10, 100_000), true);
  assert.equal(canRaceForBet(10, 100_001), false);
  assert.equal(canRaceForBet(1, 300), true);
  assert.equal(canRaceForBet(1, 301), false); // ucuz arabayla büyük odaya katılamaz
  assert.equal(canRaceForBet(1, 0), false);
  assert.equal(canRaceForBet(13, 1), false);
});

test('sunucu: sabit 100.000 sınırı yok; oda kurma ve katılma araba sınırını kontrol eder', () => {
  const s = src('functions/index.js');
  assert.equal(/RACE_MAX_BET/.test(s), false);
  const create = s.slice(s.indexOf('export const createRaceRoom'), s.indexOf('export const cancelRaceRoom'));
  const join = s.slice(s.indexOf('export const joinRaceRoom'), s.indexOf('export const declineOpponent'));
  assert.match(create, /raceBetCapError\(vehicle, amount\)/);
  assert.match(join, /raceBetCapError\(vehicle, room\.betAmount\)/);
  // kontrol, altın düşülmeden ÖNCE (hata olursa hiçbir yazma yapılmaz)
  assert.ok(join.indexOf('raceBetCapError') < join.indexOf('increment(-room.betAmount)'));
  // ek Firestore okuması yok: oda kur/katıl içinde tx.get sayısı değişmedi
  assert.equal((create.match(/tx\.get\(/g) || []).length, 1);
  assert.equal((join.match(/tx\.get\(/g) || []).length, 2);
});

test('arayüz: sınır seçilen arabaya göre; katılımda yetmeyen arabalar kapalı', () => {
  const l = src('src/components/RaceTrackScreen/RaceLobby.jsx');
  assert.equal(/RACE_MAX_BET|100_000/.test(l), false);
  assert.match(l, /const carCap = myCar \? raceBetCap\(myCar\.catalogId\) : 0;/);
  assert.match(l, /minBet=\{joinRoom\.betAmount\}/);
});
