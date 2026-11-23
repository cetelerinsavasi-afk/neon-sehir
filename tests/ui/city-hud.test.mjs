// v194 — sade şehir ana ekranı (CityScreen.jsx + City.css + NearbyPlayersButton.jsx). Kaynak kodu
// üzerinden denetler (tarayıcı gerekmez). Çalıştır: node --test tests/ui/city-hud.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
// yorumlar çıkarılır (eski adlar yorumlarda geçebilir)
const code = (p) => src(p).replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const city = code('components/City/CityScreen.jsx');
const css = code('components/City/City.css');
const nearby = code('components/NearbyPlayers/NearbyPlayersButton.jsx');

test('1) şüphe + altın tek hap: susCls rengi, altın sarı, dokununca Zümrüt Mağazası, "+" yok', () => {
  assert.doesNotMatch(city, /v3-badge v3-sus/, 'eski ayrı şüphe rozeti kalktı');
  assert.doesNotMatch(city, /v3-badge cs-gold/, 'eski ayrı altın rozeti kalktı');
  const i = city.indexOf('cs-stat-pill ${susCls}');
  assert.ok(i > 0, 'hap susCls sınıfıyla');
  const pill = city.slice(i, city.indexOf('</button>', i));
  assert.match(pill, /setPanel\(\{ kind: 'phone', app: 'altin-magazasi' \}\)/);
  assert.match(pill, /cs-pill-sep/, 'arada ince ayraç');
  assert.match(pill, /🕵️ %\{sus\}/);
  assert.doesNotMatch(pill, />\s*\+\s*</, 'yanında + yok');
  assert.match(css, /\.cs-pill-gold \{[^}]*#ffd76a/);
  assert.match(css, /\.cs-stat-pill\.mid \.cs-pill-sus/);
  assert.match(css, /\.cs-stat-pill\.hi \.cs-pill-sus/);
});

test('2) Yakındakiler: sağ sütundaki 👥 kalktı, üst çubuktaki "N kişi yakında ›" açar', () => {
  const right = city.slice(city.indexOf('hs-side cs-right'), city.indexOf('v3-menu cs-lmenu'));
  assert.doesNotMatch(right, /NearbyPlayersButton/, 'sağ sütunda yok');
  assert.match(city, /const nearbyOthers = nearby\.map\(/, 'liste JSX dışında hesaplanır');
  assert.match(city, /others=\{nearbyOthers\}/);
  assert.match(city, /renderTrigger=\{\(open\) => \(/);
  assert.match(city, /👥 \{online \+ 1\} kişi yakında ›/);
  assert.match(city, /reportItem: text \? \{ label: 'Son mesajını bildir'/, 'son mesaj + bildir korunur');
  assert.match(nearby, /renderTrigger = null/);
  assert.match(nearby, /renderTrigger \? \(\s*renderTrigger\(\(\) => setOpen\(true\)\)/);
  assert.match(css, /\.cs-nearby-link \{[^}]*underline dotted/);
});

test('3) 3D/2D üst çubuktan kalktı, mini haritanın altında çip', () => {
  assert.doesNotMatch(city, /className="hs-view-btn" onClick=\{toggleView\}/);
  assert.match(city, /className="cs-mini-view" onClick=\{toggleView\}/);
  assert.ok(city.indexOf('cs-mini-view') > city.indexOf('className="cs-mini"'), 'mini haritanın hemen ardından');
  assert.match(css, /\.cs-mini-view \{[^}]*position: absolute/);
});

test('4) araba düğmesi: emoji değil çizim SVG (currentColor, 26px; yatayda 22px)', () => {
  const i = city.indexOf('hs-side-btn cs-carbtn');
  const btn = city.slice(i, city.indexOf('</button>', i));
  assert.doesNotMatch(btn, /🚗/);
  assert.match(btn, /<svg className="cs-car-ico"[^>]*stroke="currentColor"/);
  assert.match(css, /\.cs-carbtn \.cs-car-ico \{[^}]*width: 26px/);
  assert.match(css, /\.cs-land \.cs-carbtn \.cs-car-ico \{[^}]*width: 22px/);
});

test('5) kapalı sohbette son 2 mesaj', () => {
  assert.match(city, /\(chatOpen \? msgs : msgs\.slice\(-2\)\)/);
  assert.doesNotMatch(city, /msgs\.slice\(-3\)/);
});

test('dokunulmayanlar: kamera sağda, hareketler solda, 3 yıl önce, mekân düğmeleri sol üstte, alt sütun', () => {
  const right = city.slice(city.indexOf('hs-side cs-right'), city.indexOf('v3-menu cs-lmenu'));
  assert.match(right, /title="Fotoğraf çek">📷/);
  assert.match(right, /amca-flash-btn/);
  const left = city.slice(city.indexOf('className="cs-left"'), city.indexOf('hs-side cs-right'));
  assert.match(left, /title="Hareketler">😀/);
  assert.match(city, /className="v3-menu cs-lmenu" ref=\{lmenuRef\}/, '--cs-lmenu-b ölçümü');
  assert.match(city, /💰 Soygun yap/);
  assert.doesNotMatch(city, /daha fazla/, '"⋯ daha fazla" menüsü yok');
});

test('misafir: aynı düzen — sol üstte giriş hapı, üst çubukta yakındakiler / gezinti', () => {
  assert.match(city, /className="cs-stat-pill guest" onClick=\{\(\) => setAskSignIn\(true\)\}/);
  assert.match(city, /Misafir · gezinti/);
});
