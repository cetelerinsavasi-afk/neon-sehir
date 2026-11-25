// =============================================================================
// v196 — şehirde açılan oyunun mekânları: Cafe · Bar · İnternet Kafe · Spor Salonu · Liman & Depo
// Mekâna girilince üstte paneller (TopBtns). Sunucu: oyunun belgeleri houses/game_cafe | game_bar |
// game_internet | game_spor | game_depo (fiyatlar sabit — functions/v196Shared.js).
// Bu mekânlar "hafif": konum kaydı (interiorPresence) yazılmaz.
// =============================================================================
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import MenuPanel from '../Venue/MenuPanel';
import GymPanel from '../Gym/GymPanel';
import GymMiniGame from '../Gym/GymMiniGame';
import GymResult from '../Gym/GymResult';
import TaskTree from '../Gym/TaskTree';
import { EQUIP } from '../Gym/gymMeta';
import { useMyGymMembership } from '../../hooks/useGym';
import { DepoTradeSheet } from '../Depo/DepoPanels';
import { NET_MINUTE_PRICE, GAME_VENUE_HOUSES } from '../../../functions/v196Shared.js';
import '../../styles/bizui.css';

const ArcadeHub = lazy(() => import('../Arcade/ArcadeHub'));
const CityStreamHost = lazy(() => import('../Stream/CityStreamHost'));
// oyunun mekân belgeleri (houses/game_*) oturumda BİR kez denetlenir (her mekân girişinde ~10 okuma yerine)
let gameVenuesEnsured = false;
function ensureGameVenues() {
  if (gameVenuesEnsured) return;
  gameVenuesEnsured = true;
  shopAction({ op: 'venueEnsureGame' }).catch(() => {
    gameVenuesEnsured = false;
  });
}
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
  return function MenuPart({ panel, setPanel, walk, flash, engineRef }) {
    const id = `game_${type}`;
    useEffect(() => {
      ensureGameVenues();
    }, []);
    return (
      <>
        <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'menu', label: `🧾 ${label} menüsü` }]} />
        {panel === 'menu' && (
          <Layer onClose={() => setPanel(null)}>
            <MenuPanel
              houseId={id}
              houseDoc={gameDoc(id, type)}
              onClose={() => setPanel(null)}
              onBought={(r) => {
                // v198: "geldi" yazıp hiçbir şey gelmiyordu — garson ürünü getirir, gelince elinde olur
                setPanel(null);
                const eng = engineRef?.current;
                if (eng?.deliver && r?.product) {
                  eng.deliver(`npc_bot_${type}`, r.product);
                  flash?.(`🍽️ ${r?.label || 'Sipariş'} hazırlanıyor — garson getiriyor`);
                } else {
                  eng?.setHolding?.(r?.product);
                  flash?.(`${r?.label || 'Ürün'} geldi. Afiyet olsun.`);
                }
              }}
            />
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
export function NetKafePart({ panel, setPanel, flash, engineRef }) {
  const [sess, setSess] = useState(null); // { id, until }
  const [busy, setBusy] = useState(false);
  const [arcade, setArcade] = useState(false);
  const [streamChair, setStreamChair] = useState(null); // yayın: koltuk kimliği (yayın paneli açık)
  const tickRef = useRef(null);
  const houseId = 'game_internet';
  useEffect(() => {
    ensureGameVenues();
  }, []);
  const leave = useCallback(() => {
    shopAction({ op: 'netLeave', houseId }).catch(() => {});
    setSess(null);
    setArcade(false);
  }, []);
  useEffect(() => {
    if (!sess) return undefined;
    tickRef.current = setInterval(async () => {
      try {
        const r = await shopAction({ op: 'netTick', houseId });
        if (r?.stopped) {
          setSess(null);
          setArcade(false);
          flash?.('⏱️ Süren bitti.');
        } else if (r?.creditUntilMs) setSess((s) => (s ? { ...s, until: r.creditUntilMs } : s));
      } catch (e) {
        flash?.(e?.message || 'Bağlantı koptu.');
        setSess(null);
        setArcade(false);
      }
    }, 20_000);
    return () => clearInterval(tickRef.current);
  }, [sess, flash]);
  useEffect(() => () => shopAction({ op: 'netLeave', houseId }).catch(() => {}), []);
  // v202: kalan süre sayacı (bisiklet kiralamadaki gibi) — sunucunun creditUntilMs'i; Date.now() sunucu saatine göre
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!sess?.until) return undefined;
    const step = () => setLeft(Math.max(0, Math.ceil((sess.until - Date.now()) / 1000)));
    step();
    const iv = setInterval(step, 1000);
    return () => clearInterval(iv);
  }, [sess?.until]);
  // v202: oyun / yayın açıkken avatar koltuktan kalkmasın (ok tuşları oyuna gider)
  const holding = Boolean(sess || streamChair);
  useEffect(() => {
    const eng = engineRef?.current?.cityEng?.();
    if (!eng?.seatHold) return undefined;
    eng.seatHold('netkafe', holding);
    return () => eng.seatHold('netkafe', false);
  }, [holding, engineRef]);
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
  // yayın seti koltuğu: stream:<koltuk> → tam yayın (başlık, sohbet, izleyiciler, bağış, oyun)
  useEffect(() => {
    if (!panel || !panel.startsWith('stream:')) return;
    setPanel(null);
    if (sess) leave();
    setStreamChair(panel.slice(7));
  }, [panel, setPanel, sess, leave]);
  return (
    <>
      {sess && !streamChair && (
        <div className="cs-rent-chip" style={{ position: 'fixed', zIndex: 6000 }} aria-live="off">
          🖥️ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </div>
      )}
      {sess && !streamChair && (
        <div className="hb-topbtns">
          <button className="hb-topbtn" onClick={() => setArcade(true)}>🎮 Oyna · {deviceName(sess.id)}</button>
          <button className="hb-topbtn" onClick={leave}>🚪 Kalk</button>
        </div>
      )}
      {arcade && sess && (
        <Suspense fallback={null}>
          <ArcadeHub onClose={() => setArcade(false)} />
        </Suspense>
      )}
      {streamChair && (
        <Suspense fallback={null}>
          <CityStreamHost
            eng={engineRef?.current?.cityEng?.() || null}
            houseId={houseId}
            room="netkafe"
            items={GAME_VENUE_HOUSES.internet.items}
            chairId={streamChair}
            price={NET_MINUTE_PRICE.stream}
            flash={flash}
            onClose={() => setStreamChair(null)}
          />
        </Suspense>
      )}
      {busy && <div className="hb-topbtns"><span className="hb-topbtn">…</span></div>}
    </>
  );
}

// ── SPOR SALONU ────────────────────────────────────────────────────────────────
// v197: üyelik alınınca antrenman şehirdeki salonda yapılır (3 görev: sağ üstte görev ağacı,
// sıradaki alet düğmesi → mini oyun). Eskiden üyelik sonrası antrenman açılmıyordu.
// v198: sıradaki görevin aletine (ör. boks torbası) yaklaşınca alt ortada "⭐ Görev" düğmesi çıkar
// (şehir istasyonu train_<alet>; diğer aletlerde düğme gizli). Sol üstteki düğme de çalışır.
export function SporPart({ panel, setPanel, walk, hideActRef }) {
  const { active } = useMyGymMembership();
  const gym = active && active.gymId === 'game_spor' && active.step < 3 ? active : null;
  const cur = gym ? gym.tasks[gym.step] : null;
  const [game, setGame] = useState(null);
  const [result, setResult] = useState(null);
  const items = gym && cur ? [{ panel: 'train', label: `${EQUIP[cur]?.icon || '💪'} ${EQUIP[cur]?.name || 'Antrenman'} (${gym.step + 1}/3)` }] : [{ panel: 'gym', label: '🏋️ Günlük üyelik' }];
  const curRef = useRef(cur);
  curRef.current = game ? null : cur;
  useEffect(() => {
    if (!hideActRef) return undefined;
    hideActRef.current = (act) => typeof act === 'string' && act.startsWith('train_') && act !== `train_${curRef.current}`;
    return () => {
      hideActRef.current = null;
    };
  }, [hideActRef]);
  useEffect(() => {
    if ((panel === 'train' || panel === `train_${cur}`) && cur) {
      setGame(cur);
      setPanel(null);
    } else if (typeof panel === 'string' && panel.startsWith('train_')) setPanel(null);
  }, [panel, cur, setPanel]);
  return (
    <>
      <TopBtns show={walk && !panel && !game} setPanel={setPanel} items={items} />
      {gym && walk && !game && <TaskTree membership={gym} onTapCurrent={(k) => setGame(k)} />}
      {panel === 'gym' && (
        <Layer onClose={() => setPanel(null)}>
          <GymPanel houseId="game_spor" houseDoc={gameDoc('game_spor', 'spor')} onClose={() => setPanel(null)} onStarted={() => setPanel(null)} />
        </Layer>
      )}
      {game && (
        <Layer onClose={() => setGame(null)}>
          <div className="wk-sheet">
            <GymMiniGame
              key={game}
              equipment={game}
              onDone={(r) => {
                setGame(null);
                if (r?.done) setResult(r);
              }}
              onClose={() => setGame(null)}
            />
          </div>
        </Layer>
      )}
      {result && <GymResult result={result} onClose={() => setResult(null)} />}
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
