// v191 — AÇILIŞ HIZI: şehrin de kullandığı figür süsleri (ifadeler, evcil hayvan, ateş aurası) ev
// motorundan (houseEngine.js) ayrıldı. Kod aynı; houseEngine.js bunları buradan yeniden dışa aktarır.
import * as THREE from 'three';
import { drawPet, isPerchPet, petCollarAt, PET_ART, drawFireAura } from '../../lib/cosmeticsArt';

const AV_UNIT = 1.75 / 507; // houseEngine.js ile AYNI
const AV_PLANE_H = 580 * AV_UNIT;
const AV_PLANE_W = 320 * AV_UNIT;

export const EMOTES = [
  { key: 'dans', label: 'Dans et', emoji: '💃' },
  { key: 'selam', label: 'El salla', emoji: '👋' },
  { key: 'alkis', label: 'Alkışla', emoji: '👏' },
  { key: 'zipla', label: 'Zıpla', emoji: '🤸' },
  { key: 'kalp', label: 'Kalp at', emoji: '❤️' },
];

// v78 — evcil hayvan (avatar.pet): sahibinin yanında yürüyen, kameraya dönük
// küçük sprite + tasma çizgisi. Papağan/baykuş/martı sahibi durunca omzuna konar.
const PET_CV = 256;
const PET_PX = 140; // canvas'ta hayvan boyu
const PET_OX = 110;
const PET_OY = 220;
export class PetFollower { // v147: şehir de kullanır
  constructor(scene, pet) {
    this.scene = scene;
    this.id = pet.id;
    this.perch = isPerchPet(pet.id);
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = PET_CV;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, alphaTest: 0.2, toneMapped: false }));
    this.sm = ((PET_ART[pet.id]?.s || 40) * 0.72 * 1.75) / 159; // metre (avatar 1,75 m)
    const k = (PET_CV / PET_PX) * this.sm;
    this.sprite.scale.set(k, k, 1);
    this.sprite.center.set(PET_OX / PET_CV, 1 - PET_OY / PET_CV);
    scene.add(this.sprite);
    this.leashGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
    this.leash = new THREE.Line(this.leashGeo, new THREE.LineBasicMaterial({ color: 0xff2e88, toneMapped: false }));
    scene.add(this.leash);
    this.x = null;
    this.y = 0;
    this.z = 0;
    this.flip = false;
    this.lastDraw = 0;
    this.set(pet);
  }
  set(pet) {
    this.pet = pet;
    this.leash.material.color.set(pet.leashColor || '#ff2e88');
  }
  update(dt, now, owner, ang, seatPos) {
    const rx = Math.cos(ang);
    const rz = -Math.sin(ang);
    const side = owner.facingLeft ? -1 : 1;
    let tx;
    let ty;
    let tz;
    let flying = false;
    // v175 — ŞEHİR DIŞINDA EVCİL HAYVAN: yükseklik eskiden hep 0'dı (şehrin zemini). Köy yollarında,
    // tepede, vadide zemin 0 değil → hayvan havada asılı (uçuyor gibi, uzakta sanılıyor) ya da yerin
    // altında kalıyordu. Artık sahibinin ayak hizası esas alınır (evde / şehirde yine 0 civarı).
    const base = Number.isFinite(owner.y) ? owner.y : 0;
    if (this.perch && !owner.moving) {
      tx = owner.x - rx * 0.16 * side;
      tz = owner.z - rz * 0.16 * side;
      ty = (seatPos ? seatPos.y + 0.95 : base + 1.42) - 0.02;
    } else if (this.perch) {
      flying = true;
      tx = owner.x - rx * 0.3 * side + Math.sin(now / 420) * 0.15;
      tz = owner.z - rz * 0.3 * side;
      ty = base + 1.95 + Math.sin(now / 260) * 0.06;
    } else {
      tx = owner.x + rx * (0.5 + this.sm * 0.3) * side;
      tz = owner.z + rz * (0.5 + this.sm * 0.3) * side;
      ty = base;
    }
    // ışınlanma / araçtan inme / uzak kalma: hayvan sahibinin yanına hemen gelir (koşarak yetişmeye çalışmaz)
    if (this.x !== null && (Math.hypot(tx - this.x, tz - this.z) > 6 || Math.abs(ty - this.y) > 3)) this.x = null;
    if (this.x === null) {
      this.x = tx;
      this.y = ty;
      this.z = tz;
    }
    const dx = tx - this.x;
    const dz = tz - this.z;
    // v175: geride kaldıkça daha hızlı yetişir (koşarken hayvan uzakta kalmasın)
    const lag = Math.max(0, Math.hypot(dx, dz) - 1.2);
    const k = Math.min(1, dt * (this.perch ? 5 : 3.5) * (1 + lag));
    this.x += dx * k;
    this.y += (ty - this.y) * k;
    this.z += dz * k;
    const lateral = dx * rx + dz * rz;
    if (Math.abs(lateral) > 0.01) this.flip = lateral < 0;
    if (this.perch && !owner.moving && Math.hypot(dx, dz, ty - this.y) > 0.05) flying = true;
    const moving = Math.hypot(dx, dz) * k / Math.max(dt, 0.001) > 0.25;
    this.sprite.position.set(this.x, this.y, this.z);
    // doku ~20 fps (yürüme/kuyruk animasyonu)
    if (now - this.lastDraw > 50) {
      this.lastDraw = now;
      const c = this.ctx;
      c.clearRect(0, 0, PET_CV, PET_CV);
      const showLeash = this.pet.leash !== false && !this.perch;
      drawPet(c, this.id, PET_OX, PET_OY, now, { moving, flip: this.perch && !flying ? side < 0 : this.flip, flying, collar: showLeash ? this.pet.leashColor || '#ff2e88' : null, size: PET_PX });
      this.tex.needsUpdate = true;
    }
    // tasma: el → tasma halkası
    const showLeash = this.pet.leash !== false && !this.perch;
    this.leash.visible = showLeash;
    if (showLeash) {
      const hx = owner.x + rx * 0.24 * side;
      const hz = owner.z + rz * 0.24 * side;
      const hy = seatPos ? seatPos.y + 0.5 : base + 0.92;
      const fdir = this.flip ? -1 : 1;
      const [ccx, ccy] = petCollarAt(this.id);
      const px = this.x + rx * ccx * this.sm * fdir;
      const pz = this.z + rz * ccx * this.sm * fdir;
      const py = this.y - ccy * this.sm;
      const pos = this.leashGeo.attributes.position;
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const sag = Math.sin(t * Math.PI) * 0.18;
        pos.setXYZ(i, hx + (px - hx) * t, hy + (py - hy) * t - sag, hz + (pz - hz) * t);
      }
      pos.needsUpdate = true;
    }
  }
  dispose() {
    this.scene.remove(this.sprite);
    this.scene.remove(this.leash);
    this.sprite.material.dispose();
    this.tex.dispose();
    this.leashGeo.dispose();
    this.leash.material.dispose();
  }
}

// v135 — hareketli ateş aurası: avatar düzleminin hemen arkasında aynı boyda bir
// düzlem; doku ~20 fps yeniden çizilir (drawFireAura, SVG ölçüsünün yarısı).
const FIRE_CW = 160;
const FIRE_CH = 290;
export class FireAuraFx { // v147: şehir de kullanır
  constructor(parent) {
    this.cv = document.createElement('canvas');
    this.cv.width = FIRE_CW;
    this.cv.height = FIRE_CH;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(AV_PLANE_W, AV_PLANE_H), this.mat);
    this.mesh.position.z = -0.012;
    this.mesh.renderOrder = -1;
    this.mesh.raycast = () => {};
    parent.add(this.mesh);
    this.parent = parent;
    this.last = -1e9;
  }
  update(now, visible) {
    this.mesh.visible = visible;
    if (!visible || now - this.last < 50) return;
    this.last = now;
    this.ctx.clearRect(0, 0, FIRE_CW, FIRE_CH);
    drawFireAura(this.ctx, FIRE_CW / 2, (562 / 580) * FIRE_CH, FIRE_CW / 320, now);
    this.tex.needsUpdate = true;
  }
  dispose() {
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
