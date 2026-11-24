// =============================================================================
// v196 — şehirde açılan oyunun mekânları: Cafe · Bar · İnternet Kafe · Spor Salonu · Liman & Depo
// Mekâna girilince üstte paneller (TopBtns). Sunucu: oyunun belgeleri houses/game_cafe | game_bar |
// game_internet | game_spor | game_depo (fiyatlar sabit — functions/v196Shared.js).
// Bu mekânlar "hafif": konum kaydı (interiorPresence) yazılmaz.
// =============================================================================
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { shopAction, streamAction } from '../../services/gameActions';
import MenuPanel from '../Venue/MenuPanel';
import GymPanel from '../Gym/GymPanel';
import { DepoTradeSheet } from '../Depo/DepoPanels';
import { NET_MINUTE_PRICE } from '../../../functions/v196Shared.js';
import '../../styles/bizui.css';

const ArcadeHub = lazy(() => import('../Arcade/ArcadeHub'));
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
// v196: liste yok — bilgisayara / konsola yaklaşınca "🎮 Oyun oyna" (dakikası 100, ilk dakika peşin, oynadıkça
// her dakika), yayın setinin koltuğunda "🔴 Yayın aç" (dakikası 200). İstasyonlar: City/world/layouts.js netkafe.
const deviceName = (id) => (id.startsWith('nps') ? `🎮 PlayStation ${id.slice(3)}` : `🖥️ Bilgisayar ${id.slice(3)}`);
export function NetKafePart({ panel, setPanel, flash }) {
  const { player } = usePlayer();
  const [sess, setSess] = useState(null); // { id, until }
  const [live, setLive] = useState(null); // { id }
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [arcade, setArcade] = useState(false);
  const tickRef = useRef(null);
  const houseId = 'game_internet';
  useEffect(() => {
    shopAction({ op: 'venueEnsureGame' }).catch(() => {});
  }, []);
  const leave = useCallback(() => {
    shopAction({ op: 'netLeave', houseId }).catch(() => {});
    setSess(null);
    setArcade(false);
  }, []);
  useEffect(() => {
    if (!sess && !live) return undefined;
    tickRef.current = setInterval(async () => {
      try {
        if (sess) {
          const r = await shopAction({ op: 'netTick', houseId });
          if (r?.stopped) {
            setSess(null);
            setArcade(false);
            flash?.('⏱️ Süren bitti.');
          } else if (r?.creditUntilMs) setSess((s) => (s ? { ...s, until: r.creditUntilMs } : s));
        }
        if (live) {
          const r = await streamAction({ op: 'tick', streamId: live.id, viewers: 0, seen: 0 });
          if (r?.stopped) setLive(null);
        }
      } catch (e) {
        flash?.(e?.message || 'Bağlantı koptu.');
        setSess(null);
        setArcade(false);
      }
    }, 20_000);
    return () => clearInterval(tickRef.current);
  }, [sess, live, flash]);
  useEffect(() => () => shopAction({ op: 'netLeave', houseId }).catch(() => {}), []);
  // istasyon düğmesi: play:<cihaz> → hemen başlar (onay penceresi yok), oyun açılır
  useEffect(() => {
    if (!panel || !panel.startsWith('play:')) return;
    const id = panel.slice(5);
    setPanel(null);
    if (sess?.id === id) {
      setArcade(true);
      return;
    }
    (async () => {
      setBusy(true);
      try {
        if (sess) await shopAction({ op: 'netLeave', houseId }).catch(() => {});
        const r = await shopAction({ op: 'netStart', houseId, itemId: id, expect: NET_MINUTE_PRICE.play });
        setSess({ id, until: r.creditUntilMs });
        setArcade(true);
        flash?.(r.charged ? `${deviceName(id)} · −${fmt(r.charged)} altın (1 dk)` : deviceName(id));
      } catch (e) {
        flash?.(/device-full/.test(e?.message || '') ? 'Dolu. Yandakine geç.' : /gold/.test(e?.message || '') ? 'Altının yetmiyor.' : e?.message || 'Olmadı.');
      } finally {
        setBusy(false);
      }
    })();
  }, [panel, sess, setPanel, flash]);
  const chair = panel && panel.startsWith('stream:') ? panel.slice(7) : null;
  const goLive = async () => {
    setBusy(true);
    try {
      const r = await streamAction({ op: 'start', houseId, chairId: chair, title: title || `${player?.displayName || 'Oyuncu'} yayında`, expect: NET_MINUTE_PRICE.stream });
      setLive({ id: r.streamId });
      setPanel(null);
      flash?.(`🔴 Yayındasın! −${fmt(r.charged || NET_MINUTE_PRICE.stream)} altın (1 dk)`);
    } catch (e) {
      flash?.(/seat-busy/.test(e?.message || '') ? 'Bu set dolu.' : e?.message || 'Yayın açılamadı.');
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
      {(sess || live) && (
        <div className="hb-topbtns">
          {sess && <button className="hb-topbtn" onClick={() => setArcade(true)}>🎮 Oyna · {deviceName(sess.id)}</button>}
          {sess && <button className="hb-topbtn" onClick={leave}>🚪 Kalk</button>}
          {live && <button className="hb-topbtn" onClick={stopLive}>⏹️ Yayını kapat</button>}
        </div>
      )}
      {arcade && sess && (
        <Suspense fallback={null}>
          <ArcadeHub onClose={() => setArcade(false)} />
        </Suspense>
      )}
      {chair && !live && (
        <Layer onClose={() => setPanel(null)}>
          <div className="bz vn-panel">
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>🔴 Yayın aç</h3>
                <p>Dakikası {fmt(NET_MINUTE_PRICE.stream)} altın. Kamera hazır.</p>
              </div>
              <button className="bz-x" onClick={() => setPanel(null)}>✕</button>
            </div>
            <input className="hh-input" value={title} maxLength={60} placeholder="Yayın başlığı" onChange={(e) => setTitle(e.target.value)} />
            <button className="bz-btn primary" disabled={busy} onClick={goLive}>🔴 Yayına başla</button>
          </div>
        </Layer>
      )}
      {busy && !chair && <div className="hb-topbtns"><span className="hb-topbtn">…</span></div>}
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
