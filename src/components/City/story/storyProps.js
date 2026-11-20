// =============================================================================
// v168 — Senaryo efektleri: namlu alevi + mermi izi, yerde yatan figür, siper, Amca'nın mezarı.
// Hepsi tek bir gruba eklenir; dispose() ile ekran kartından TAMAMEN silinir (geometri, malzeme,
// doku) — zayıf telefonlarda bellek birikip WebGL'in çökmemesi için.
// kit = eng.story (motorun canlı sürümde de açık küçük kapısı: THREE, scene, groundY)
// =============================================================================
export function createStoryProps(kit) {
  if (!kit?.scene || !kit?.THREE) return null;
  const THREE = kit.THREE;
  const root = new THREE.Group();
  root.name = 'amcaStory';
  kit.scene.add(root);
  const fx = [];
  let level = 0;
  const gy = (x, z) => {
    if (level) return level - 1;
    try {
      const y = kit.groundY(x, z);
      return Number.isFinite(y) ? y : 0;
    } catch {
      return 0;
    }
  };
  const mats = new Map();
  const mat = (c, r = 0.85, m = 0) => {
    const k = `${c}|${r}|${m}`;
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
    return mats.get(k);
  };
  const mesh = (geo, m, x, y, z, { ry = 0, rx = 0, rz = 0, parent = root, cast = true } = {}) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = cast;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const box = (w, h, d, m, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, o);
  const group = (x, z, ry = 0) => {
    const g = new THREE.Group();
    g.position.set(x, gy(x, z), z);
    g.rotation.y = ry;
    root.add(g);
    return g;
  };
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const svgSprite = (svg, w, h, onTex) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      t.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    onTex?.(t);
    return t;
  };
  // çay bardağı (mezarın başında)
  function tea(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14), mat('#d9d4c8', 0.4), 0, 0.006, 0, { parent: g });
    const glass = new THREE.MeshStandardMaterial({ color: '#e8f2f4', roughness: 0.1, transparent: true, opacity: 0.45 });
    mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.05, 12), glass, 0, 0.037, 0, { parent: g, cast: false });
    mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.05, 12), glass, 0, 0.087, 0, { parent: g, cast: false });
    mesh(new THREE.CylinderGeometry(0.026, 0.021, 0.055, 12), mat('#8a2e12', 0.3), 0, 0.045, 0, { parent: g, cast: false });
    return g;
  }
  return {
    gy,
    setLevel(y) {
      level = y || 0;
    },
    // hurdalık: çatışmada siper (paslı araba + sandıklar + variller)
    cover() {
      const t = group(279.6, 30.4, 0.08);
      box(1.9, 0.75, 4.1, mat('#6b3f26', 0.9, 0.2), 0, 0.32, 0, { parent: t });
      box(1.7, 0.5, 2, mat('#4a2c1c', 0.9, 0.2), 0, 1.07, -0.2, { parent: t });
      [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]].forEach(([x, z]) => mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), mat('#1a1a1a', 0.9), x, 0.33, z, { parent: t, rz: Math.PI / 2 }));
      const crate = mat('#8a6a3c', 0.85);
      const drum = mat('#2f4a3a', 0.6, 0.3);
      [[292, 26.8], [292, 34]].forEach(([x, z]) => {
        const g = group(x, z, 0.2);
        box(1.15, 1.15, 1.15, crate, 0, 0, 0, { parent: g });
        box(1, 1, 1, crate, 0.1, 1.15, 0.05, { parent: g, ry: 0.4 });
      });
      [[295.2, 30.6], [295.9, 29.4]].forEach(([x, z]) => {
        const g = group(x, z);
        mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 14), drum, 0, 0.58, 0, { parent: g });
      });
    },
    shot(from, to, { hit = true } = {}) {
      const y0 = gy(from.x, from.z) + (from.h ?? 1.15);
      const y1 = gy(to.x, to.z) + (to.h ?? 1.1);
      const A = new THREE.Vector3(from.x, y0, from.z);
      const B = new THREE.Vector3(to.x, y1, to.z);
      const dir = B.clone().sub(A);
      const len = dir.length();
      dir.normalize();
      const m = A.clone().addScaledVector(dir, 0.55);
      const flash = mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 1 }), m.x, m.y, m.z, { cast: false });
      fx.push({ o: flash, life: 0.09, t: 0, kind: 'flash' });
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, Math.max(0.1, len - 0.6), 4), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.85 }));
      tr.position.copy(A.clone().add(B).multiplyScalar(0.5));
      tr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      root.add(tr);
      fx.push({ o: tr, life: 0.13, t: 0, kind: 'fade' });
      if (hit) {
        for (let k = 0; k < 6; k++) {
          const sp = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: k % 2 ? '#ffd27a' : '#ffffff', transparent: true }), B.x, B.y, B.z, { cast: false });
          fx.push({ o: sp, life: 0.28, t: 0, kind: 'spark', v: new THREE.Vector3((Math.random() - 0.5) * 3 - dir.x * 2, Math.random() * 2.5, (Math.random() - 0.5) * 3 - dir.z * 2) });
        }
      }
    },
    grave(x, z, ry = 0) {
      const g = group(x, z, ry);
      const stone = mat('#8e8c86', 0.9);
      box(1.25, 0.14, 0.4, mat('#6f6d68', 0.9), 0, 0, 0, { parent: g });
      box(1, 0.72, 0.2, stone, 0, 0.14, 0, { parent: g });
      mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24, 1, false, Math.PI / 2, Math.PI), stone, 0, 0.86, 0, { parent: g, rx: Math.PI / 2 });
      const t = canvasTex(256, 300, (c, w) => {
        c.fillStyle = '#2b2a27';
        c.textAlign = 'center';
        c.font = '40px Georgia, serif';
        c.fillText('☾', w / 2, 58);
        c.font = '900 40px Georgia, serif';
        c.fillText('RIZA', w / 2, 118);
        c.fillText('AKSOY', w / 2, 162);
        c.font = '28px Georgia, serif';
        c.fillText('1961 – 2026', w / 2, 210);
        c.font = 'italic 26px Georgia, serif';
        c.fillText('"Bekledi."', w / 2, 262);
      });
      mesh(new THREE.PlaneGeometry(0.8, 0.94), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, transparent: true }), 0, 0.84, 0.102, { parent: g, cast: false });
      mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#4a3626', 1), 0, 0.02, 1.25, { parent: g }).scale.set(0.55, 0.22, 1.05);
      const stem = mat('#3c6a2a', 0.8);
      [[-0.25, 0.8, '#d43a3a'], [0.2, 0.95, '#f2f2f2'], [-0.05, 1.6, '#d43a3a'], [0.28, 1.45, '#f2c94c'], [-0.3, 1.35, '#f2f2f2']].forEach(([fx0, fz, c]) => {
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), stem, fx0, 0.2, fz, { parent: g, cast: false });
        mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(c, 0.6), fx0, 0.36, fz, { parent: g, cast: false });
      });
      tea(g, 0.38, 0.12, 0.3);
      return g;
    },
    // yerde yatan figür (avatar çizimi yan yatırılır)
    corpse(svg, x, z, { left = true } = {}) {
      const t = svgSprite(svg, 320, 580);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, rotation: left ? Math.PI / 2 : -Math.PI / 2, transparent: true }));
      sp.scale.set(0.95, 1.72, 1);
      sp.position.set(x, gy(x, z) + 0.34, z);
      root.add(sp);
      const sh = mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }), x, gy(x, z) + 0.03, z, { rx: -Math.PI / 2, cast: false });
      sh.scale.set(1, 0.45, 1);
      return {
        pos: { x, z },
        remove: () => {
          [sp, sh].forEach((o) => {
            o.removeFromParent();
            o.geometry?.dispose?.();
            o.material?.map?.dispose?.();
            o.material?.dispose?.();
          });
        },
      };
    },
    update(dt) {
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        const k = f.t / f.life;
        if (k >= 1) {
          f.o.removeFromParent();
          f.o.geometry.dispose();
          f.o.material.dispose();
          fx.splice(i, 1);
          continue;
        }
        if (f.kind === 'flash') f.o.scale.setScalar(1 + k * 1.5);
        if (f.kind === 'spark') {
          f.v.y -= 9 * dt;
          f.o.position.addScaledVector(f.v, dt);
        }
        f.o.material.opacity = 1 - k;
      }
    },
    // bu gruptaki her şeyi siler (mezar ayrı bir props örneğindedir)
    dispose() {
      root.removeFromParent();
      root.traverse((o) => {
        if (!o.isMesh && !o.isSprite) return;
        o.geometry?.dispose?.();
        const m = o.material;
        m?.map?.dispose?.();
        m?.dispose?.(); // paylaşılan malzemeyi iki kez bırakmak zararsız
      });
      mats.clear();
      fx.length = 0;
    },
  };
}
