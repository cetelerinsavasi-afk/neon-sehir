// =============================================================================
// v196 — şehirde açılan oyunun mekânları: Cafe · Bar · İnternet Kafe · Spor Salonu · Liman & Depo
// Mekâna girilince üstte paneller (TopBtns). Sunucu: oyunun belgeleri houses/game_cafe | game_bar |
// game_internet | game_spor | game_depo (fiyatlar sabit — functions/v196Shared.js).
// Bu mekânlar "hafif": konum kaydı (interiorPresence) yazılmaz.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { shopAction, streamAction } from '../../services/gameActions';
import MenuPanel from '../Venue/MenuPanel';
import GymPanel from '../Gym/GymPanel';
import { DepoTradeSheet } from '../Depo/DepoPanels';
import { NET_MINUTE_PRICE } from '../../../functions/v196Shared.js';
import '../../styles/bizui.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const gameDoc = (id, type) => ({ id, ownerUid: '__game__', bizGame: true, biz: { type }, name: '' });

function TopBtns({ show, items, setPanel }) {
  if (!show) return null;
  return (
    <div className="hb-topbtns">
      {items.map((b) => (
        <button key={b.panel} className="hb-topbtn" onClick={() => setPanel(b.panel)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}
function Layer({ children, onClose }) {
  return (
    <div className="wk-sheet-bg" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// ── CAFE / BAR ─────────────────────────────────────────────────────────────────
// Bot garson içeride ve önündeki masalarda dolaşır; sipariş panelden (içeride ya da masalı alanda).
function menuPart(type, label) {
  return function MenuPart({ panel, setPanel, walk, flash }) {
    const id = `game_${type}`;
    useEffect(() => {
      shopAction({ op: 'venueEnsureGame' }).catch(() => {});
    }, []);
    return (
      <>
        <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'menu', label: `🧾 ${label} menüsü` }]} />
        {panel === 'menu' && (
          <Layer onClose={() => setPanel(null)}>
            <MenuPanel houseId={id} houseDoc={gameDoc(id, type)} onClose={() => setPanel(null)} onBought={(r) => flash?.(`${r?.label || 'Ürün'} geldi. Afiyet olsun.`)} />
          </Layer>
        )}
      </>
    );
  };
}
export const CafePart = menuPart('cafe', 'Cafe');
export const BarPart = menuPart('bar', 'Bar');

// ── İNTERNET KAFE ──────────────────────────────────────────────────────────────
// Bilgisayar ve PlayStation dakikası 100, yayın bilgisayarı 200. İlk dakika peşin, oturdukça her dakika.
const NET_DEVICES = [
  { id: 'npc1', label: '🖥️ Bilgisayar 1', price: NET_MINUTE_PRICE.play },
  { id: 'npc2', label: '🖥️ Bilgisayar 2', price: NET_MINUTE_PRICE.play },
  { id: 'npc3', label: '🖥️ Bilgisayar 3', price: NET_MINUTE_PRICE.play },
  { id: 'npc4', label: '🖥️ Bilgisayar 4', price: NET_MINUTE_PRICE.play },
  { id: 'nps1', label: '🎮 PlayStation 1', price: NET_MINUTE_PRICE.play },
  { id: 'nps2', label: '🎮 PlayStation 2', price: NET_MINUTE_PRICE.play },
];
export function NetKafePart({ panel, setPanel, walk, flash }) {
  const { player } = usePlayer();
  const [sess, setSess] = useState(null); // { device, until }
  const [live, setLive] = useState(null); // { id }
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const tickRef = useRef(null);
  const houseId = 'game_internet';
  useEffect(() => {
    shopAction({ op: 'venueEnsureGame' }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sess && !live) return undefined;
    tickRef.current = setInterval(async () => {
      try {
        if (sess) {
          const r = await shopAction({ op: 'netTick', houseId });
          if (r?.stopped) setSess(null);
          else if (r?.creditUntilMs) setSess((s) => (s ? { ...s, until: r.creditUntilMs } : s));
        }
        if (live) {
          const r = await streamAction({ op: 'tick', streamId: live.id, viewers: 0, seen: 0 });
          if (r?.stopped) setLive(null);
        }
      } catch (e) {
        flash?.(e?.message || 'Bağlantı koptu.');
        setSess(null);
      }
    }, 20_000);
    return () => clearInterval(tickRef.current);
  }, [sess, live, flash]);
  useEffect(
    () => () => {
      shopAction({ op: 'netLeave', houseId }).catch(() => {});
    },
    []
  );
  const start = async (d) => {
    setBusy(true);
    try {
      const r = await shopAction({ op: 'netStart', houseId, itemId: d.id, expect: d.price });
      setSess({ device: d, until: r.creditUntilMs });
      flash?.(r.charged ? `${d.label} senin. −${fmt(r.charged)} altın (1 dk)` : `${d.label} senin.`);
    } catch (e) {
      flash?.(/device-full/.test(e?.message || '') ? 'Dolu. Başka cihaz seç.' : /gold/.test(e?.message || '') ? 'Altının yetmiyor.' : e?.message || 'Olmadı.');
    } finally {
      setBusy(false);
    }
  };
  const goLive = async () => {
    setBusy(true);
    try {
      const r = await streamAction({ op: 'start', houseId, chairId: 'nsch', title: title || `${player?.displayName || 'Oyuncu'} yayında`, expect: NET_MINUTE_PRICE.stream });
      setLive({ id: r.streamId });
      flash?.(`🔴 Yayındasın! −${fmt(r.charged || NET_MINUTE_PRICE.stream)} altın (1 dk)`);
    } catch (e) {
      flash?.(/seat-busy/.test(e?.message || '') ? 'Yayın bilgisayarı dolu.' : e?.message || 'Yayın açılamadı.');
    } finally {
      setBusy(false);
    }
  };
  const stopLive = async () => {
    if (!live) return;
    try {
      await streamAction({ op: 'stop', streamId: live.id });
    } catch {
      /* zaten kapanmış */
    }
    setLive(null);
  };
  return (
    <>
      <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'net', label: '🖥️ Bilgisayarlar' }, { panel: 'yayin', label: '📡 Yayın bilgisayarı' }]} />
      {panel === 'net' && (
        <Layer onClose={() => setPanel(null)}>
          <div className="bz vn-panel">
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>🖥️ Neon İnternet Kafe</h3>
                <p>Dakikası {fmt(NET_MINUTE_PRICE.play)} altın. Otur, oyna.</p>
              </div>
              <button className="bz-x" onClick={() => setPanel(null)}>✕</button>
            </div>
            {sess && (
              <div className="bz-ok">
                {sess.device.label} · süre: {Math.max(0, Math.ceil((sess.until - Date.now()) / 1000))} sn
                <button className="bz-btn" onClick={() => { shopAction({ op: 'netLeave', houseId }).catch(() => {}); setSess(null); }}>Kalk</button>
              </div>
            )}
            <div className="vn-menu">
              {NET_DEVICES.map((d) => (
                <button key={d.id} className="vn-item" disabled={busy || Boolean(sess)} onClick={() => start(d)}>
                  <span>{d.label}</span>
                  <em>{fmt(d.price)}/dk</em>
                </button>
              ))}
            </div>
          </div>
        </Layer>
      )}
      {panel === 'yayin' && (
        <Layer onClose={() => setPanel(null)}>
          <div className="bz vn-panel">
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>📡 Yayın bilgisayarı</h3>
                <p>Dakikası {fmt(NET_MINUTE_PRICE.stream)} altın. Kamera hazır.</p>
              </div>
              <button className="bz-x" onClick={() => setPanel(null)}>✕</button>
            </div>
            {live ? (
              <button className="bz-btn danger" onClick={stopLive}>⏹️ Yayını kapat</button>
            ) : (
              <>
                <input className="hh-input" value={title} maxLength={60} placeholder="Yayın başlığı" onChange={(e) => setTitle(e.target.value)} />
                <button className="bz-btn primary" disabled={busy} onClick={goLive}>🔴 Yayına başla</button>
              </>
            )}
          </div>
        </Layer>
      )}
    </>
  );
}

// ── SPOR SALONU ────────────────────────────────────────────────────────────────
export function SporPart({ panel, setPanel, walk }) {
  return (
    <>
      <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'gym', label: '🏋️ Günlük üyelik' }]} />
      {panel === 'gym' && (
        <Layer onClose={() => setPanel(null)}>
          <GymPanel houseId="game_spor" houseDoc={gameDoc('game_spor', 'spor')} onClose={() => setPanel(null)} />
        </Layer>
      )}
    </>
  );
}

// ── LİMAN & DEPO ───────────────────────────────────────────────────────────────
export function DepoPart({ panel, setPanel, walk }) {
  return (
    <>
      <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'depo', label: '📦 Yasaklı madde' }]} />
      {panel === 'depo' && (
        <Layer onClose={() => setPanel(null)}>
          <DepoTradeSheet depotId="game_depo" houseDoc={gameDoc('game_depo', 'depo')} onClose={() => setPanel(null)} />
        </Layer>
      )}
    </>
  );
}
