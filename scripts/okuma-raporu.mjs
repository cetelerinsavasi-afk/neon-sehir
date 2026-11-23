#!/usr/bin/env node
// =============================================================================
// v187 — Firestore okuma ölçümü raporu
//
// Cloud Logging'deki ns_read_stats kayıtlarını (bkz. functions/readStats.js, src/lib/fsMeter)
// indirir, dinleyici/sorgu başına toplar ve "en çok okuma yapan" listesini çıkarır.
// Veritabanına HİÇBİR şey yapmaz; sadece log okur.
//
// Kullanım (neon-sehir klasöründe):
//   node scripts/okuma-raporu.mjs                 → son 3 günün kayıtları
//   node scripts/okuma-raporu.mjs --gun 1         → son 1 gün
//   node scripts/okuma-raporu.mjs --dosya log.json → önceden indirilmiş gcloud JSON çıktısından
//   node scripts/okuma-raporu.mjs --ilk 50        → listede 50 satır (varsayılan 30)
// Gerekenler: gcloud kurulu ve `gcloud auth login` yapılmış olmalı (proje: neon-sehir).
// Çıktı: ekranda tablo + aynı klasöre okuma-raporu.csv
// =============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : def;
};
const PROJECT = opt('proje', 'neon-sehir');
const DAYS = Math.max(0.05, Number(opt('gun', 3)) || 3);
const TOP = Math.max(1, Number(opt('ilk', 30)) || 30);
const FILE = opt('dosya', null);

function download() {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const filter = `jsonPayload.ns_read_stats=1 AND timestamp>="${since}"`;
  console.log(`Cloud Logging'den indiriliyor (proje ${PROJECT}, ${since} sonrası)...`);
  const r = spawnSync('gcloud', ['logging', 'read', filter, `--project=${PROJECT}`, '--format=json', '--limit=200000'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    shell: process.platform === 'win32', // Windows'ta gcloud bir .cmd dosyası
  });
  if (r.error || r.status !== 0) {
    console.error('gcloud çalışmadı:', r.error?.message || r.stderr || `çıkış kodu ${r.status}`);
    console.error("gcloud kurulu mu? Önce: gcloud auth login  ve  gcloud config set project neon-sehir");
    process.exit(1);
  }
  return r.stdout;
}

export function aggregate(entries) {
  const byLabel = new Map();
  const sessions = new Set();
  let visMs = 0;
  let rows = 0;
  const versions = {};
  let first = null;
  let last = null;
  for (const e of entries) {
    const p = e?.jsonPayload;
    if (!p || p.ns_read_stats !== 1 || !p.b) continue;
    rows += 1;
    const rate = Number(p.rate) > 0 ? Number(p.rate) : 0.1;
    sessions.add(p.sid);
    visMs += Number(p.vis) || 0;
    versions[p.v] = (versions[p.v] || 0) + 1;
    const ts = e.timestamp || null;
    if (ts && (!first || ts < first)) first = ts;
    if (ts && (!last || ts > last)) last = ts;
    for (const [label, v] of Object.entries(p.b)) {
      if (!Array.isArray(v)) continue;
      const a = byLabel.get(label) || { label, kesin: 0, olasi: 0, olay: 0, abone: 0, tahmin: 0, oturum: new Set() };
      a.kesin += Number(v[0]) || 0;
      a.olasi += Number(v[1]) || 0;
      a.olay += Number(v[2]) || 0;
      a.abone += Number(v[3]) || 0;
      a.tahmin += (Number(v[0]) || 0) / rate; // örneklemeden tüm oyunculara ölçek
      a.oturum.add(p.sid);
      byLabel.set(label, a);
    }
  }
  const list = [...byLabel.values()].sort((x, y) => y.kesin - x.kesin);
  const total = list.reduce((s, a) => s + a.kesin, 0);
  return { list, total, rows, sessions: sessions.size, visHours: visMs / 3_600_000, versions, first, last };
}

const fmt = (n) => Math.round(n).toLocaleString('tr-TR');

function main() {
  const raw = FILE ? readFileSync(FILE, 'utf8') : download();
  let entries;
  try {
    entries = JSON.parse(raw || '[]');
  } catch {
    console.error('Log çıktısı JSON değil. --format=json ile indirilmiş olmalı.');
    process.exit(1);
  }
  const r = aggregate(entries);
  if (!r.rows) {
    console.log('\nHiç ns_read_stats kaydı yok.');
    console.log('Olası nedenler: v187 henüz yayında değil / oyuncu girmedi / ölçüm bitti (READ_STATS_END) /');
    console.log('public/neon-flags.json içinde "readStats": true değil / clientReadStats fonksiyonu yüklenmemiş.');
    return;
  }
  console.log(`\n${r.rows} özet · ${r.sessions} örneklenen oturum · ${r.visHours.toFixed(1)} görünür saat · ${r.first} → ${r.last}`);
  console.log(`Sürümler: ${Object.entries(r.versions).map(([v, n]) => `v${v}: ${n}`).join(', ')}`);
  console.log(`Örneklenen oturumlarda toplam kesin okuma: ${fmt(r.total)} (tüm oyunculara tahmini ≈ ${fmt(r.list.reduce((s, a) => s + a.tahmin, 0))})\n`);
  const head = ['#', 'Pay', 'Kesin okuma', 'Tahmini (tümü)', 'Olası', 'Okuma/saat', 'Oturum', 'Dinleyici / sorgu'];
  console.log(head.join('\t'));
  r.list.slice(0, TOP).forEach((a, i) => {
    const perHour = r.visHours > 0 ? a.kesin / r.visHours : 0;
    console.log([i + 1, `%${((a.kesin / (r.total || 1)) * 100).toFixed(1)}`, fmt(a.kesin), fmt(a.tahmin), fmt(a.olasi), perHour.toFixed(1), a.oturum.size, a.label].join('\t'));
  });
  const csv = [['sira', 'pay_yuzde', 'kesin', 'tahmini_tumu', 'olasi', 'okuma_saat', 'oturum', 'olay', 'etiket'].join(';')];
  r.list.forEach((a, i) => {
    const perHour = r.visHours > 0 ? a.kesin / r.visHours : 0;
    csv.push([i + 1, ((a.kesin / (r.total || 1)) * 100).toFixed(2), a.kesin, Math.round(a.tahmin), a.olasi, perHour.toFixed(2), a.oturum.size, a.olay, `"${a.label.replace(/"/g, '""')}"`].join(';'));
  });
  writeFileSync('okuma-raporu.csv', '﻿' + csv.join('\n'), 'utf8');
  console.log('\nTam liste: okuma-raporu.csv (Excel ile açılır)');
  console.log('Okuma/saat = bir oyuncunun oyunu 1 saat önde açık tutmasıyla o dinleyicinin yaptığı ortalama okuma.');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('okuma-raporu.mjs')) main();
