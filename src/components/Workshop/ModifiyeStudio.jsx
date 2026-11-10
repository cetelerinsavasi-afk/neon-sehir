import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildVehicle, VEHICLE_BY_ID } from '../City/vehicles.js';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { usePlayer } from '../../hooks/usePlayer';
import { MOD_OPTIONS, MOD_RANGES, modDefaults, sanitizeMods, modCost, roofOptions, cleanPlate, cleanSideNo, cleanSign, modProfile, accOptions, TRAILER_COLOR } from '../../../functions/vehicleMods.js';
import { vehicleDisplayName } from '../VehicleCard/VehicleCard';
import './ModifiyeStudio.css';

// =============================================================================
// v150 — MODİFİYE STÜDYOSU (Neon Garaj prototipinden). Araç 3D stüdyoda döner;
// her seçim satın almadan ÖNCE aracın üzerinde görünür. "Uygula" ile sadece
// şu anki halinden FARKLI olan her şeyin ücreti ödenir (satın alınan tasarım
// saklanmaz: değiştirince gider, geri dönmek de yine ücretlidir).
// Para modifiyeciye (vergisi kesilerek) gider. Sadece görünüm — hız değişmez.
// shop: { kind:'game' } | { kind:'player', houseId }
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const TABS = [
  ['boya', '🎨', 'Boya'],
  ['jant', '🛞', 'Jant'],
  ['govde', '🔧', 'Gövde'],
  ['tavan', '🪟', 'Tavan'],
  ['isik', '✨', 'Işık'],
  ['plaka', '🔢', 'Plaka'],
];
// v151 — ticari araç / motor sekmeleri (alan listesi; çizim genel)
const FIN3 = MOD_OPTIONS.finish.filter(([k]) => ['parlak', 'metalik', 'mat'].includes(k));
const FIN4 = MOD_OPTIONS.finish.filter(([k]) => ['parlak', 'metalik', 'mat', 'krom'].includes(k));
const WHEELS = [
  { t: 'opts', k: 'rimStyle', l: 'Jant tipi', list: MOD_OPTIONS.rimStyle },
  { t: 'sw', k: 'rim', l: 'Jant rengi', list: MOD_OPTIONS.rim },
  { t: 'sw', k: 'tire', l: 'Lastik rengi', list: MOD_OPTIONS.tire },
  { t: 'sw', k: 'caliper', l: 'Kaliper', list: MOD_OPTIONS.caliper },
  { t: 'range', k: 'wheelScale', l: 'Jant boyu', f: (v) => `${Math.round(15 + (v - 1) * 25)}"` },
];
const RIMTIRE = [
  { t: 'sw', k: 'rim', l: 'Jant', list: MOD_OPTIONS.rim },
  { t: 'sw', k: 'tire', l: 'Lastik', list: MOD_OPTIONS.tire },
];
const NEON = { t: 'sw', k: 'neonColor', l: 'Neon rengi', list: MOD_OPTIONS.neonColor, custom: false, when: (c) => c.acc?.neon };
const PLATE = { t: 'plate' };
const KIND_TABS = {
  taxi: [
    ['taksi', '🚕', 'Taksi', [{ t: 'opts', k: 'taxiType', l: 'Taksi tipi', list: MOD_OPTIONS.taxiType }, { t: 'opts', k: 'finish', l: 'Yüzey', list: MOD_OPTIONS.finish.filter(([k]) => ['parlak', 'metalik', 'sedef'].includes(k)) }, { t: 'opts', k: 'tint', l: 'Cam filmi', list: MOD_OPTIONS.tint }]],
    ['jant', '🛞', 'Jant', WHEELS],
    ['govde', '🔧', 'Gövde', [{ t: 'range', k: 'ride', l: 'Süspansiyon', f: (v) => rideLabel(v) }, { t: 'opts', k: 'exhaust', l: 'Egzoz', list: MOD_OPTIONS.exhaust }, { t: 'acc', l: 'Parçalar', only: ['spoiler', 'skirts'] }]],
    ['isik', '✨', 'Işık', [{ t: 'acc', l: 'Işıklar', only: ['fog', 'neon'] }, NEON]],
    ['plaka', '🔢', 'Plaka', [PLATE]],
  ],
  police: [
    ['tip', '🚓', 'Tip', [{ t: 'opts', k: 'polType', l: 'Araç tipi', list: MOD_OPTIONS.polType }]],
    ['jant', '🛞', 'Jant', WHEELS],
    ['govde', '🔧', 'Gövde', [{ t: 'range', k: 'ride', l: 'Süspansiyon', f: (v) => rideLabel(v) }, { t: 'acc', l: 'Parçalar' }]],
    ['plaka', '🔢', 'Plaka', [PLATE]],
  ],
  ambulance: [
    ['tip', '🚑', 'Tip', [{ t: 'opts', k: 'ambType', l: 'Araç tipi', list: MOD_OPTIONS.ambType }]],
    ['jant', '🛞', 'Jant', RIMTIRE],
    ['plaka', '🔢', 'Plaka', [PLATE]],
  ],
  bus: [
    ['tip', '🚌', 'Tip', [{ t: 'opts', k: 'variant', l: 'Otobüs tipi', list: MOD_OPTIONS.variant }]],
    ['boya', '🎨', 'Boya', [{ t: 'sw', k: 'paint', l: 'Gövde', list: MOD_OPTIONS.paint }, { t: 'sw', k: 'accent', l: 'Şerit / vurgu', list: MOD_OPTIONS.paint }, { t: 'opts', k: 'finish', l: 'Yüzey', list: FIN3 }]],
    ['tabela', '🪧', 'Tabela', [{ t: 'text', k: 'sign', l: 'Güzergâh tabelası', max: 22, clean: (v) => cleanSign(v, 22) }, PLATE]],
    ['jant', '🛞', 'Jant', RIMTIRE],
    ['aks', '🔧', 'Aksesuar', [{ t: 'acc', l: 'Parçalar' }, NEON]],
  ],
  truck: [
    ['dorse', '🚛', 'Dorse', [{ t: 'opts', k: 'trailer', l: 'Dorse tipi', list: MOD_OPTIONS.trailer, also: (v) => ({ trailerColor: TRAILER_COLOR[v] }) }, { t: 'sw', k: 'trailerColor', l: 'Dorse rengi', list: MOD_OPTIONS.paint }, { t: 'text', k: 'company', l: 'Firma adı', max: 16, clean: (v) => cleanSign(v, 16) }]],
    ['boya', '🎨', 'Çekici', [{ t: 'sw', k: 'paint', l: 'Renk', list: MOD_OPTIONS.paint }, { t: 'opts', k: 'finish', l: 'Yüzey', list: FIN4 }]],
    ['jant', '🛞', 'Jant', RIMTIRE],
    ['aks', '🔧', 'Aksesuar', [{ t: 'acc', l: 'Parçalar' }, NEON]],
    ['plaka', '🔢', 'Plaka', [PLATE]],
  ],
  moto: [
    ['boya', '🎨', 'Boya', [{ t: 'sw', k: 'paint', l: 'Renk', list: MOD_OPTIONS.paint }, { t: 'opts', k: 'finish', l: 'Yüzey', list: FIN4 }]],
    ['isik', '✨', 'Işık', [{ t: 'acc', l: 'Işık' }, NEON]],
    ['plaka', '🔢', 'Plaka', [PLATE]],
  ],
};
// araç boyu (kamera uzaklığı için)
const KIND_LEN = { taxi: 4.6, police: 4.6, ambulance: 6.2, bus: 11.5, truck: 15.5, moto: 2.1 };
const rideLabel = (v) => (v < -0.02 ? 'Basık' : v > 0.12 ? 'Off-road' : v > 0.02 ? 'Yüksek' : 'Standart');

// ---- 3D sahne -----------------------------------------------------------------------
function useStudio(mountRef, catalogId, cfg, tab, spin) {
  const S = useRef(null);
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    scene.background = new THREE.Color('#090c18');
    scene.fog = new THREE.Fog('#090c18', 18, 40);
    scene.add(new THREE.HemisphereLight('#b8c8ff', '#120a18', 0.55));
    const key = new THREE.DirectionalLight('#fff4e8', 2.8);
    key.position.set(8, 14, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    scene.add(key);
    const rimL = new THREE.DirectionalLight('#9fdcff', 1.2);
    rimL.position.set(-8, 5, -7);
    scene.add(rimL);
    // döner platform + neon halkalar
    const turn = new THREE.Group();
    scene.add(turn);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.2, 64), new THREE.MeshStandardMaterial({ color: '#141a2c', roughness: 0.3, metalness: 0.5 }));
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    turn.add(floor);
    for (const [r, c] of [[4.62, '#ff2e8c'], [3.2, '#19e8ff']]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 96), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.01;
      turn.add(ring);
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: '#0b0f1c', roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    camera.position.set(6.5, 2.8, 6.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2.4;
    controls.maxDistance = 16;
    controls.enablePan = false;
    controls.target.set(0, 0.7, 0);
    const st = { renderer, scene, camera, controls, turn, car: null, raf: 0, spin: true, focus: null, alive: true };
    S.current = st;
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(host);
    let last = performance.now();
    const loop = (t) => {
      if (!st.alive) return;
      st.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (st.spin) turn.rotation.y += dt * 0.35;
      if (st.focus) {
        const k = Math.min(1, dt * 3.5);
        camera.position.lerp(st.focus.pos, k);
        controls.target.lerp(st.focus.tgt, k);
        if (camera.position.distanceTo(st.focus.pos) < 0.02) st.focus = null;
      }
      if (st.car?.neon) st.car.neon.material.opacity = 0.75 + Math.sin(t / 300) * 0.2;
      controls.update();
      renderer.render(scene, camera);
    };
    st.raf = requestAnimationFrame(loop);
    const stopFocus = () => (st.focus = null);
    renderer.domElement.addEventListener('pointerdown', stopFocus);
    return () => {
      st.alive = false;
      cancelAnimationFrame(st.raf);
      ro?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', stopFocus);
      controls.dispose();
      scene.traverse((o) => o.isMesh && o.geometry?.dispose?.());
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
      S.current = null;
    };
  }, [mountRef]);

  // araç (ayar değişince yeniden kurulur)
  const key = JSON.stringify(cfg);
  useEffect(() => {
    const st = S.current;
    if (!st) return undefined;
    const t = setTimeout(() => {
      if (!S.current) return;
      if (st.car) {
        st.turn.remove(st.car.root);
        st.car.root.traverse((o) => o.isMesh && o.geometry?.dispose?.());
      }
      st.car = buildVehicle(catalogId, cfg);
      st.car.root.traverse((o) => {
        if (o.isMesh && !o.material?.transparent) o.castShadow = true;
      });
      st.turn.add(st.car.root);
    }, 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId, key]);

  // sekmeye göre kamera
  useEffect(() => {
    const st = S.current;
    if (!st) return;
    const prof = modProfile(catalogId);
    const len = prof === 'car' ? VEHICLE_BY_ID[catalogId]?.spec?.L || 4.4 : KIND_LEN[prof] || 4.4;
    const k = prof === 'car' ? 1 : Math.max(0.55, len / 4.6);
    st.controls.maxDistance = 16 * Math.max(1, k);
    const kv = (v) => [v[0].map((x) => x * k), v[1].map((x) => x * (k > 1 ? Math.min(k, 1.6) : 1))];
    const views0 = {
      boya: [[6.2, 2.6, 6.2], [0, 0.7, 0]],
      jant: [[3.6, 0.9, 2.2], [len * 0.32, 0.45, 0.7]],
      govde: [[-6.4, 1.9, 4.4], [0, 0.6, 0]],
      tavan: [[3.5, 4.8, 3.2], [0, 0.9, 0]],
      isik: [[5.2, 0.9, 4.6], [0, 0.4, 0]],
      plaka: [[0.6, 1.3, -5.6], [0, 0.6, -len * 0.3]],
    };
    const views = Object.fromEntries(Object.entries(views0).map(([key, v]) => [key, key === 'plaka' || key === 'jant' ? [v[0].map((x) => x * Math.max(1, k * 0.8)), v[1]] : kv(v)]));
    const spinTab = tab === 'boya' || (prof !== 'car' && ['taksi', 'tip', 'dorse', 'aks'].includes(tab));
    const [p, tg] = views[tab] || views.boya;
    st.spin = spinTab ? spin : false;
    if (!spinTab) st.turn.rotation.y = 0;
    st.focus = { pos: new THREE.Vector3(...p), tgt: new THREE.Vector3(...tg) };
  }, [tab, catalogId, spin]);
  useEffect(() => {
    if (S.current && tab === 'boya') S.current.spin = spin;
  }, [spin, tab]);
}

// ---- küçük kontroller -------------------------------------------------------------------
function Row({ label, price, children }) {
  return (
    <div className="ms-row">
      <div className="ms-row-h">
        <span>{label}</span>
        {price > 0 && <em>+{fmt(price)}</em>}
      </div>
      <div className="ms-ctl">{children}</div>
    </div>
  );
}
function Swatches({ list, value, onPick, custom = true }) {
  return (
    <div className="ms-sw">
      {list.map((c) => (
        <button key={c} className={String(value).toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{ background: c }} title={c} onClick={() => onPick(c)} />
      ))}
      {custom && (
        <label className="ms-sw-custom" title="Özel renk">
          <input type="color" value={value} onChange={(e) => onPick(e.target.value)} />
          <span>＋</span>
        </label>
      )}
    </div>
  );
}
function Opts({ list, value, onPick, priceOf }) {
  return (
    <div className="ms-opts">
      {list.map(([v, l, sub]) => {
        const pr = value === v ? 0 : priceOf(v);
        return (
          <button key={v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>
            {l}
            {sub && <small>{sub}</small>}
            {pr > 0 && <i>+{fmt(pr)}</i>}
          </button>
        );
      })}
    </div>
  );
}
function Range({ k, value, onChange, fmtV = (v) => v }) {
  const [lo, hi, step] = MOD_RANGES[k];
  return (
    <div className="ms-range">
      <input type="range" min={lo} max={hi} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{fmtV(value)}</b>
    </div>
  );
}

// v151 — ticari / motor sekme gövdesi (KIND_TABS listesinden)
function KindBody({ spec, cfg, base, set, priceOf, cid, plateDraft, setPlateDraft }) {
  const diff = (k) => JSON.stringify(cfg[k]) !== JSON.stringify(base[k]);
  return spec.map((c, i) => {
    if (c.when && !c.when(cfg)) return null;
    if (c.t === 'note') return <p key={i} className="ms-hint">{c.text}</p>;
    if (c.t === 'sw')
      return (
        <Row key={i} label={c.l} price={diff(c.k) ? priceOf({ [c.k]: cfg[c.k] }) : 0}>
          <Swatches list={c.list} value={cfg[c.k]} onPick={(v) => set({ [c.k]: v })} custom={c.custom !== false} />
        </Row>
      );
    if (c.t === 'opts')
      return (
        <Row key={i} label={c.l}>
          <Opts list={c.list} value={cfg[c.k]} onPick={(v) => set({ [c.k]: v, ...(c.also ? c.also(v) : {}) })} priceOf={(v) => priceOf({ [c.k]: v })} />
        </Row>
      );
    if (c.t === 'range')
      return (
        <Row key={i} label={c.l} price={diff(c.k) ? priceOf({ [c.k]: cfg[c.k] }) : 0}>
          <Range k={c.k} value={cfg[c.k]} onChange={(v) => set({ [c.k]: v })} fmtV={c.f} />
        </Row>
      );
    if (c.t === 'text')
      return (
        <Row key={i} label={c.l} price={diff(c.k) ? priceOf({ [c.k]: cfg[c.k] }) : 0}>
          <input className="ms-text" maxLength={c.max} value={cfg[c.k]} onChange={(e) => set({ [c.k]: c.clean(e.target.value) })} />
        </Row>
      );
    if (c.t === 'acc') {
      const list = accOptions(cid).filter(([k]) => !c.only || c.only.includes(k));
      if (!list.length) return null;
      return (
        <Row key={i} label={c.l}>
          <div className="ms-opts">
            {list.map(([k, l, ic]) => {
              const pr = priceOf({ acc: { ...base.acc, [k]: !cfg.acc[k] } });
              return (
                <button key={k} className={cfg.acc[k] ? 'on' : ''} onClick={() => set({ acc: { [k]: !cfg.acc[k] } })}>
                  <b>{ic}</b> {l}
                  {cfg.acc[k] === base.acc[k] && pr > 0 && <i>+{fmt(pr)}</i>}
                </button>
              );
            })}
          </div>
        </Row>
      );
    }
    if (c.t === 'plate')
      return (
        <Row key={i} label="Plaka" price={cfg.plate !== base.plate ? priceOf({ plate: cfg.plate }) : 0}>
          <input
            className="ms-text ms-plate-in"
            maxLength={11}
            value={plateDraft}
            onChange={(e) => {
              const v = e.target.value.toLocaleUpperCase('tr-TR');
              setPlateDraft(v);
              set({ plate: cleanPlate(v, base.plate) });
            }}
          />
          <div className="ms-plate">
            <i>TR</i>
            <b>{cfg.plate}</b>
          </div>
        </Row>
      );
    return null;
  });
}

export default function ModifiyeStudio({ vehicle, shop, isOwner = false, onClose, onDone }) {
  const { player } = usePlayer();
  const cid = Number(vehicle.catalogId) || 1;
  // araç belgesi her güncellendiğinde (ömür vs.) seçimler sıfırlanmasın: sadece mods değişince
  const modsJson = JSON.stringify(vehicle.mods || null);
  const base = useMemo(() => sanitizeMods(cid, JSON.parse(modsJson)), [cid, modsJson]);
  const [cfg, setCfg] = useState(base);
  const prof = modProfile(cid);
  const tabs = prof === 'car' ? TABS.map(([k, ic, l]) => [k, ic, l]) : KIND_TABS[prof].map(([k, ic, l]) => [k, ic, l]);
  const [tab, setTab] = useState(tabs[0][0]);
  const [spin, setSpin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [plateDraft, setPlateDraft] = useState(base.plate);
  const mountRef = useRef(null);
  useStudio(mountRef, cid, cfg, tab, spin);
  useEffect(() => {
    setCfg(base);
    setPlateDraft(base.plate);
  }, [base]);
  // Android geri tuşu / Esc: stüdyoyu kapat
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  const cost = useMemo(() => modCost(cid, base, cfg), [cid, base, cfg]);
  // bir seçeneğin (şu anki hale göre) fiyatı
  const priceOf = (patch) => modCost(cid, base, { ...base, ...patch }).total;
  const set = (patch) => {
    setMsg(null);
    setCfg((c) => sanitizeMods(cid, { ...c, ...patch, acc: { ...c.acc, ...(patch.acc || {}) } }));
  };
  const gold = Number(player?.gold || 0);
  const poor = gold < cost.total;
  const hasCab = roofOptions(cid).some((o) => o[0] === 'kapali');

  const apply = async () => {
    if (busy || !cost.total || poor || isOwner) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await shopAction({ op: 'modify', shop: shop.kind === 'game' ? 'game' : shop.houseId, vehicleId: vehicle.id, mods: cfg, expect: cost.total });
      setMsg({ ok: true, text: `✓ Modifiye tamam! ${fmt(r?.total ?? cost.total)} altın ödendi — aracın artık şehirde, profilde ve galeride böyle görünür.` });
      onDone?.(r);
    } catch (e) {
      const m = String(e?.message || '');
      if (m.startsWith('price-changed')) setMsg({ ok: false, text: 'Tutar az önce değişti, tekrar dene.' });
      else if (m === 'gold') setMsg({ ok: false, text: 'Altının yetmiyor.' });
      else if (m === 'own-shop') setMsg({ ok: false, text: 'Kendi dükkânında modifiye yaptıramazsın — rakip bir modifiyeciye git.' });
      else setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="ms-root" role="dialog" aria-label="Modifiye">
      <div className="ms-stage" ref={mountRef} />
      <div className="ms-top">
        <button className="ms-x" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <div className="ms-title">
          <small>MODİFİYE</small>
          <b>{vehicleDisplayName(vehicle) || VEHICLE_BY_ID[cid]?.name || ''}</b>
        </div>
        {(tab === 'boya' || prof !== 'car') && (
          <button className={`ms-spin${spin ? ' on' : ''}`} onClick={() => setSpin((s) => !s)} title="Döndür">
            ⟳
          </button>
        )}
      </div>

      <div className="ms-panel">
        <div className="ms-tabs">
          {tabs.map(([k, ic, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <b>{ic}</b>
              {l}
            </button>
          ))}
        </div>
        <div className="ms-body">
          {prof !== 'car' && <KindBody spec={KIND_TABS[prof].find((x) => x[0] === tab)?.[3] || []} cfg={cfg} base={base} set={set} priceOf={priceOf} cid={cid} plateDraft={plateDraft} setPlateDraft={setPlateDraft} />}
          {prof === 'car' && tab === 'boya' && (
            <>
              <Row label="Renk" price={cfg.paint !== base.paint ? priceOf({ paint: cfg.paint }) : 0}>
                <Swatches list={MOD_OPTIONS.paint} value={cfg.paint} onPick={(c) => set({ paint: c })} />
              </Row>
              <Row label="Yüzey">
                <Opts list={MOD_OPTIONS.finish} value={cfg.finish} onPick={(v) => set({ finish: v })} priceOf={(v) => priceOf({ finish: v })} />
              </Row>
              <Row label="Kaplama">
                <Opts list={MOD_OPTIONS.livery} value={cfg.livery} onPick={(v) => set({ livery: v })} priceOf={(v) => priceOf({ livery: v })} />
              </Row>
              <Row label="Kapı numarası" price={cfg.sideNo !== base.sideNo ? priceOf({ sideNo: cfg.sideNo }) : 0}>
                <input className="ms-text" maxLength={3} value={cfg.sideNo} placeholder="77" onChange={(e) => set({ sideNo: cleanSideNo(e.target.value) })} />
              </Row>
            </>
          )}
          {prof === 'car' && tab === 'jant' && (
            <>
              <Row label="Jant tipi">
                <Opts list={MOD_OPTIONS.rimStyle} value={cfg.rimStyle} onPick={(v) => set({ rimStyle: v })} priceOf={(v) => priceOf({ rimStyle: v })} />
              </Row>
              <Row label="Kol sayısı" price={cfg.spokes !== base.spokes ? priceOf({ spokes: cfg.spokes }) : 0}>
                <Range k="spokes" value={cfg.spokes} onChange={(v) => set({ spokes: v })} />
              </Row>
              <Row label="Jant rengi" price={cfg.rim !== base.rim ? priceOf({ rim: cfg.rim }) : 0}>
                <Swatches list={MOD_OPTIONS.rim} value={cfg.rim} onPick={(c) => set({ rim: c })} />
              </Row>
              <Row label="Lastik rengi" price={cfg.tire !== base.tire ? priceOf({ tire: cfg.tire }) : 0}>
                <Swatches list={MOD_OPTIONS.tire} value={cfg.tire} onPick={(c) => set({ tire: c })} />
              </Row>
              <Row label="Kaliper" price={cfg.caliper !== base.caliper ? priceOf({ caliper: cfg.caliper }) : 0}>
                <Swatches list={MOD_OPTIONS.caliper} value={cfg.caliper} onPick={(c) => set({ caliper: c })} />
              </Row>
              <Row label="Ekstra">
                <div className="ms-opts">
                  {[
                    ['letter', '🅰️ Yazılı lastik'],
                    ['deep', '⭕ Derin jant'],
                  ].map(([k, l]) => {
                    const pr = priceOf({ [k]: !cfg[k] });
                    return (
                      <button key={k} className={cfg[k] ? 'on' : ''} onClick={() => set({ [k]: !cfg[k] })}>
                        {l}
                        {cfg[k] === base[k] && pr > 0 && <i>+{fmt(pr)}</i>}
                      </button>
                    );
                  })}
                </div>
              </Row>
              <Row label="Jant boyu" price={cfg.wheelScale !== base.wheelScale ? priceOf({ wheelScale: cfg.wheelScale }) : 0}>
                <Range k="wheelScale" value={cfg.wheelScale} onChange={(v) => set({ wheelScale: v })} fmtV={(v) => `${Math.round(15 + (v - 1) * 25)}"`} />
              </Row>
            </>
          )}
          {prof === 'car' && tab === 'govde' && (
            <>
              <Row label="Süspansiyon" price={cfg.ride !== base.ride ? priceOf({ ride: cfg.ride }) : 0}>
                <Range k="ride" value={cfg.ride} onChange={(v) => set({ ride: v })} fmtV={rideLabel} />
              </Row>
              <Row label="Egzoz">
                <Opts list={MOD_OPTIONS.exhaust} value={cfg.exhaust} onPick={(v) => set({ exhaust: v })} priceOf={(v) => priceOf({ exhaust: v })} />
              </Row>
              <Row label="Parçalar">
                <div className="ms-opts">
                  {MOD_OPTIONS.acc
                    .filter(([k]) => k !== 'fog' && k !== 'neon')
                    .map(([k, l, ic]) => {
                      const pr = priceOf({ acc: { ...base.acc, [k]: !cfg.acc[k] } });
                      return (
                        <button key={k} className={cfg.acc[k] ? 'on' : ''} onClick={() => set({ acc: { [k]: !cfg.acc[k] } })}>
                          <b>{ic}</b> {l}
                          {cfg.acc[k] === base.acc[k] && pr > 0 && <i>+{fmt(pr)}</i>}
                        </button>
                      );
                    })}
                </div>
              </Row>
            </>
          )}
          {prof === 'car' && tab === 'tavan' && (
            <>
              <Row label="Tavan">
                <Opts list={roofOptions(cid)} value={cfg.roof} onPick={(v) => set({ roof: v })} priceOf={(v) => priceOf({ roof: v })} />
              </Row>
              {hasCab && cfg.roof === 'kapali' && (
                <Row label="Cam filmi">
                  <Opts list={MOD_OPTIONS.tint} value={cfg.tint} onPick={(v) => set({ tint: v })} priceOf={(v) => priceOf({ tint: v })} />
                </Row>
              )}
              <Row label="İç döşeme" price={cfg.interior !== base.interior ? priceOf({ interior: cfg.interior }) : 0}>
                <Swatches list={MOD_OPTIONS.interior} value={cfg.interior} onPick={(c) => set({ interior: c })} custom={false} />
              </Row>
            </>
          )}
          {prof === 'car' && tab === 'isik' && (
            <>
              <Row label="Işıklar">
                <div className="ms-opts">
                  {MOD_OPTIONS.acc
                    .filter(([k]) => k === 'fog' || k === 'neon')
                    .map(([k, l, ic]) => {
                      const pr = priceOf({ acc: { ...base.acc, [k]: !cfg.acc[k] } });
                      return (
                        <button key={k} className={cfg.acc[k] ? 'on' : ''} onClick={() => set({ acc: { [k]: !cfg.acc[k] } })}>
                          <b>{ic}</b> {l}
                          {cfg.acc[k] === base.acc[k] && pr > 0 && <i>+{fmt(pr)}</i>}
                        </button>
                      );
                    })}
                </div>
              </Row>
              {cfg.acc.neon && (
                <Row label="Neon rengi" price={cfg.neonColor !== base.neonColor && base.acc.neon ? priceOf({ neonColor: cfg.neonColor }) : 0}>
                  <Swatches list={MOD_OPTIONS.neonColor} value={cfg.neonColor} onPick={(c) => set({ neonColor: c })} custom={false} />
                </Row>
              )}
            </>
          )}
          {prof === 'car' && tab === 'plaka' && (
            <Row label="Plaka" price={cfg.plate !== base.plate ? priceOf({ plate: cfg.plate }) : 0}>
              <input
                className="ms-text ms-plate-in"
                maxLength={11}
                value={plateDraft}
                onChange={(e) => {
                  const v = e.target.value.toLocaleUpperCase('tr-TR');
                  setPlateDraft(v);
                  set({ plate: cleanPlate(v) });
                }}
              />
              <div className="ms-plate">
                <i>TR</i>
                <b>{cfg.plate}</b>
              </div>
            </Row>
          )}
        </div>

        <div className="ms-foot">
          {cost.items.length > 0 ? (
            <div className="ms-bill">
              {cost.items.map((x) => (
                <span key={x.key}>
                  {x.label} <b>{fmt(x.price)}</b>
                </span>
              ))}
            </div>
          ) : null}
          <div className="ms-foot-row">
            <button className="ms-ghost" onClick={() => set(base)} disabled={!cost.items.length}>
              ↺ Geri al
            </button>
            <button className="ms-ghost" onClick={() => setCfg(sanitizeMods(cid, modDefaults(cid)))} title="Fabrika hali (ücretli)">
              🏭 Orijinal
            </button>
            <button className="ms-go" disabled={busy || !cost.total || poor || isOwner} onClick={apply}>
              {busy ? 'Uygulanıyor…' : isOwner ? 'Kendi dükkânın' : !cost.total ? 'Değişiklik yok' : poor ? `Altın yetmiyor · ${fmt(cost.total)}` : `💳 Uygula · ${fmt(cost.total)}`}
            </button>
          </div>
          {isOwner && <p className="ms-warn">Kendi dükkânında modifiye yaptıramazsın — rakip bir modifiyeciye ya da oyunun garajına git. (Deneyebilirsin, ama uygulayamazsın.)</p>}
          {msg && <p className={msg.ok ? 'ms-ok' : 'ms-warn'}>{msg.text}</p>}
          <p className="ms-wallet">
            Cebinde <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(gold)}
          </p>
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
