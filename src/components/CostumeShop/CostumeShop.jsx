import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { cosmeticsAction } from '../../services/gameActions';
import { buildAvatarSvgInner, buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { LOOK_ART, LOOK_TINT, tintPalette, lookSkinnable, SKIN_PALETTE } from '../../lib/avatarLooks';
import { LOOKS, LOOK_CATS, RARITY } from '../../../functions/cosmeticsData.js';
import './CostumeShop.css';

// =============================================================================
// v160 — Profil › Kostümler: hazır tipler (100 karakter), zümrütle satın alınır.
//  • Karta dokun → üstteki sahnede yürür / durur / oturur / silah tutar (önizleme).
//  • Renk yuvaları (kostüm, detay, saç…) + ten rengi ücretsiz değiştirilir.
//  • Kuşanılan kostüm aksesuar ve evcil hayvanla birlikte her yerde görünür.
//  Kurallar sunucuda (functions/cosmetics.js, kind 'look').
// =============================================================================

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const MAP = Object.fromEntries(LOOKS.map((l) => [l.id, l]));
const CAT_NAME = Object.fromEntries(LOOK_CATS.map((c) => [c.id, `${c.icon} ${c.name}`]));
const RC = Object.fromEntries(Object.entries(RARITY).map(([k, v]) => [k, v.color]));
const POSES = [
  ['walk', 'Yürü'],
  ['idle', 'Dur'],
  ['sit', 'Otur'],
  ['aim', 'Silah'],
];
const sameTint = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
const cleanT = (t) => {
  const o = {};
  ['0', '1', '2', 's'].forEach((k) => {
    if (t?.[k]) o[k] = t[k];
  });
  return o;
};

function Gem({ size = 13 }) {
  return <span className="emerald-icon" style={{ width: size, height: size }} />;
}

// küçük resim: SVG bir kez <img>'e çevrilir (100 kartta DOM hafif kalır)
const thumbCache = new Map();
function thumbSrc(id, tint) {
  const k = id + JSON.stringify(tint || {});
  let v = thumbCache.get(k);
  if (v) return v;
  const bg = LOOK_ART[id]?.base?.background || '#0b0d17';
  const rc = RC[MAP[id]?.r] || '#9aa4b2';
  const av = tint && Object.keys(tint).length ? { look: id, lookTint: tint } : { look: id };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 30 300 330"><defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${rc}" stop-opacity=".38"/><stop offset=".55" stop-color="${bg}"/><stop offset="1" stop-color="#05060c"/></radialGradient></defs><rect x="0" y="0" width="320" height="400" fill="url(#g)"/>${buildAvatarSvgInner(av)}</svg>`;
  v = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  thumbCache.set(k, v);
  if (thumbCache.size > 180) thumbCache.delete(thumbCache.keys().next().value);
  return v;
}

// --- sahne: oyundaki önizleme gibi ileri geri yürür -------------------------------------
function Stage({ avatar, pose }) {
  const ref = useRef(null);
  const avRef = useRef(avatar);
  avRef.current = avatar;
  const poseRef = useRef(pose);
  poseRef.current = pose;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const imgs = new Map();
    const img = (av, p) => {
      const k = JSON.stringify(av) + p;
      let e = imgs.get(k);
      if (!e) {
        e = { ok: false, im: new Image() };
        e.im.onload = () => (e.ok = true);
        e.im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildFullAvatarSvgMarkup(av, { pose: p, animAura: true }));
        imgs.set(k, e);
        if (imgs.size > 40) imgs.delete(imgs.keys().next().value);
      }
      return e.ok ? e.im : null;
    };
    const P = { x: 0.5, dir: 1 };
    const stars = Array.from({ length: 36 }, () => [Math.random(), Math.random() * 0.5, Math.random() * 1.4 + 0.3]);
    let last = performance.now();
    let prev = null;
    let raf = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = LOOK_ART[avRef.current.look]?.base?.background || '#14102a';
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#120a2a');
      g.addColorStop(0.6, bg);
      g.addColorStop(0.75, '#1a1b2e');
      g.addColorStop(1, '#0b0d17');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      stars.forEach(([x, y, r]) => {
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(now / 700 + x * 40);
        ctx.beginPath();
        ctx.arc(x * W, y * H, r, 0, 7);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0b16';
      for (let i = 0; i < 9; i++) {
        const bw = W / 9;
        const bh = 40 + ((i * 53) % 70);
        ctx.fillRect(i * bw, H * 0.72 - bh, bw - 4, bh);
      }
      for (let i = 0; i < 9; i++) {
        const bw = W / 9;
        ctx.fillStyle = i % 2 ? '#22d3ee66' : '#ff2e8866';
        ctx.fillRect(i * bw + 6, H * 0.72 - 30 - ((i * 53) % 50), 6, 4);
      }
      ctx.fillStyle = '#ff2e88';
      ctx.globalAlpha = 0.6;
      ctx.fillRect(0, H * 0.75, W, 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#22d3ee22';
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 30, H * 0.75);
        ctx.lineTo(W / 2 + i * 90, H);
        ctx.stroke();
      }
      const walking = poseRef.current === 'walk';
      if (walking) {
        P.x += P.dir * dt * 0.09;
        if (P.x > 0.68) P.dir = -1;
        if (P.x < 0.32) P.dir = 1;
      }
      const p = walking ? (Math.floor(now / 230) % 2 ? 'walk1' : 'walk2') : poseRef.current;
      const im = img(avRef.current, p) || prev;
      if (im) prev = im;
      const ah = H * 0.86;
      const aw = ah * (320 / 580);
      const cx = (walking ? P.x : 0.5) * W;
      const footY = H * 0.97;
      if (im) {
        ctx.save();
        ctx.translate(cx, 0);
        if (walking && P.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(im, -aw / 2, footY - ah, aw, ah);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="cos-cv" />;
}

export default function CostumeShop({ onBack }) {
  const { player } = usePlayer();
  const owned = useMemo(() => player?.cosmetics?.looks || {}, [player?.cosmetics?.looks]);
  const realAvatar = useMemo(() => ({ ...DEFAULT_AVATAR, ...(player?.avatar || {}) }), [player?.avatar]);
  const equipped = realAvatar.look && MAP[realAvatar.look] ? realAvatar.look : null;
  const savedTint = useMemo(() => cleanT(realAvatar.lookTint), [realAvatar.lookTint]);
  const gems = Number(player?.emerald) || 0;

  const [sel, setSel] = useState(equipped || LOOKS[0].id);
  const [tints, setTints] = useState(() => (equipped ? { [equipped]: cleanT(realAvatar.lookTint) } : {}));
  const [cat, setCat] = useState('all');
  const [rar, setRar] = useState('all');
  const [sort, setSort] = useState('katalog');
  const [pose, setPose] = useState('walk');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastT = useRef(0);
  const topRef = useRef(null);
  const rootRef = useRef(null);
  // oyuncu bilgisi sonradan gelirse kuşanılı kostümle aç (bir kez)
  const synced = useRef(Boolean(player));
  useEffect(() => {
    if (synced.current || !player) return;
    synced.current = true;
    if (equipped) {
      setSel(equipped);
      setTints((all) => ({ ...all, [equipped]: cleanT(realAvatar.lookTint) }));
    }
  }, [player, equipped, realAvatar.lookTint]);
  useEffect(() => () => clearTimeout(toastT.current), []);
  const flash = (text, ok = true) => {
    setToast({ text, ok });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2600);
  };

  const l = MAP[sel];
  const t = tints[sel] || {};
  const own = Boolean(owned[sel]);
  const worn = equipped === sel;
  const tintDirty = worn && !sameTint(cleanT(t), savedTint);
  const viewAvatar = useMemo(() => {
    const a = { ...realAvatar, look: sel };
    const tt = cleanT(tints[sel]);
    if (Object.keys(tt).length) a.lookTint = tt;
    else delete a.lookTint;
    return a;
  }, [realAvatar, sel, tints]);

  const list = useMemo(() => {
    let a = LOOKS.filter((x) => (cat === 'all' || x.cat === cat) && (rar === 'all' || x.r === rar));
    if (sort === 'ucuz') a = [...a].sort((x, y) => x.gem - y.gem);
    if (sort === 'pahali') a = [...a].sort((x, y) => y.gem - x.gem);
    if (sort === 'sahip') a = a.filter((x) => owned[x.id]);
    return a;
  }, [cat, rar, sort, owned]);
  const cnt = (c) => LOOKS.filter((x) => c === 'all' || x.cat === c).length;

  const setSlot = (k, c) => {
    setTints((all) => {
      const cur = { ...(all[sel] || {}) };
      if (c) cur[k] = c;
      else delete cur[k];
      return { ...all, [sel]: cur };
    });
  };
  const reset = () => setTints((all) => ({ ...all, [sel]: {} }));

  const run = async (data, okText) => {
    setBusy(true);
    try {
      const res = await cosmeticsAction(data);
      if (okText) flash(okText);
      return res?.data || {};
    } catch (e) {
      flash(e?.message || 'İşlem yapılamadı.', false);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const act = async () => {
    if (busy) return;
    if (!own) return setAsk(true);
    if (tintDirty) return run({ op: 'lookTint', tint: cleanT(t) }, '🎨 Renkler kaydedildi');
    if (worn) return run({ op: 'unequip', kind: 'look' }, 'Kendi görünümüne döndün');
    return run({ op: 'equip', kind: 'look', id: sel, tint: cleanT(t) }, `${l.name} kuşanıldı ✓`);
  };
  const buy = async () => {
    setAsk(false);
    await run({ op: 'buy', kind: 'look', id: sel, tint: cleanT(t) }, `🎉 ${l.name} artık senin!`);
  };
  const random = () => {
    const p = list.length ? list : LOOKS;
    setSel(p[Math.floor(Math.random() * p.length)].id);
  };
  // v160.2: karta dokununca sayfanın en üstüne (önizleme) — kaydırılan kutu .cos-root
  const pick = (id) => {
    setSel(id);
    const root = rootRef.current;
    if (root) {
      try {
        root.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        root.scrollTop = 0;
      }
    }
  };

  const slots = LOOK_TINT[sel] || [];
  const skin = lookSkinnable(sel);
  const chatAv = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 60 240 240"><rect x="0" y="0" width="320" height="400" fill="${LOOK_ART[sel]?.base?.background || '#0b0d17'}"/>${buildAvatarSvgInner(viewAvatar)}</svg>`;

  let btnCls = 'buy';
  let btnTxt = (
    <>
      Satın Al · <Gem /> {l.gem}
    </>
  );
  let btnOff = busy;
  if (!own && gems < l.gem) {
    btnOff = true;
    btnTxt = (
      <>
        Yetersiz zümrüt · <Gem /> {l.gem}
      </>
    );
  } else if (own && tintDirty) {
    btnCls = 'equip';
    btnTxt = '🎨 Renkleri kaydet';
  } else if (own && worn) {
    btnCls = 'equipped';
    btnTxt = '✓ Kuşanıldı · Çıkar';
  } else if (own) {
    btnCls = 'equip';
    btnTxt = 'Kuşan';
  }

  return (
    <div className="cos-root" ref={rootRef}>
      <div className="cos-wrap">
      <div className="cos-head" ref={topRef}>
        <button className="cos-back" onClick={onBack} aria-label="Geri">
          ←
        </button>
        <div className="cos-ttl">
          <b>🎭 Kostümler</b>
        </div>
        <div className="cos-wallet">
          <Gem size={14} /> {fmt(gems)}
        </div>
      </div>

      <div className="cos-stage">
        <Stage avatar={viewAvatar} pose={pose} />
        <div className="cos-poses">
          {POSES.map(([k, n]) => (
            <button key={k} className={pose === k ? 'on' : ''} onClick={() => setPose(k)}>
              {n}
            </button>
          ))}
        </div>
        <div className="cos-chatprev">
          <span className="cos-bubble">
            <span className="cos-bav" dangerouslySetInnerHTML={{ __html: chatAv }} />
            <span>Sohbette böyle görünür</span>
          </span>
        </div>
      </div>

      <div className="cos-info">
        <div className="cos-row1">
          <div className="cos-name">{l.name}</div>
          <span className="cos-rar" style={{ color: RC[l.r] }}>
            {RARITY[l.r].label}
          </span>
        </div>
        <div className="cos-desc">{l.desc}</div>
        <div className="cos-meta">{CAT_NAME[l.cat]}</div>
        <div className="cos-tints">
          <div className="cos-tints-hd">
            <span>🎨 Renkler</span>
            <button onClick={reset}>Sıfırla</button>
          </div>
          {slots.map(([lb], i) => (
            <div className="cos-trow" key={`${sel}_${i}`}>
              <span className="cos-lb">{lb}</span>
              <div className="cos-sw">
                <button className={`def${t[String(i)] ? '' : ' on'}`} onClick={() => setSlot(String(i), null)} title="Orijinal" />
                {tintPalette(lb).map((c) => (
                  <button key={c} className={t[String(i)] === c ? 'on' : ''} style={{ background: c }} onClick={() => setSlot(String(i), c)} aria-label={c} />
                ))}
              </div>
            </div>
          ))}
          {skin && (
            <div className="cos-trow">
              <span className="cos-lb">Ten</span>
              <div className="cos-sw">
                <button className={`def${t.s ? '' : ' on'}`} onClick={() => setSlot('s', null)} title="Orijinal" />
                {SKIN_PALETTE.map((c) => (
                  <button key={c} className={t.s === c ? 'on' : ''} style={{ background: c }} onClick={() => setSlot('s', c)} aria-label={c} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="cos-actions">
          <button className={`cos-btn ${btnCls}`} disabled={btnOff} onClick={act}>
            {btnTxt}
          </button>
          {own && worn && tintDirty && (
            <button className="cos-btn ghost wide" disabled={busy} onClick={() => run({ op: 'unequip', kind: 'look' }, 'Kendi görünümüne döndün')}>
              Çıkar
            </button>
          )}
          <button className="cos-btn ghost" onClick={random} title="Rastgele" aria-label="Rastgele">
            🎲
          </button>
        </div>
      </div>

      <div className="cos-filters">
        <div className="cos-chips">
          {[['all', '🔥 Tümü'], ...LOOK_CATS.map((c) => [c.id, `${c.icon} ${c.name}`])].map(([id, n]) => (
            <button key={id} className={`cos-chip${cat === id ? ' on' : ''}`} onClick={() => setCat(id)}>
              {n}
              <span className="n">{cnt(id)}</span>
            </button>
          ))}
        </div>
        <div className="cos-sub">
          {[['all', 'Hepsi'], ...Object.entries(RARITY).map(([k, v]) => [k, v.label])].map(([id, n]) => (
            <button key={id} className={`cos-chip${rar === id ? ' on' : ''}`} style={id !== 'all' && rar !== id ? { color: RC[id] } : undefined} onClick={() => setRar(id)}>
              {n}
            </button>
          ))}
          <span className="sp" />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="katalog">Katalog</option>
            <option value="ucuz">Ucuzdan pahalıya</option>
            <option value="pahali">Pahalıdan ucuza</option>
            <option value="sahip">Sahip olduklarım</option>
          </select>
        </div>
      </div>

      <div className="cos-grid">
        {list.length ? (
          list.map((x) => {
            const has = Boolean(owned[x.id]);
            const on = equipped === x.id;
            const tt = tints[x.id];
            return (
              <button key={x.id} className={`cos-card${x.r === 'l' ? ' l' : ''}${sel === x.id ? ' sel' : ''}`} style={sel === x.id ? undefined : { borderColor: `${RC[x.r]}44` }} onClick={() => pick(x.id)}>
                <img className="cos-pic" src={thumbSrc(x.id, on && !tt ? savedTint : tt)} alt="" loading="lazy" decoding="async" />
                <span className="cos-rdot" style={{ color: RC[x.r] }}>
                  {RARITY[x.r].label}
                </span>
                {on && <span className="cos-tick">✓</span>}
                <span className="cos-cap">
                  <span className="cos-nm">{x.name}</span>
                  {has ? (
                    <span className="cos-pr own">{on ? 'Kuşanıldı' : 'Sende'}</span>
                  ) : (
                    <span className="cos-pr">
                      <Gem size={12} />
                      {x.gem}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        ) : (
          <div className="cos-empty">—</div>
        )}
      </div>

      {ask && (
        <div className="cos-modal" onClick={() => setAsk(false)}>
          <div className="cos-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{l.name}</h3>
            <div className="cos-line">
              <span>Fiyat</span>
              <b>
                <Gem /> {l.gem}
              </b>
            </div>
            <div className="cos-line">
              <span>Kalan</span>
              <b>
                <Gem /> {fmt(gems - l.gem)}
              </b>
            </div>
            <div className="cos-actions">
              <button className="cos-btn ghost wide" onClick={() => setAsk(false)}>
                Vazgeç
              </button>
              <button className="cos-btn buy" disabled={busy || gems < l.gem} onClick={buy}>
                Satın Al
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`cos-toast${toast.ok ? '' : ' bad'}`}>{toast.text}</div>}
      </div>
    </div>
  );
}
