import { useEffect, useRef, useState } from 'react';
import { createHouseEngine } from '../HouseScreen/houseEngine';
import HeldIcon from '../HouseScreen/HeldIcon';
import { VENUES, NPC_AVATARS } from '../../../functions/venueLayouts.js';
import { HOUSE_PRODUCTS, VENUE_FREE_TAKE_KEYS } from '../../../functions/houseCatalogData.js';
import { BIZ_TYPES } from '../../../functions/businessCatalogData.js';
import { DEFAULT_AVATAR } from '../../lib/avatarShapes';
import { useBackClose } from '../../lib/backStack';
import { guestHouse } from '../../lib/guestApi';
import GuestSignInSheet from './GuestSignInSheet';
import '../HouseScreen/HouseScreen.css';
import './Guest.css';

// =============================================================================
// v134 — MİSAFİR MEKÂN GEZİNTİSİ (giriş yapmamış oyuncu)
//   Oyunun mekânları (yerleşim functions/venueLayouts.js'te) ya da oyuncuların
//   açtığı işletme / ofisler (tasarım sunucudan: houseAction guestHouse) aynı 3D
//   motorla gezilir. Sadece bu cihazda: kimse misafiri görmez, misafir de diğer
//   oyuncuları görmez. Oturma serbest; oyunun mekânlarındaki ücretsiz su / çay
//   alınabilir. Alışveriş, panel, oyun… → giriş kartı.
// =============================================================================
const GUEST_UID = '__guest__';
const HELD_MS = 120_000;
const npcToOther = (n) => ({ uid: n.id, displayName: n.name, avatar: n.av, x: n.x, z: n.z, left: !!n.left, seat: n.seat || null, holdingVisible: null });
// satın alınmış her büfe kulübesinin içinde bir büfeci durur (HouseScreen ile aynı)
const bufeNpcs = (items) =>
  (items || [])
    .filter((it) => it.k === 'bufe' && it.p === 1)
    .map((it) => {
      const ry = (it.r || 0) * (Math.PI / 4);
      return { uid: `npc_bufe_${it.i}`, displayName: 'Büfeci', avatar: NPC_AVATARS.bufeci, x: it.x - 0.22 * Math.sin(ry), z: it.z - 0.22 * Math.cos(ry), left: false, seat: null, holdingVisible: null };
    });

export default function GuestVenueScreen({ venueKey = null, houseId = null, onExit }) {
  const v = venueKey ? VENUES[venueKey] || null : null;
  const mountRef = useRef(null);
  const engRef = useRef(null);
  const [design, setDesign] = useState(() => (v ? { name: v.name, icon: v.icon, items: v.items, wall: v.wall, floor: v.floor, door: v.door || null, npcs: v.npcs || [] } : null));
  const [err, setErr] = useState(null);
  const [interact, setInteract] = useState(null);
  const [view, setView] = useState('3d');
  const [ask, setAsk] = useState(false);
  const [toast, setToast] = useState(null);
  useBackClose(true, () => (ask ? setAsk(false) : onExit?.()));

  // oyuncu mekânı: tasarım sunucudan (önbellekli)
  useEffect(() => {
    if (v || !houseId) return undefined;
    let alive = true;
    guestHouse(houseId)
      .then((h) => {
        if (!alive) return;
        if (!h) setErr('Bu mekân şu an gezilemiyor.');
        else setDesign({ name: h.name || BIZ_TYPES[h.bizType]?.label || 'Ofis', icon: h.bizType ? BIZ_TYPES[h.bizType]?.icon || '🏪' : h.emoji || '🏢', sub: h.ownerName, items: h.items, wall: h.wall, floor: h.floor, door: h.door || null, npcs: [] });
      })
      .catch(() => alive && setErr('Bağlantı sorunu — tekrar dene.'));
    return () => {
      alive = false;
    };
  }, [v, houseId]);

  useEffect(() => {
    if (!design || !mountRef.current) return undefined;
    const eng = createHouseEngine(mountRef.current, { canEdit: false, selfUid: GUEST_UID, onInteractChange: setInteract, onPlayerTap: () => false });
    engRef.current = eng;
    if (import.meta.env?.DEV) window.__guestEngine = eng; // sadece geliştirme/önizleme
    if (v) {
      eng.setVenueStations(v.stations || {});
      if (v.outdoor) eng.setOutdoor(true);
    }
    eng.setMode('walk');
    eng.setView('3d');
    eng.setSelf({ uid: GUEST_UID, name: 'Misafir', avatar: DEFAULT_AVATAR });
    eng.setDesign({ items: design.items || [], wall: design.wall, floor: design.floor, door: design.door }, { force: true });
    const npcs = [...design.npcs.map(npcToOther), ...bufeNpcs(design.items)];
    if (npcs.length) eng.setOthers(npcs);
    // NPC'ler ara ara konuşur (oyunun mekânlarındaki gibi)
    const talkers = design.npcs.filter((n) => n.lines?.length);
    let i = 0;
    const iv = talkers.length
      ? setInterval(() => {
          if (document.hidden) return;
          const n = talkers[i % talkers.length];
          i += 1;
          eng.say(n.id, n.lines[Math.floor(Math.random() * n.lines.length)]);
        }, 10_500)
      : null;
    return () => {
      if (iv) clearInterval(iv);
      eng.dispose();
      engRef.current = null;
    };
  }, [design, v]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const heldTimer = useRef(null);
  useEffect(() => () => clearTimeout(heldTimer.current), []);

  const itemKeyOf = (id) => (design?.items || []).find((it) => it.i === id)?.k || null;
  const freeTake = (a) => a.kind === 'take' && v && VENUE_FREE_TAKE_KEYS.includes(itemKeyOf(interact?.id));
  const doAction = (a) => {
    const eng = engRef.current;
    if (!eng) return;
    if (a.kind === 'sit' || a.kind === 'toggle') {
      eng.interact(a);
      return;
    }
    if (freeTake(a)) {
      const r = eng.interact(a);
      if (r?.kind !== 'take') return;
      eng.setSelfHolding(r.product);
      clearTimeout(heldTimer.current);
      heldTimer.current = setTimeout(() => engRef.current?.setSelfHolding(null), HELD_MS);
      setToast(`${HOUSE_PRODUCTS[r.product]?.emoji || ''} ${HOUSE_PRODUCTS[r.product]?.label || 'Ürün'} elinde`);
      return;
    }
    setAsk(true);
  };
  const toggleView = () => {
    const nv = view === '3d' ? '2d' : view === '2d' ? 'fp' : '3d';
    setView(nv);
    engRef.current?.setView(nv);
  };

  const actions = interact && !interact.trial ? interact.actions || [] : [];
  return (
    <div className="hs-root gv-root">
      <div ref={mountRef} className="hs-stage" />
      {!design && (
        <div className="hs-loading">
          {err ? (
            <>
              <p>{err}</p>
              <button className="gv-exit-btn" onClick={onExit}>
                ← Geri
              </button>
            </>
          ) : (
            <>
              <div className="hs-spinner" />
              <p>Giriliyor…</p>
            </>
          )}
        </div>
      )}
      {design && (
        <>
          <div className="hs-top">
            <button className="hs-icon-btn" onClick={onExit} title="Çık">
              ✕
            </button>
            <div className="hs-title">
              <b>
                {design.icon} {design.name}
              </b>
              <span>{design.sub ? `Sahibi: ${design.sub}` : '👀 Misafir olarak geziyorsun'}</span>
            </div>
            <button className="hs-view-btn" onClick={toggleView} title="Görünümü değiştir">
              {view === '3d' ? '3D' : view === '2d' ? '2D' : '👁️ Göz'}
            </button>
            <button className="gv-login-btn" onClick={() => setAsk(true)}>
              🔑 Giriş yap
            </button>
          </div>
          {actions.length > 0 && (
            <div className="hs-actions">
              <div className="hs-actions-title">{interact.name}</div>
              {actions.map((a) => (
                <button key={a.label} className={`hs-act${a.kind === 'take' ? ' take' : ''}${a.kind === 'sit' || a.kind === 'toggle' || freeTake(a) ? '' : ' cue-dim'}`} onClick={() => doAction(a)}>
                  {a.kind === 'take' ? (
                    <>
                      <HeldIcon product={a.product} size={20} /> {HOUSE_PRODUCTS[a.product]?.label} al
                    </>
                  ) : (
                    a.label
                  )}
                  {a.kind !== 'sit' && a.kind !== 'toggle' && !freeTake(a) && ' 🔒'}
                </button>
              ))}
            </div>
          )}
          {toast && <div className="hs-toast">{toast}</div>}
        </>
      )}
      {ask && <GuestSignInSheet onClose={() => setAsk(false)} />}
    </div>
  );
}
