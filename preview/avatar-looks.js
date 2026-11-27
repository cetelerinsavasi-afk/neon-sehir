import * as THREE from 'three';
import { Avatar3D } from '../src/components/City/avatar3d.js';
import { getAvatarLook3D } from '../src/lib/avatar3dView.js';
import { buildFullAvatarSvgMarkup, buildFullAvatarBackSvgMarkup } from '../src/lib/avatarShapes.js';
import { LOOKS } from '../functions/cosmeticsData.js';
const q = new URLSearchParams(location.search);
const from = Number(q.get('from') || 0), n = Number(q.get('n') || 10);
const only = q.get('ids') ? q.get('ids').split(',') : null;
const gender = q.get('g') || 'erkek';
const list = (only ? only.map((id) => LOOKS.find((l) => l.id === id)) : LOOKS.slice(from, from + n)).filter(Boolean);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.outputColorSpace = THREE.SRGBColorSpace;
r.setSize(340, 420);
r.setClearColor('#161c2e');
const cam = new THREE.PerspectiveCamera(24, 340 / 420, 0.05, 30);
const box = document.getElementById('list');
(async () => {
  for (const L of list) {
    const av = { gender, look: L.id, hairStyle: 'short', clothing: 'leather' };
    const row = document.createElement('div');
    row.className = 'r';
    row.innerHTML = `<div class="n">${L.id}<br>${L.name}</div>`;
    for (const mk of [buildFullAvatarSvgMarkup, buildFullAvatarBackSvgMarkup]) {
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mk(av, { pose: 'idle' }));
      row.appendChild(img);
    }
    box.appendChild(row);
    const look = await getAvatarLook3D(av, 'hi');
    for (const yaw of [0.35, 1.45, Math.PI + 0.35]) {
      const scene = new THREE.Scene();
      const m = new Avatar3D(look);
      m.pose({ dt: 0, t: 0, walkT: 0 });
      m.root.rotation.y = yaw;
      scene.add(m.root);
      const tall = q.get("close") ? 1.0 : q.get("mid") ? 1.45 : 2.05, ty = q.get("close") ? 1.45 : q.get("mid") ? 1.28 : 1.0;
      cam.position.set(0, ty + 0.05, tall / 2 / Math.tan(THREE.MathUtils.degToRad(12)) / Math.min(1, cam.aspect / 0.6));
      cam.lookAt(0, ty, 0);
      r.render(scene, cam);
      const c = document.createElement('canvas');
      c.width = 340; c.height = 420;
      c.getContext('2d').drawImage(r.domElement, 0, 0);
      row.appendChild(c);
      m.dispose();
    }
  }
  window.__ok = true;
})().catch((e) => { document.body.append(String(e.stack || e)); window.__ok = 'err'; });
