import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { useParkPresence } from '../../hooks/useParkPresence';
import { enterPark, sellContrabandAtPark, buyFromBufe } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ResultModal from '../ResultModal/ResultModal';
import InfoIcon from '../InfoIcon/InfoIcon';
import './ParkWorldScreen.css';

// --- Dünya düzeni -----------------------------------------------------
// Sabit koordinat sistemi (piksel değil, "dünya birimi"). Kamera bu
// dünyanın bir bölümünü gösterip oyuncuyu takip eder.
const WORLD_W = 1200;
const WORLD_H = 800;
const PLAYER_SPEED = 230; // dünya birimi / saniye
const INTERACT_RADIUS = 95;
const CHAT_BUBBLE_MS = 6000;
const PARK_SELL_PRICE = 5000;

// --- Firebase maliyet ayarları -----------------------------------------
// Oyuncular %90 telefonda oynadığı ve konum senkronu SÜREKLİ çalışan bir
// şey olduğu için, buradaki sabitler doğrudan Firestore YAZMA/OKUMA
// (yani fatura) miktarını belirliyor. Mantık:
//   - Hareket ederken bile en fazla ~saniyede 3 kez yaz (300ms) VE
//     sadece gerçekten anlamlı bir mesafe kat edildiyse (MOVE_SYNC_DIST).
//   - Yürüyüş durduğu an son bir "idle" güncellemesi gönderip
//     durur — artık her karede yazmıyoruz.
//   - Dururken sadece "hâlâ buradayım" için seyrek bir nabız (heartbeat)
//     atılır — bu, diğer oyuncuların ekranında hayalet gibi kaybolmamak
//     için gereken minimum (bkz. useParkPresence STALE_MS).
//   - Sekme arka plana alındığında (uygulama minimize) senkron tamamen
//     durur.
const MOVE_SYNC_INTERVAL_MS = 300;
const MOVE_SYNC_MIN_DIST = 6; // dünya birimi
const IDLE_HEARTBEAT_MS = 12_000;

const BUFE_MENU = [
  { id: 'sosisli', label: 'Sosisli', price: 100, icon: '🌭' },
  { id: 'tost', label: 'Tost', price: 100, icon: '🥪' },
  { id: 'cay', label: 'Çay', price: 10, icon: '🍵' },
  { id: 'kahve', label: 'Kahve', price: 30, icon: '☕' },
  { id: 'oralet', label: 'Oralet', price: 20, icon: '🧃' },
  { id: 'latte', label: 'Latte', price: 500, icon: '🥤' },
];
const BUFE_ICON_BY_ID = Object.fromEntries(BUFE_MENU.map((m) => [m.id, m.icon]));

// Sahnedeki sabit nesneler — çarpışma kutusu (cx,cy,hw,hh) + etkileşim
// yarıçapı bu merkezden ölçülür.
const OBJECTS = [
  { id: 'bufe', kind: 'bufe', cx: 260, cy: 190, hw: 60, hh: 34, label: '🥤 Büfe' },
  { id: 'npc', kind: 'npc', cx: 950, cy: 230, hw: 26, hh: 26, label: '🕴️ Şüpheli Adam' },
  { id: 'bench1', kind: 'bench', cx: 210, cy: 560, hw: 44, hh: 16, label: '🪑 Bank' },
  { id: 'bench2', kind: 'bench', cx: 540, cy: 660, hw: 44, hh: 16, label: '🪑 Bank' },
  { id: 'bench3', kind: 'bench', cx: 860, cy: 580, hw: 44, hh: 16, label: '🪑 Bank' },
];

const PLAYER_HALF = 20; // oyuncu çarpışma yarı-genişliği
const JOYSTICK_RADIUS = 52;
// Joystick'i sadece ekranın alt bölgesinde başlatıyoruz — üst bölge
// (HUD altı) dokunulunca yanlışlıkla hareket başlamasın diye.
const JOYSTICK_ZONE_TOP_RATIO = 0.28;

function rectsOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

function resolveCollisions(x, y) {
  let nx = x;
  let ny = y;
  for (const o of OBJECTS) {
    if (o.kind === 'npc') continue; // NPC'ye yaklaşmak serbest, sadece bufe/bank katı
    if (rectsOverlap(nx, ny, PLAYER_HALF, PLAYER_HALF, o.cx, o.cy, o.hw, o.hh)) {
      const dx = nx - o.cx;
      const dy = ny - o.cy;
      const overlapX = o.hw + PLAYER_HALF - Math.abs(dx);
      const overlapY = o.hh + PLAYER_HALF - Math.abs(dy);
      if (overlapX < overlapY) {
        nx = o.cx + Math.sign(dx || 1) * (o.hw + PLAYER_HALF);
      } else {
        ny = o.cy + Math.sign(dy || 1) * (o.hh + PLAYER_HALF);
      }
    }
  }
  nx = Math.max(PLAYER_HALF, Math.min(WORLD_W - PLAYER_HALF, nx));
  ny = Math.max(PLAYER_HALF, Math.min(WORLD_H - PLAYER_HALF, ny));
  return [nx, ny];
}

export default function ParkWorldScreen({ onExit }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const { others, updatePresence, clearPresence } = useParkPresence();

  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState({ x: 600, y: 400 });
  const [facing, setFacing] = useState('down');
  const [pose, setPose] = useState('idle');
  const [holding, setHolding] = useState(null);
  const [sittingOn, setSittingOn] = useState(null);
  const [panel, setPanel] = useState(null); // 'npc' | 'bufe' | null
  const [chatText, setChatText] = useState('');
  const [myBubble, setMyBubble] = useState(null); // { text, ts }
  const [sellBusy, setSellBusy] = useState(false);
  const [sellResult, setSellResult] = useState(null);
  const [bufeBusy, setBufeBusy] = useState(null);
  const [error, setError] = useState(null);
  const [viewport, setViewport] = useState({ w: 360, h: 640 });
  // Dokunmatik joystick'in ekranda göründüğü yer (parmağın ilk değdiği
  // nokta) ve topuzun o merkeze göre ofseti — sadece görsel.
  const [joyVisual, setJoyVisual] = useState(null); // { originX, originY, dx, dy }

  const posRef = useRef(pos);
  const sittingRef = useRef(null);
  const joyRef = useRef({ x: 0, y: 0 });
  const joyPointerId = useRef(null);
  const lastSyncRef = useRef(0);
  const lastSyncedPosRef = useRef(pos);
  const wasMovingRef = useRef(false);
  const pausedRef = useRef(false);
  const walkAnimRef = useRef(0);
  const containerRef = useRef(null);
  const holdingRef = useRef(holding);
  const facingRef = useRef(facing);

  useEffect(() => {
    holdingRef.current = holding;
  }, [holding]);
  useEffect(() => {
    facingRef.current = facing;
  }, [facing]);

  // Park'a giriş: sunucuda doğrulanmış ad/avatarı canlı-konum kaydına
  // kopyala (bkz. functions/index.js enterPark üstündeki not), başlangıç
  // pozisyonunu al. Çıkışta kaydı sil.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    enterPark()
      .then((res) => {
        if (cancelled) return;
        const start = res.data?.presence || { x: 600, y: 400 };
        posRef.current = start;
        lastSyncedPosRef.current = start;
        setPos(start);
        setReady(true);
      })
      .catch((err) => {
        console.error('Parka giriş hatası:', err);
        setError('Parka girilemedi. Tekrar dene.');
      });
    return () => {
      cancelled = true;
      if (user) clearPresence(user.uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setViewport({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Uygulama arka plana alınınca (sekme değişimi, telefon kilitlenmesi)
  // senkronu tamamen durdur — hem gereksiz Firestore yazımı hem de pil
  // tüketimi önlenir. Öne dönünce kaldığı yerden devam eder.
  useEffect(() => {
    const onVisibility = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Ana hareket döngüsü — kontrol SADECE dokunmatik joystick ile
  // (bu oyun büyük oranda telefonda oynanıyor; klavye desteği bilerek
  // eklenmedi).
  useEffect(() => {
    if (!ready) return undefined;
    let raf;
    let lastT = performance.now();

    const tick = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      let moving = false;
      if (!sittingRef.current) {
        const vx0 = joyRef.current.x;
        const vy0 = joyRef.current.y;
        const mag = Math.hypot(vx0, vy0);
        if (mag > 0.12) {
          moving = true;
          const vx = vx0 / Math.max(mag, 1);
          const vy = vy0 / Math.max(mag, 1);
          const [nx, ny] = resolveCollisions(
            posRef.current.x + vx * PLAYER_SPEED * dt,
            posRef.current.y + vy * PLAYER_SPEED * dt
          );
          posRef.current = { x: nx, y: ny };
          walkAnimRef.current += dt;
          const frame = Math.floor(walkAnimRef.current / 0.16) % 2 === 0 ? 'walk1' : 'walk2';
          setPose(frame);
          setFacing(Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up');
          setPos({ ...posRef.current });
        } else if (pose !== 'idle') {
          setPose('idle');
        }
      }

      // --- Firestore'a senkron: maliyeti kontrol altında tutan mantık.
      if (!pausedRef.current && user) {
        const p = posRef.current;
        const movedDist = Math.hypot(
          p.x - lastSyncedPosRef.current.x,
          p.y - lastSyncedPosRef.current.y
        );
        const sinceLast = t - lastSyncRef.current;

        if (moving) {
          // Hareket ederken: hem zaman hem mesafe eşiği aşılmadan yazma.
          if (sinceLast > MOVE_SYNC_INTERVAL_MS && movedDist > MOVE_SYNC_MIN_DIST) {
            lastSyncRef.current = t;
            lastSyncedPosRef.current = { ...p };
            updatePresence(user.uid, {
              x: p.x,
              y: p.y,
              facing: facingRef.current,
              pose: sittingRef.current ? 'sit' : pose,
              holding: holdingRef.current,
            });
          }
        } else if (wasMovingRef.current) {
          // Az önce durduk: son kesin konumu bir kez gönder, sonra
          // sessize geç (idle nabzı devralır).
          lastSyncRef.current = t;
          lastSyncedPosRef.current = { ...p };
          updatePresence(user.uid, {
            x: p.x,
            y: p.y,
            facing: facingRef.current,
            pose: sittingRef.current ? 'sit' : 'idle',
            holding: holdingRef.current,
          });
        } else if (sinceLast > IDLE_HEARTBEAT_MS) {
          // Uzun süredir hareketsiz: sadece "hâlâ buradayım" nabzı.
          lastSyncRef.current = t;
          updatePresence(user.uid, {
            x: p.x,
            y: p.y,
            facing: facingRef.current,
            pose: sittingRef.current ? 'sit' : 'idle',
            holding: holdingRef.current,
          });
        }
      }
      wasMovingRef.current = moving;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.uid]);

  useEffect(() => {
    sittingRef.current = sittingOn;
    // Oturma/kalkma anında ekonomiyle ilgisiz ama görsel açıdan önemli
    // bir değişiklik olduğu için tek seferlik bir güncelleme gönder.
    if (user && ready) {
      updatePresence(user.uid, {
        x: posRef.current.x,
        y: posRef.current.y,
        facing: facingRef.current,
        pose: sittingOn ? 'sit' : 'idle',
        holding: holdingRef.current,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sittingOn]);

  // Sohbet balonu belli bir süre sonra otomatik kaybolsun.
  useEffect(() => {
    if (!myBubble) return undefined;
    const id = setTimeout(() => setMyBubble(null), CHAT_BUBBLE_MS);
    return () => clearTimeout(id);
  }, [myBubble]);

  const nearest = useMemo(() => {
    let best = null;
    let bestDist = INTERACT_RADIUS;
    for (const o of OBJECTS) {
      const d = Math.hypot(pos.x - o.cx, pos.y - o.cy);
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    return best;
  }, [pos]);

  const camX = Math.max(0, Math.min(WORLD_W - viewport.w, pos.x - viewport.w / 2));
  const camY = Math.max(0, Math.min(WORLD_H - viewport.h, pos.y - viewport.h / 2));

  // --- Dokunmatik joystick: parmağın ekrana değdiği yerde belirir
  // (sabit köşe pedi değil) — telefonda tek elle rahatça kullanılsın
  // diye. Üst HUD/etkileşim düğmesi gibi elemanlara dokunulduğunda
  // devreye girmemesi için o elemanlar kendi onPointerDown'larında
  // stopPropagation çağırıyor.
  const handleViewportPointerDown = (e) => {
    if (joyPointerId.current !== null) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    if (localY < rect.height * JOYSTICK_ZONE_TOP_RATIO) return; // üst bölgeyi hariç tut
    joyPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setJoyVisual({ originX: e.clientX, originY: e.clientY, dx: 0, dy: 0 });
    joyRef.current = { x: 0, y: 0 };
  };

  const handleViewportPointerMove = (e) => {
    if (joyPointerId.current !== e.pointerId) return;
    setJoyVisual((cur) => {
      if (!cur) return cur;
      let dx = e.clientX - cur.originX;
      let dy = e.clientY - cur.originY;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      joyRef.current = { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS };
      return { ...cur, dx, dy };
    });
  };

  const endJoystick = (e) => {
    if (joyPointerId.current !== e.pointerId) return;
    joyPointerId.current = null;
    joyRef.current = { x: 0, y: 0 };
    setJoyVisual(null);
  };

  const handleInteract = () => {
    if (!nearest) return;
    if (nearest.kind === 'bench') {
      setSittingOn((cur) => (cur === nearest.id ? null : nearest.id));
      return;
    }
    setPanel(nearest.kind);
  };

  const handleSell = async () => {
    setSellBusy(true);
    setError(null);
    try {
      const res = await sellContrabandAtPark();
      setSellResult(res.data);
    } catch (err) {
      setError(err.message || 'Satış başarısız.');
    } finally {
      setSellBusy(false);
    }
  };

  const handleBuy = async (item) => {
    setBufeBusy(item.id);
    setError(null);
    try {
      await buyFromBufe(item.id);
      setHolding(item.id);
      if (user) {
        updatePresence(user.uid, {
          x: posRef.current.x,
          y: posRef.current.y,
          facing: facingRef.current,
          pose: sittingRef.current ? 'sit' : 'idle',
          holding: item.id,
        });
      }
    } catch (err) {
      setError(err.message || 'Satın alma başarısız.');
    } finally {
      setBufeBusy(null);
    }
  };

  const sendChat = () => {
    const text = chatText.trim();
    if (!text || !user) return;
    const ts = Date.now();
    setMyBubble({ text, ts });
    updatePresence(user.uid, {
      x: posRef.current.x,
      y: posRef.current.y,
      facing: facingRef.current,
      pose: sittingRef.current ? 'sit' : 'idle',
      holding: holdingRef.current,
      chatText: text,
      chatTs: ts,
    });
    setChatText('');
  };

  if (!user) {
    return (
      <div className="pw-fullscreen">
        <div className="pw-fullscreen-header">
          <span className="pw-fullscreen-title">🌳 Park</span>
          <button className="pw-fullscreen-close" onClick={onExit}>✕</button>
        </div>
        <p className="pw-hint" style={{ padding: 16 }}>Parkta gezmek için giriş yapmalısın.</p>
      </div>
    );
  }

  const contrabandQty = inventory.yasakliMadde || 0;
  const suspicion = player?.suspicion || 0;
  const myAvatar = player?.avatar;

  return (
    <div className="pw-fullscreen">
      <div className="pw-fullscreen-header">
        <span className="pw-fullscreen-title">🌳 Park</span>
        <div className="pw-hud">
          <span>💰 {(player?.gold ?? 0).toLocaleString('tr-TR')}</span>
          <span>⚠️ %{suspicion}</span>
        </div>
        <button className="pw-fullscreen-close" onClick={onExit}>✕</button>
      </div>

      <div
        className="pw-viewport"
        ref={containerRef}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={endJoystick}
        onPointerCancel={endJoystick}
      >
        {!ready && <div className="pw-loading">Parka giriliyor…</div>}
        {ready && (
          <div
            className="pw-world"
            style={{ width: WORLD_W, height: WORLD_H, transform: `translate(${-camX}px, ${-camY}px)` }}
          >
            {OBJECTS.map((o) => (
              <div
                key={o.id}
                className={`pw-object pw-object-${o.kind}`}
                style={{ left: o.cx, top: o.cy }}
                title={o.label}
              >
                {o.kind === 'bufe' && '🥤'}
                {o.kind === 'npc' && '🕴️'}
                {o.kind === 'bench' && '🪑'}
              </div>
            ))}

            {others.map((o) => (
              <div key={o.uid} className="pw-avatar" style={{ left: o.x, top: o.y }}>
                {o.chatText && o.chatTs && Date.now() - o.chatTs < CHAT_BUBBLE_MS && (
                  <div className="pw-bubble">{o.chatText}</div>
                )}
                <div className="pw-avatar-name">{o.displayName}</div>
                <div className="pw-avatar-body">
                  <AvatarSvg avatar={o.avatar} variant="full" pose={o.pose === 'sit' ? 'idle' : o.pose || 'idle'} />
                  {o.holding && BUFE_ICON_BY_ID[o.holding] && (
                    <span className="pw-held-item">{BUFE_ICON_BY_ID[o.holding]}</span>
                  )}
                </div>
              </div>
            ))}

            <div className="pw-avatar pw-avatar-self" style={{ left: pos.x, top: pos.y }}>
              {myBubble && Date.now() - myBubble.ts < CHAT_BUBBLE_MS && (
                <div className="pw-bubble">{myBubble.text}</div>
              )}
              <div className={`pw-avatar-body pw-facing-${facing}`}>
                <AvatarSvg avatar={myAvatar} variant="full" pose={sittingOn ? 'idle' : pose} />
                {holding && BUFE_ICON_BY_ID[holding] && (
                  <span className="pw-held-item">{BUFE_ICON_BY_ID[holding]}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {nearest && (
          <button
            className="pw-interact-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleInteract}
          >
            {nearest.kind === 'bench'
              ? sittingOn === nearest.id
                ? '🧍 Kalk'
                : '🪑 Otur'
              : nearest.label}
          </button>
        )}

        {joyVisual && (
          <div
            className="pw-joystick-base"
            style={{ left: joyVisual.originX, top: joyVisual.originY }}
          >
            <div
              className="pw-joystick-knob"
              style={{ transform: `translate(${joyVisual.dx}px, ${joyVisual.dy}px)` }}
            />
          </div>
        )}
        {!joyVisual && (
          <p className="pw-joystick-hint">Hareket etmek için ekranın alt kısmına parmağınla dokunup sürükle</p>
        )}
      </div>

      <div className="pw-chat-row">
        <input
          className="pw-chat-input"
          placeholder="Bir şey yaz…"
          value={chatText}
          maxLength={140}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
        />
        <button className="pw-chat-send" onClick={sendChat}>Gönder</button>
      </div>

      {error && <p className="pw-error">{error}</p>}

      {panel === 'npc' && (
        <div className="pw-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            <p className="pw-panel-title">🕴️ Şüpheli Adam</p>
            <p className="pw-hint">
              Sahip olduğun kaçak mal: <strong>{contrabandQty} adet</strong> · Satış fiyatı{' '}
              {PARK_SELL_PRICE.toLocaleString('tr-TR')} altın/adet
              <InfoIcon text="Her satışta o anki şüphe yüzden kadar ihtimalle polis seni yakalayabilir. Yakalanırsan kazanacağın altın yerine aynı miktar devlete borç yazılır. Her satış şüpheni +5 artırır." />
            </p>
            <button
              className="pw-panel-btn primary"
              disabled={sellBusy || contrabandQty < 1}
              onClick={handleSell}
            >
              {sellBusy ? 'Satılıyor…' : contrabandQty < 1 ? 'Malın yok' : 'Sat (1 adet)'}
            </button>
            <button className="pw-panel-btn" onClick={() => setPanel(null)}>Uzaklaş</button>
          </div>
        </div>
      )}

      {panel === 'bufe' && (
        <div className="pw-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="pw-panel" onClick={(e) => e.stopPropagation()}>
            <p className="pw-panel-title">🥤 Büfe</p>
            <div className="pw-bufe-grid">
              {BUFE_MENU.map((item) => (
                <button
                  key={item.id}
                  className="pw-bufe-item"
                  disabled={bufeBusy === item.id}
                  onClick={() => handleBuy(item)}
                >
                  <span className="pw-bufe-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="pw-bufe-price">{item.price.toLocaleString('tr-TR')} altın</span>
                </button>
              ))}
            </div>
            <button className="pw-panel-btn" onClick={() => setPanel(null)}>Kapat</button>
          </div>
        </div>
      )}

      {sellResult && (
        <ResultModal
          title={sellResult.caught ? 'Yakalandın!' : 'Satış Başarılı! 🎉'}
          message={
            sellResult.caught
              ? `${sellResult.penalty.toLocaleString('tr-TR')} altın devlete borç yazıldı.`
              : `+${sellResult.earned.toLocaleString('tr-TR')} altın kazandın.`
          }
          tone={sellResult.caught ? 'fail' : 'success'}
          onClose={() => setSellResult(null)}
        />
      )}
    </div>
  );
}
