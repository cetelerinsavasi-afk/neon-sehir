// =============================================================================
// v219 — GÖRÜNÜM DÜKKÂNLARI: Berber, Butik (giyim), Aksesuarcı, Kostümcü.
// Avatar artık profilden değil bu dört dükkânda düzenlenir. Dükkânlar sıradan blokların
// (cityLayout CELL_LOTS: 5,3 ve 5,4) caddeye bakan zemin katındadır; kulenin önünde 6,2 m
// derinliğinde açık bir oyuk (buildings.js buildFiller → hole). İçeri girince 'avshop' bölgesi
// panel açar (CityScreen → AvatarShopPanel). Prototipten (harita_duzeni5) aktarıldı.
// =============================================================================
import * as THREE from 'three';
import { M, glowMat } from '../kit.js';

export const AV_SHOPS = {
  berber: { t: 'BERBER', c: '#c8141e', c2: '#1d3d8a', ic: '💈', npc: 'Berber Rıza Usta' },
  giyim: { t: 'BUTİK · GİYİM', c: '#1f6fd0', c2: '#e8e6df', ic: '👕', npc: 'Tezgâhtar Melis' },
  aksesuar: { t: 'TAKI & ŞAPKA', c: '#d4af37', c2: '#1b1d22', ic: '💍', npc: 'Kuyumcu Ozan' }, // v219: eski "Aksesuar"
  kostum: { t: 'KOSTÜMCÜ', c: '#7a2ad0', c2: '#ff2d8a', ic: '🎭', npc: 'Kostümcü Lale' },
  petshop: { t: 'PETSHOP', c: '#2fb35a', c2: '#f4e7c8', ic: '🐾', npc: 'Hayvansever Nur' }, // v219: evcil hayvanlar
  ozel: { t: 'AKSESUARCI', c: '#22d3ee', c2: '#14102a', ic: '✨', npc: 'Tasarımcı Defne' }, // v219: taç, kanat, aura…
};

// caddeye bakan (derin) dükkân hücrelerine soldan sağa dükkân atar
export function assignShops(plan, shops) {
  const fr = plan.filter((c) => c.front && c.front.street && c.td > 8).sort((a, b) => a.x - b.x);
  shops.forEach((s, i) => {
    const c = fr[i];
    if (!c) return;
    c.avShop = s;
    c.front.w = Math.min(c.tw - 1.2, 7.2);
  });
}

let poleTex = null;
function berberPoleTex() {
  if (poleTex) return poleTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 128);
  g.lineWidth = 12;
  [['#c8141e', 0], ['#1d3d8a', 32]].forEach(([col, o]) => {
    g.strokeStyle = col;
    for (let y = -128; y < 256; y += 64) {
      g.beginPath();
      g.moveTo(-10, y + o);
      g.lineTo(74, y + o + 50);
      g.stroke();
    }
  });
  poleTex = new THREE.CanvasTexture(c);
  poleTex.wrapS = poleTex.wrapT = THREE.RepeatWrapping;
  poleTex.colorSpace = THREE.SRGBColorSpace;
  return poleTex;
}

// c: buildFiller plan hücresi (x, z, tw, td, front{x,w}, avShop)
export function shopFront(e, c) {
  const K = c.avShop;
  const D = AV_SHOPS[K];
  const w = c.front.w;
  const x = c.front.x;
  const zf = c.z + c.td / 2;
  const dep = 6.2;
  const z0 = zf - dep;
  const cz = (zf + z0) / 2;
  const hw = w / 2;
  const H = 3.4;
  const dk = M('#1b1d22', 0.6, 0.3);
  // zemin + iç cephe
  e.box(w, 0.16, dep, M('#e9e4da', 0.35), x, 0, cz, { cast: false });
  e.box(w - 0.3, 0.02, dep - 0.3, M(K === 'berber' ? '#f4f4f2' : '#d9cbb4', 0.4), x, 0.16, cz, { cast: false });
  if (K === 'berber') {
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 8; j++)
        if ((i + j) % 2) e.box(w / 10 - 0.02, 0.005, (dep - 0.3) / 8 - 0.02, M('#14161b', 0.4), x - hw + 0.15 + ((i + 0.5) * (w - 0.3)) / 10, 0.18, z0 + 0.15 + ((j + 0.5) * (dep - 0.3)) / 8, { cast: false });
  }
  e.box(w - 0.1, H - 0.2, 0.06, M(D.c2, 0.6), x, 0.16, z0 + 0.06);
  for (const s of [-1, 1]) e.box(0.06, H - 0.2, dep, M('#f4efe6', 0.7), x + s * (hw - 0.06), 0.16, cz);
  e.box(w, 0.08, dep, M('#f4efe6', 0.6), x, H - 0.1, cz);
  for (const s of [-0.3, 0.3]) e.box(0.08, 0.04, dep - 1, glowMat('#fff4e6', 2.6), x + s * w, H - 0.16, cz, { cast: false });
  e.box(w - 0.4, 0.05, 0.05, glowMat(D.c, 2.4), x, H - 0.3, z0 + 0.12, { cast: false });
  for (const s of [-1, 1]) e.box(0.18, H, 0.22, dk, x + s * (hw - 0.09), 0, zf - 0.11);
  e.box(w, 0.5, 0.22, dk, x, H - 0.5, zf - 0.11);
  // v220: tabela bozuk görünüyordu (cepheye 2 cm, kuşağın dışına taşan saydam yazı → titreme / kesik).
  // Artık kuşağın önünde, koyu zeminli, kuşağa sığan bir pano; yazı dükkân enini aşmaz.
  {
    const sg = e.sign(`shop2_${K}`, `${D.ic} ${D.t}`, 0.44, x, H - 0.25, zf + 0.14, 0, { color: '#ffffff', bg: '#14161b', border: D.c, font: '900 110px Arial, sans-serif', light: false, opaque: true }); // v221: opak pano (saydam sıralamada camların arkasında kalıp kesik görünüyordu)
    const sw = sg.userData.signW || 1;
    if (sw > w - 0.6) sg.scale.set((w - 0.6) / sw, (w - 0.6) / sw, 1);
    e.box(Math.min(w - 0.3, sw * sg.scale.x + 0.2), 0.04, 0.05, glowMat(D.c, 2.2), x, H - 0.03, zf + 0.06, { cast: false });
  }
  if (K === 'berber') {
    e.cyl(0.12, 0.12, 1.4, new THREE.MeshStandardMaterial({ map: berberPoleTex(), roughness: 0.3 }), x + hw + 0.35, 1, zf + 0.15, 16);
    e.cyl(0.16, 0.16, 0.12, M('#d9dde3', 0.2, 0.9), x + hw + 0.35, 0.88, zf + 0.15, 16);
    e.cyl(0.16, 0.16, 0.12, M('#d9dde3', 0.2, 0.9), x + hw + 0.35, 2.4, zf + 0.15, 16);
    for (const q of [-1, 1]) {
      const bx = x + q * 1.5;
      e.box(0.6, 0.45, 0.6, M('#c8141e', 0.5), bx, 0.16 + 0.25, z0 + 1.6);
      e.box(0.6, 0.7, 0.12, M('#c8141e', 0.5), bx, 0.16 + 0.7, z0 + 1.95);
      e.cyl(0.22, 0.3, 0.25, M('#d9dde3', 0.2, 0.9), bx, 0.16, z0 + 1.6, 14);
      e.box(1.1, 0.9, 0.04, M('#cfe8f5', 0.05, 0.6), bx, 1.2, z0 + 0.12);
      e.box(1.0, 0.06, 0.3, M('#f4f4f2', 0.3), bx, 1.0, z0 + 0.3);
    }
    e.item('plantb', x - hw + 0.5, zf - 1, 0, 0, { y: 0.16 });
    e.box(0.5, 0.45, 1.8, M('#5c3a21', 0.7), x + hw - 0.45, 0.16, cz + 0.8);
  } else if (K === 'giyim') {
    const cols = ['#1f6fd0', '#c8141e', '#e8e6df', '#1d5c3a', '#ffd23f', '#4a1d5c', '#ff7a1a', '#22262f'];
    for (const q of [-1, 1]) {
      e.box(0.04, 0.04, 2.6, M('#d9dde3', 0.2, 0.9), x + q * (hw - 0.7), 1.7, z0 + 2.4);
      for (let i = 0; i < 8; i++) e.box(0.42, 0.7, 0.06, M(cols[i], 0.8), x + q * (hw - 0.7), 0.98, z0 + 1.25 + i * 0.33);
    }
    e.item('mannequin', x - 0.9, zf - 1.6, 0, 0, { y: 0.16 });
    e.item('mannequin', x + 0.9, zf - 1.6, 0, 0, { y: 0.16 });
    e.box(2, 0.9, 0.6, M('#e9e4da', 0.4), x, 0.16, z0 + 1);
    ['#0d0d0d', '#e8e6df', '#7a1f2b', '#1d3d5c', '#3a2f1d'].forEach((col, i) => e.box(0.32, 0.12, 0.24, M(col, 0.6), x - 0.8 + i * 0.4, 1.08, z0 + 1));
    e.box(0.7, 1.9, 0.05, M('#cfe8f5', 0.05, 0.6), x + hw - 0.1, 0.3, cz, { ry: Math.PI / 2 });
  } else if (K === 'aksesuar') {
    for (const q of [-1, 1]) {
      e.box(0.5, 1, 2.4, M('#e9edf2', 0.2), x + q * (hw - 0.5), 0.16, cz - 0.3);
      const gc = e.box(0.48, 0.35, 2.38, new THREE.MeshStandardMaterial({ color: '#cfe8f5', roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }), x + q * (hw - 0.5), 1.16, cz - 0.3);
      gc.renderOrder = 5;
      for (let i = 0; i < 6; i++) e.mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12), M(i % 2 ? '#d4af37' : '#c0c4cc', 0.2, 0.9), x + q * (hw - 0.5), 1.24, cz - 1.3 + i * 0.4, 0, { rx: Math.PI / 2 });
    }
    ['#0d0d0d', '#3a2f1d', '#5c1a24', '#d4af37', '#1d3d5c'].forEach((col, i) => {
      e.box(0.5, 0.05, 0.25, dk, x - 1.2 + i * 0.6, 1.5, z0 + 0.25);
      e.box(0.36, 0.2, 0.36, M(col, 0.6), x - 1.2 + i * 0.6, 1.55, z0 + 0.25);
      e.box(0.3, 0.06, 0.12, M('#111', 0.3), x - 1.2 + i * 0.6, 1.15, z0 + 0.25);
    });
    e.box(1.6, 1, 0.6, dk, x, 0.16, z0 + 1.6);
    e.box(1.64, 0.04, 0.64, M('#d4af37', 0.25, 0.9), x, 1.16, z0 + 1.6);
  } else if (K === 'petshop') {
    // v219: akvaryum duvarı, kafes rafları, mama çuvalları, tezgâh
    e.item('aquarium', x, z0 + 0.45, 0, 0, { y: 0.16 });
    const cage = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
    for (const q of [-1, 1]) {
      e.box(0.7, 0.05, 2.6, M('#8a6a45', 0.7), x + q * (hw - 0.45), 0.9, cz - 0.2);
      e.box(0.7, 0.05, 2.6, M('#8a6a45', 0.7), x + q * (hw - 0.45), 1.7, cz - 0.2);
      for (let i = 0; i < 3; i++)
        for (const y of [0.95, 1.75]) {
          const b = e.box(0.55, 0.5, 0.6, cage, x + q * (hw - 0.45), y, cz - 1.1 + i * 0.9);
          b.renderOrder = 5;
        }
    }
    ['#c9a25a', '#7a4a2a', '#2fb35a'].forEach((col, i) => e.box(0.45, 0.6, 0.3, M(col, 0.8), x - 1.6 + i * 0.5, 0.16, zf - 0.9));
    e.box(1.6, 1, 0.6, M('#f4e7c8', 0.6), x + 1, 0.16, zf - 2.2);
    e.box(1.64, 0.04, 0.64, M('#2fb35a', 0.4), x + 1, 1.16, zf - 2.2);
  } else if (K === 'ozel') {
    // v219: cam vitrinler + parlayan kaideler (taç, kanat, aura)
    for (let i = 0; i < 3; i++) {
      const px = x - 1.8 + i * 1.8;
      e.cyl(0.35, 0.4, 0.9, M('#14102a', 0.3, 0.4), px, 0.16, z0 + 1.1, 18);
      e.cyl(0.36, 0.36, 0.04, glowMat(['#22d3ee', '#b44cff', '#ffd23f'][i], 2.2), px, 1.06, z0 + 1.1, 18);
      const g = e.box(0.62, 0.7, 0.62, new THREE.MeshStandardMaterial({ color: '#cfe8f5', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }), px, 1.08, z0 + 1.1);
      g.renderOrder = 5;
      e.mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), M(['#d4af37', '#f4f4f2', '#ff6a1a'][i], 0.2, 0.9), px, 1.4, z0 + 1.1, 0);
    }
    for (const q of [-1, 1]) e.box(0.06, 1.6, 2.4, glowMat(q < 0 ? '#22d3ee' : '#b44cff', 1.2), x + q * (hw - 0.1), 0.8, cz - 0.3, { cast: false });
    e.box(1.6, 1, 0.6, M('#14102a', 0.4), x, 0.16, zf - 2.2);
    e.box(1.64, 0.04, 0.64, M('#22d3ee', 0.2, 0.6), x, 1.16, zf - 2.2);
  } else {
    for (let i = 0; i < 3; i++) e.item('mannequin', x - 1.6 + i * 1.6, z0 + 1.2, 0, 0, { y: 0.16 });
    const cols = ['#7a2ad0', '#ff2d8a', '#19e8ff', '#ffd23f', '#1d5c3a', '#c8141e', '#14161b'];
    for (const q of [-1, 1]) {
      e.box(0.04, 0.04, 2.6, M('#d9dde3', 0.2, 0.9), x + q * (hw - 0.6), 1.7, cz + 0.6);
      for (let i = 0; i < 7; i++) e.box(0.44, 1.1, 0.08, M(cols[i], 0.6), x + q * (hw - 0.6), 0.6, cz - 0.4 + i * 0.33);
    }
    ['#f4f4f2', '#ffd23f', '#ff2d8a', '#19e8ff', '#39ff88', '#ff7a1a'].forEach((col, i) => e.mesh(new THREE.SphereGeometry(0.14, 10, 8), M(col, 0.5), x - 1.25 + i * 0.5, 2.5, z0 + 0.1, 0, { cast: false }));
  }
  // tezgâhtar (v219: ayakta, tezgâhın arkasında — sandalye yok)
  e.npcs.push({
    id: `npc_shop_${K}`,
    x: x + (K === 'berber' ? 1.5 : K === 'petshop' ? 1 : 0),
    z: K === 'berber' ? z0 + 2.6 : K === 'petshop' || K === 'ozel' ? zf - 2.85 : z0 + 0.75, // v219: tezgâhın arkası
    name: D.npc,
    av: { clothing: K === 'berber' ? 'vest' : 'suit', clothColor: D.c, pantsColor: '#22262f' },
    lines: ['Hoş geldin! Beğendiğini dene, sonra al.', 'Beğendiğin bir şey var mı?'],
    stand: true, // müşteri koltuğuna oturmaz
  });
  e.light(x, H - 0.6, cz, '#fff1d6', 5, 9);
  // içerisi: görünüm paneli açılır
  e.zone({ x, z: cz, r: Math.min(hw, dep / 2) + 0.4, kind: 'avshop', shop: K, title: `${D.ic} ${D.t}`, y: 0.16 });
}
