// =============================================================================
// ŞEHİRLERARASI OTOBÜS (prototip): oyundaki otobüs modeli (12 · 'otobus') + firma kaplaması
// =============================================================================
import * as THREE from 'three';
import { buildVehicle } from '../vehicles.js';

const FIRMS = [
  { name: 'NEON TURİZM', paint: '#f4f4f2', accent: '#c8141e', fg: '#c8141e', stroke: '#ffffff' },
  { name: 'KERVAN SEYAHAT', paint: '#1d2a44', accent: '#e8b923', fg: '#e8b923', stroke: '#0a1020' },
  { name: 'ANADOLU EKSPRES', paint: '#2f8f4a', accent: '#f4f4f2', fg: '#ffffff', stroke: '#14381e' },
];
const texCache = new Map();
function sideTex(f) {
  if (texCache.has(f.name)) return texCache.get(f.name);
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 78px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = f.stroke;
  g.strokeText(f.name, 512, 68);
  g.fillStyle = f.fg;
  g.fillText(f.name, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(f.name, t);
  return t;
}
// firma: 0 Neon Turizm (oyuncunun otobüsü), 1-2 diğer firmalar (peronlarda park etmiş)
export function makeCoach(firm = 0, plate = '34 NT 156') {
  const f = FIRMS[firm % FIRMS.length];
  const v = buildVehicle(12, { variant: 'otobus', paint: f.paint, accent: f.accent, finish: 'parlak', sign: 'NEON ŞEHİR-KERVANKENT', plate });
  // yan yazı: belediye yerine firma adı
  v.root.traverse((o) => {
    const p = o.geometry?.parameters;
    if (o.isMesh && p && Math.abs(p.width - 4) < 0.01 && Math.abs(p.height - 0.4) < 0.01 && o.material?.map) {
      o.material = o.material.clone();
      o.material.map = sideTex(f);
    }
  });
  return v;
}
export const COACH_FIRMS = FIRMS;
