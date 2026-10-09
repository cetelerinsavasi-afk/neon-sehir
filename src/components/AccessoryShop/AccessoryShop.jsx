import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { cosmeticsAction } from '../../services/gameActions';
import { buildFullAvatarSvgMarkup, DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { ACC_ART, drawPet, drawOwnerPet, drawAuraFx, PET_ART } from '../../lib/cosmeticsArt';
import { PETS, ACCESSORIES, ACC_SLOTS, RARITY, LEASH_COLORS, priceOf } from '../../../functions/cosmeticsData.js';
import './AccessoryShop.css';

// =============================================================================
// v78 — Profil › Aksesuarlar: evcil hayvan ve aksesuar mağazası
//  • Ürüne dokununca avatarının üstünde ANINDA önizlenir (deneme).
//  • Satın alınan ürün kuşanılır; kuşanılanlar gittiğin her mekânda görünür.
//  • Satın alınmayan ürün sadece burada denenir, mekânlarda görünmez.
//  • Tasma: aç/kapat + renk (sadece yerde yürüyen hayvanlarda).
//  • v79 Kaydet: denediğin görünüm (hayvan, aksesuarlar, tasma) alttaki
//    "Kaydet" ile tek seferde kuşanılır; satın alınmayanlar kaydedilmez.
// =============================================================================

// iki görünüm aynı mı? (hayvan + tasma + aksesuar yuvaları)
function sameLook(a, b) {
  const pa = a?.pet || null;
  const pb = b?.pet || null;
  if (Boolean(pa) !== Boolean(pb)) return false;
  if (pa && (pa.id !== pb.id || (pa.leash !== false) !== (pb.leash !== false) || (pa.leashColor || LEASH_COLORS[0]) !== (pb.leashColor || LEASH_COLORS[0]))) return false;
  const aa = a?.acc || {};
  const ab = b?.acc || {};
  const keys = new Set([...Object.keys(aa), ...Object.keys(ab)]);
  for (const k of keys) if (aa[k] !== ab[k]) return false;
  return true;
}

const fmt = (n) => Math.round(n || 0).toLocaleString('tr-TR');
const SLOT_VIEWBOX = { head: '80 10 160 130', face: '90 140 140 80', neck: '100 245 120 95', back: '0 240 320 300', aura: '0 180 320 400' };

function Price({ item }) {
  const p = priceOf(item);
  if (p.currency === 'gold')
    return (
      <span className="acs-price">
        <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(p.amount)}
      </span>
    );
  return (
    <span className="acs-price gem">
      <span className="emerald-icon" style={{ width: 13, height: 13 }} /> {p.amount}
    </span>
  );
}

// v79.2 performans: küçük resimler BİR KEZ çizilir (eskiden 20 kart × her kare yeniden çiziliyordu)
function PetThumb({ id }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const x = cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, cv.width, cv.height);
    const s = PET_ART[id]?.s || 40;
    const size = Math.min(76, 62 * (s / 50) + 20);
    drawPet(x, id, cv.width * 0.44, cv.height - 10, 300, { size, live: true });
  }, [id]);
  return <canvas ref={ref} className="acs-thumb" width="150" height="100" />;
}

function AccThumb({ item }) {
  const art = ACC_ART[item.id] || {};
  const vb = SLOT_VIEWBOX[item.slot] || '0 0 320 580';
  return (
    <svg className="acs-thumb" viewBox={vb} xmlns="http://www.w3.org/2000/svg" dangerouslySetInnerHTML={{ __html: `${art.b || ''}${art.f || ''}` }} />
  );
}

// --- Önizleme sahnesi: avatar ileri geri yürür, hayvan peşinden gelir ---------------
function Stage({ avatar, onPet, sayRef }) {
  const ref = useRef(null);
  const avRef = useRef(avatar);
  avRef.current = avatar;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const cache = new Map();
    const img = (av, pose) => {
      const key = JSON.stringify(av) + pose;
      let e = cache.get(key);
      if (!e) {
        e = { ready: false, img: new Image() };
        e.img.onload = () => (e.ready = true);
        e.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildFullAvatarSvgMarkup(av, { pose, animAura: true }));
        cache.set(key, e);
        if (cache.size > 40) cache.delete(cache.keys().next().value);
      }
      return e.ready ? e.img : null;
    };
    let lastImg = null;
    const P = { x: 0.42, dir: 1, mode: 'idle', until: performance.now() + 1800 };
    let raf = 0;
    let last = performance.now();
    const hearts = [];
    cv.__hearts = hearts;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // zemin
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#120a2a');
      g.addColorStop(0.62, '#2a1450');
      g.addColorStop(0.63, '#1a1b2e');
      g.addColorStop(1, '#0b0d17');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(34,211,238,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.63);
      ctx.lineTo(W, H * 0.63);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,46,136,.14)' : 'rgba(34,211,238,.12)';
        const bw = W / 7;
        const bh = H * (0.2 + ((i * 37) % 23) / 60);
        ctx.fillRect(i * bw + 4, H * 0.63 - bh, bw - 8, bh);
      }
      // yürüyüş
      if (now > P.until) {
        if (P.mode === 'idle') {
          P.mode = 'walk';
          P.dir = P.x > 0.5 ? -1 : 1;
          P.until = now + 1700;
        } else {
          P.mode = 'idle';
          P.until = now + 2600;
        }
      }
      const moving = P.mode === 'walk';
      if (moving) P.x = Math.max(0.24, Math.min(0.62, P.x + P.dir * 0.16 * dt));
      const h = Math.min(H * 0.78, 230);
      const w = h * (320 / 580);
      const x = P.x * W;
      const baseY = H * 0.9;
      const pose = moving ? (Math.floor(now / 170) % 2 ? 'walk1' : 'walk2') : 'idle';
      const av = avRef.current;
      const im = img(av, pose) || lastImg;
      if (im) lastImg = im;
      ctx.save();
      ctx.translate(x, baseY);
      if (P.dir < 0) ctx.scale(-1, 1);
      if (im) ctx.drawImage(im, -w / 2, -h, w, h);
      ctx.restore();
      if (av.pet?.id) drawOwnerPet(ctx, { key: '__shop', x, baseY, facing: P.dir < 0 ? 'left' : 'right', h, w, pet: av.pet, moving, now });
      if (av.acc?.aura) drawAuraFx(ctx, av.acc, x, baseY, h, now);
      // kalpler + konuşma
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      for (let i = hearts.length - 1; i >= 0; i--) {
        const q = hearts[i];
        const a = (now - q.t) / 1400;
        if (a >= 1) {
          hearts.splice(i, 1);
          continue;
        }
        if (a < 0) continue;
        ctx.globalAlpha = 1 - a;
        ctx.fillText('💗', x + q.dx + Math.sin(a * 8 + q.o) * 8, baseY - h * 0.3 - a * 60);
      }
      ctx.globalAlpha = 1;
      const say = sayRef.current;
      if (say && now < say.until) {
        ctx.font = 'bold 13px system-ui, sans-serif';
        const tw = Math.min(W - 20, ctx.measureText(say.t).width + 20);
        const bx = Math.max(10, Math.min(W - tw - 10, x + w * 0.4 - tw / 2));
        const by = baseY - h * 0.62;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.roundRect?.(bx, by, tw, 26, 10);
        if (!ctx.roundRect) ctx.rect(bx, by, tw, 26);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.fillText(say.t, bx + tw / 2, by + 17, tw - 12);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sayRef]);
  return <canvas ref={ref} className="acs-stage-cv" onPointerDown={onPet} />;
}

export default function AccessoryShop({ onBack }) {
  const { player } = usePlayer();
  const owned = useMemo(() => ({ pets: player?.cosmetics?.pets || {}, accs: player?.cosmetics?.accs || {} }), [player?.cosmetics]);
  const realAvatar = useMemo(() => ({ ...DEFAULT_AVATAR, ...(player?.avatar || {}) }), [player?.avatar]);
  const [tab, setTab] = useState('pet');
  const [flt, setFlt] = useState('all');
  // önizleme (deneme) — başlangıçta kuşanılmış olanlar
  const [trial, setTrial] = useState(null); // { pet, acc } | null = kuşanılmış hal
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [toast, setToast] = useState(null);
  const sayRef = useRef(null);
  const stageRef = useRef(null);

  const equippedPet = realAvatar.pet || null;
  const equippedAcc = realAvatar.acc || {};
  const view = trial || { pet: equippedPet, acc: equippedAcc };
  const viewAvatar = useMemo(() => {
    const a = { ...realAvatar };
    delete a.pet;
    delete a.acc;
    if (view.pet) a.pet = view.pet;
    if (view.acc && Object.keys(view.acc).length) a.acc = view.acc;
    return a;
  }, [realAvatar, view.pet, view.acc]);
  const trialItems = [
    ...(view.pet && !owned.pets[view.pet.id] ? [PETS.find((p) => p.id === view.pet.id)] : []),
    ...Object.values(view.acc || {})
      .filter((id) => !owned.accs[id])
      .map((id) => ACCESSORIES.find((a) => a.id === id)),
  ].filter(Boolean);
  const dirty = Boolean(trial) && !sameLook(trial, { pet: equippedPet, acc: equippedAcc });
  // Kaydet'e basılınca sunucuda olacak görünüm (functions/cosmetics.js 'save' ile aynı
  // kural): satın alınmayan ürünün yuvasında önceden kuşanılmış olan kalır.
  const willSave = (() => {
    if (!trial) return null;
    const pet = trial.pet ? (owned.pets[trial.pet.id] ? trial.pet : equippedPet) : null;
    const acc = {};
    for (const [slot, id] of Object.entries(trial.acc || {})) {
      if (owned.accs[id]) acc[slot] = id;
      else if (equippedAcc[slot]) acc[slot] = equippedAcc[slot];
    }
    return { pet, acc };
  })();
  const ownedChange = dirty && !sameLook(willSave, { pet: equippedPet, acc: equippedAcc });

  const toastTimer = useRef(0);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const flash = (text, ok = true) => {
    setToast({ text, ok });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  const petSay = (id) => {
    const p = PETS.find((x) => x.id === id);
    if (p) sayRef.current = { t: p.say, until: performance.now() + 2600 };
  };
  const sev = () => {
    if (!view.pet) return flash('Önce bir evcil hayvan seç 🐾', false);
    petSay(view.pet.id);
    const now = performance.now();
    const cv = stageRef.current?.querySelector('canvas');
    cv?.__hearts?.push(...[0, 1, 2].map((i) => ({ dx: (i - 1) * 14 + 60, t: now + i * 120, o: i })));
  };

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

  const tryOn = (kind, item) => {
    const base = trial || { pet: equippedPet, acc: { ...equippedAcc } };
    if (kind === 'pet') {
      const same = base.pet?.id === item.id;
      const next = { ...base, pet: same ? null : { id: item.id, leash: base.pet?.leash !== false, leashColor: base.pet?.leashColor || LEASH_COLORS[0] } };
      setTrial(next);
      if (!same) petSay(item.id);
    } else {
      const acc = { ...(base.acc || {}) };
      if (acc[item.slot] === item.id) delete acc[item.slot];
      else acc[item.slot] = item.id;
      setTrial({ ...base, acc });
    }
  };

  const equip = async (kind, item) => {
    const isOn = kind === 'pet' ? equippedPet?.id === item.id : equippedAcc[item.slot] === item.id;
    const res = isOn
      ? await run({ op: 'unequip', kind, slot: item.slot }, kind === 'pet' ? `${item.name} eve gönderildi.` : `${item.name} çıkarıldı.`)
      : await run({ op: 'equip', kind, id: item.id }, `${item.name} kuşanıldı ✓`);
    if (res) setTrial(null);
  };
  const buy = async () => {
    const { kind, item } = confirm;
    setConfirm(null);
    const res = await run({ op: 'buy', kind, id: item.id }, `${item.name} senin! Kuşanıldı ✓`);
    if (res) {
      setTrial(null);
      if (kind === 'pet') petSay(item.id);
    }
  };
  // v79: tasma ayarı da önizlemeye girer, "Kaydet" ile birlikte saklanır
  const setLeash = (patch) => {
    const base = trial || { pet: equippedPet, acc: { ...equippedAcc } };
    if (!base.pet) return;
    setTrial({ ...base, pet: { ...base.pet, ...(patch.on !== undefined ? { leash: patch.on } : {}), ...(patch.color ? { leashColor: patch.color, leash: true } : {}) } });
  };
  const save = async () => {
    if (!dirty) return true;
    const res = await run({ op: 'save', pet: view.pet || null, acc: view.acc || {} });
    if (!res) return false;
    const skipped = (res.skipped || []).map((id) => PETS.find((x) => x.id === id)?.name || ACCESSORIES.find((x) => x.id === id)?.name).filter(Boolean);
    flash(skipped.length ? `Kaydedildi ✓ — satın alınmadığı için kaydedilmedi: ${skipped.join(', ')}` : 'Görünümün kaydedildi ✓', true);
    setTrial(null);
    return true;
  };
  const back = () => (dirty ? setLeaveAsk(true) : onBack?.());

  const list = tab === 'pet' ? PETS : ACCESSORIES.filter((a) => flt === 'all' || a.slot === flt);
  const leashOn = view.pet && view.pet.leash !== false;
  const perchPet = view.pet && PETS.find((p) => p.id === view.pet.id)?.perch;

  return (
    <div className="acs-root">
      <div className="acs-head">
        <button className="acs-back" onClick={back} aria-label="Geri">
          ←
        </button>
        <div className="acs-title">
          <b>🐾 Aksesuarlar</b>
          <small>Kuşandıkların gittiğin her mekânda görünür</small>
        </div>
        <div className="acs-wallet">
          <span>
            <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(player?.gold)}
          </span>
          <span>
            <span className="emerald-icon" style={{ width: 14, height: 14 }} /> {fmt(player?.emerald)}
          </span>
        </div>
      </div>

      <div className="acs-stage" ref={stageRef}>
        <Stage avatar={viewAvatar} onPet={sev} sayRef={sayRef} />
        <div className="acs-stage-bar">
          <button onClick={sev}>💗 Sev</button>
          {view.pet && !perchPet && (
            <button className={leashOn ? '' : 'off'} onClick={() => setLeash({ on: !leashOn })}>
              🦮 Tasma {leashOn ? 'açık' : 'kapalı'}
            </button>
          )}
        </div>
        {view.pet && !perchPet && leashOn && (
          <div className="acs-leash-colors" aria-label="Tasma rengi">
            {LEASH_COLORS.map((c) => (
              <button key={c} className={view.pet.leashColor === c ? 'on' : ''} style={{ background: c }} onClick={() => setLeash({ color: c })} aria-label={`Tasma rengi ${c}`} />
            ))}
          </div>
        )}
      </div>
      {/* v78: önizleme notu sahnenin altında (hayvanların ayaklarını kapatmasın) */}
      {trialItems.length > 0 && (
        <div className="acs-trial">
          <b>Deneme</b> — {trialItems.map((i) => i.name).join(', ')}. Satın almadan kaydedilmez.
        </div>
      )}

      <div className="acs-panel">
        <div className="acs-tabs">
          <button className={tab === 'pet' ? 'on' : ''} onClick={() => setTab('pet')}>
            🐾 Evcil Hayvanlar
          </button>
          <button
            className={tab === 'acc' ? 'on' : ''}
            onClick={() => {
              setTab('acc');
              setFlt('all');
            }}
          >
            👑 Aksesuarlar
          </button>
        </div>
        {tab === 'acc' && (
          <div className="acs-chips">
            {[['all', 'Hepsi'], ...Object.entries(ACC_SLOTS)].map(([k, l]) => (
              <button key={k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="acs-grid">
          {list.map((item) => {
            const kind = tab;
            const has = kind === 'pet' ? owned.pets[item.id] : owned.accs[item.id];
            const worn = kind === 'pet' ? equippedPet?.id === item.id : equippedAcc[item.slot] === item.id;
            const previewing = kind === 'pet' ? view.pet?.id === item.id : view.acc?.[item.slot] === item.id;
            const R = RARITY[item.r];
            return (
              <div key={item.id} className={`acs-card${previewing ? ' on' : ''}`} style={{ '--rc': R.color }} onClick={() => tryOn(kind, item)}>
                {kind === 'pet' ? <PetThumb id={item.id} /> : <AccThumb item={item} />}
                <b className="acs-name">{item.name}</b>
                <div className="acs-meta">
                  <span className="acs-pill" style={{ background: R.color }}>
                    {R.label}
                  </span>
                  {item.fun && <span className="acs-pill fun">😂 Mizahi</span>}
                  {item.r === 'l' && <span className="acs-lt">Sınırlı seri</span>}
                  {kind === 'acc' && <span className="acs-lt">{ACC_SLOTS[item.slot]}</span>}
                  {kind === 'pet' && item.perch && <span className="acs-lt">Omuza konar</span>}
                </div>
                <div className="acs-row" onClick={(e) => e.stopPropagation()}>
                  {has ? <span className="acs-own">✓ Sende</span> : <Price item={item} />}
                  {has ? (
                    <button className={`acs-btn${worn ? ' worn' : ''}`} disabled={busy} onClick={() => equip(kind, item)}>
                      {worn ? 'Çıkar' : 'Kuşan'}
                    </button>
                  ) : (
                    <button className="acs-btn buy" disabled={busy} onClick={() => setConfirm({ kind, item })}>
                      Satın al
                    </button>
                  )}
                </div>
                {worn && <i className="acs-tick">TAKILI ✓</i>}
              </div>
            );
          })}
        </div>
      </div>

      {/* v79: kaydet çubuğu (her zaman görünür) */}
      <div className={`acs-savebar${dirty ? ' dirty' : ''}`}>
        <span className="acs-savebar-txt">{dirty ? (ownedChange ? 'Kaydedilmemiş değişiklik var' : 'Denediklerin satın alınmadan kaydedilmez') : '✓ Görünümün kayıtlı'}</span>
        {dirty && (
          <button className="acs-btn" disabled={busy} onClick={() => setTrial(null)}>
            Vazgeç
          </button>
        )}
        <button className="acs-save" disabled={!dirty || !ownedChange || busy} onClick={save}>
          {busy ? 'Kaydediliyor…' : '💾 Kaydet'}
        </button>
      </div>

      {leaveAsk && (
        <div className="acs-confirm-bg" onClick={() => setLeaveAsk(false)}>
          <div className="acs-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="acs-confirm-title">Değişiklikleri kaydetmedin</p>
            <p className="acs-confirm-note">Kaydetmeden çıkarsan son kaydettiğin görünüm kalır.</p>
            <div className="acs-confirm-btns">
              <button
                className="acs-btn"
                onClick={() => {
                  setLeaveAsk(false);
                  setTrial(null);
                  onBack?.();
                }}
              >
                Kaydetmeden çık
              </button>
              <button
                className="acs-btn buy"
                disabled={busy || !ownedChange}
                onClick={async () => {
                  setLeaveAsk(false);
                  if (await save()) onBack?.();
                }}
              >
                Kaydet ve çık
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="acs-confirm-bg" onClick={() => setConfirm(null)}>
          <div className="acs-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="acs-confirm-thumb">{confirm.kind === 'pet' ? <PetThumb id={confirm.item.id} /> : <AccThumb item={confirm.item} />}</div>
            <p className="acs-confirm-title">{confirm.item.name}</p>
            <p className="acs-confirm-cost">
              <Price item={confirm.item} /> karşılığında satın al?
            </p>
            <p className="acs-confirm-note">Satın aldığında hemen kuşanılır. Kuşandığın {confirm.kind === 'pet' ? 'hayvan' : 'aksesuar'} gittiğin her mekânda herkes tarafından görülür.</p>
            <div className="acs-confirm-btns">
              <button className="acs-btn" onClick={() => setConfirm(null)}>
                Vazgeç
              </button>
              <button className="acs-btn buy" disabled={busy} onClick={buy}>
                Satın al
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`acs-toast${toast.ok ? '' : ' bad'}`}>{toast.text}</div>}
    </div>
  );
}
