// =============================================================================
// PİST YERLEŞİM TASLAĞI (sadece harita) — Pist 2 prototipinin (functions/pist2Sim.js)
// dünyadaki yeri + ona giden köy yolu. Şimdilik SADECE mini harita / büyük haritada
// çizilir; 3D dünyada henüz pist yok. Haritadan kaldırmak için: PIST_PLAN.show = false.
//
// Yer: otoyol (batı), Akçay Vadisi köy yolu (doğu ve güney) ve Gölyaka arasındaki boş ova.
// Kuzeydeki tepe döngüsü yamaca, ana düzlük güneydeki düzlüğe denk gelir (pistin 18 m'lik
// yükseltisi arazinin doğal eğimiyle aynı yönde). Köy yolu, Gölyaka–Akçay Vadisi yolundan
// ayrılıp ana tribünün önündeki otoparka çıkar.
// =============================================================================
import { PIST } from '../../../../functions/pist2Sim.js';

export const PIST_PLAN = {
  show: false, // v164.2: canlida kapali (3D pist hazir olunca true)
  name: 'Neon Şehir Pisti',
  // pist yerel (x, z) → dünya: 180° döndür + ötele
  cx: 1210,
  cz: -700,
  rot: Math.PI,
};
const C = Math.cos(PIST_PLAN.rot);
const S = Math.sin(PIST_PLAN.rot);
export const pistToWorld = (lx, lz) => [PIST_PLAN.cx + lx * C - lz * S, PIST_PLAN.cz + lx * S + lz * C];

// Harita çizimi için hazır çokgenler / çizgiler (dünya koordinatı)
export function pistMapGeom() {
  const T = PIST;
  const N = T.N;
  const at = (i, lat) => pistToWorld(T.PT[i][0] + T.NRM[i][0] * lat, T.PT[i][1] + T.NRM[i][1] * lat);
  // başlangıç çizgisi
  const startLine = [at(T.START, -7), at(T.START, 7)];
  // tribün (ana düzlüğün dışı) ve pit binası (içi) — prototipteki yerleşimle aynı
  const cxL = T.PT.reduce((s2, p) => s2 + p[0], 0) / N;
  const czL = T.PT.reduce((s2, p) => s2 + p[1], 0) / N;
  const out = Math.sign((T.PT[30][0] - cxL) * T.NRM[30][0] + (T.PT[30][1] - czL) * T.NRM[30][1]) || 1;
  const rect = (i0, i1, lat0, lat1) => [at(i0, lat0), at(i1, lat0), at(i1, lat1), at(i0, lat1)];
  const stands = rect(2, 124, out * (T.BP[60] + 5), out * (T.BP[60] + 19));
  const pits = rect(32, 88, -out * (T.BM[60] + 11), -out * (T.BM[60] + 25));
  // otopark + giriş (tribünlerin arkası) ve köy yolu
  const park = rect(40, 84, out * (T.BP[60] + 24), out * (T.BP[60] + 54));
  const gate = at(62, out * (T.BP[60] + 54));
  const road = [
    [1215.6, -235.4], // Gölyaka – Akçay Vadisi köy yolu üstünde ayrılma noktası
    [1218, -256],
    [1232, -291],
    [1260, -323],
    [gate[0], gate[1]],
  ];
  const poi = { x: (park[0][0] + park[2][0]) / 2, z: (park[0][1] + park[2][1]) / 2 };
  const label = pistToWorld(0, 210); // kuzey (tepe) döngüsünün içi
  // dilimler (her biri dörtgen) — 8 şeklinde kesişme olduğu için tek çokgen değil, dilim dilim çizilir
  const segs = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const q = (li, lj) => [at(i, li(i)), at(j, li(j)), at(j, -lj(j)), at(i, -lj(i))];
    segs.push({ ground: q((k) => T.BP[k] + 0.4, (k) => T.BM[k] + 0.4), asphalt: q(() => 7, () => 7), bridge: T.BRIDGE[i] === 1 || T.BRIDGE[j] === 1 });
  }
  return { segs, startLine, stands, pits, park, road, poi, label: { x: label[0], z: label[1] } };
}
