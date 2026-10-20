import { useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useImamState } from '../../hooks/useImamState';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { useBeggars } from '../../hooks/useBeggars';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useInventory } from '../../hooks/useInventory';
import { usePlayer } from '../../hooks/usePlayer';
import { prayAtMosque, buyFromGazinoBar, leaveOnNumaraTable, buyFromBufe, sellContrabandAtPark } from '../../services/gameActions';
import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ImamBooklet from '../ImamBooklet/ImamBooklet';
import { ImamPanel, BeggarsSection, WINDOW_HOURS } from '../MosqueScreen/MosqueScreen';
import BankScreen from '../BankScreen/BankScreen';
import SlotScreen from '../SlotScreen/SlotScreen';
import LotteryScreen from '../LotteryScreen/LotteryScreen';
import OnNumaraScreen from '../OnNumaraScreen/OnNumaraScreen';
import OnNumaraTable from '../OnNumaraScreen/OnNumaraTable';
import PoliceStationScreen from '../PoliceStationScreen/PoliceStationScreen';
import PoliceBooklet from '../PoliceBooklet/PoliceBooklet';
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import Workshop from '../Workshop/Workshop';
import GarageScreen from '../GarageScreen/GarageScreen';
import ResultModal from '../ResultModal/ResultModal';
import ShadyDealPanel from '../ShadyDeal/ShadyDealPanel';
import { shadyResultView } from '../ShadyDeal/shadyDeal';
import HeldIcon from '../HouseScreen/HeldIcon';
import { camiiDynamicNpcs } from '../../../functions/venueLayouts.js';
import '../../styles/bizui.css';

// =============================================================================
// v92 Faz 8 — mekânlara özel parçalar: üst menü butonları + paneller.
// Paneller eski 2D mekândakilerin aynısı (aynı bileşenler, aynı sunucu
// işlemleri); sadece kabuk 3D ev ekranının alt sayfası.
// =============================================================================

function Sheet({ title, onClose, children, closeLabel = 'Uzaklaş' }) {
  return (
    <div className="wk-sheet-bg" onClick={onClose}>
      <div className="wk-sheet v3-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="v3-sheet-head">
          <b>{title}</b>
          <button className="bz-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        {children}
        <button className="ws-panel-btn" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

function Menu({ show, children, right = false }) {
  if (!show) return null;
  return <div className={`v3-menu${right ? ' right' : ''}`}>{children}</div>;
}

// v93 — camii ve parkta şüphe göstergesi
function SuspicionBadge() {
  const { player } = usePlayer();
  const v = Math.max(0, Math.round(Number(player?.suspicion) || 0));
  return (
    <span className={`v3-badge v3-sus${v >= 50 ? ' hi' : v >= 20 ? ' mid' : ''}`}>
      🕵️ Şüphe <b>%{v}</b>
    </span>
  );
}

function HeistBtn({ onOpenHeist, target }) {
  if (!onOpenHeist) return null;
  return (
    <button className="v3-btn heist" onClick={() => onOpenHeist(target)}>
      🦹 Soygun
    </button>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
function istanbulDateKey(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function gaveSermonToday(imam) {
  const at = imam?.lastNasihatAt?.toDate?.() ?? null;
  return Boolean(at) && istanbulDateKey(at) === istanbulDateKey(new Date());
}

// ── CAMİİ ──────────────────────────────────────────────────────────────────────
export function CamiiPart({ panel, setPanel, setDynNpcs, walk }) {
  const { user } = useAuth();
  const { imam } = useImamState();
  const { members, window: win } = useMosqueAttendance();
  const { beggars } = useBeggars();
  const { actions } = useDailyActions();
  const [booklet, setBooklet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const prayed = Boolean(actions?.prayedWindows?.[win]);

  // imam (varsa) mihrapta — bugün nasihat verdiyse minberin önünde; dilenciler köşede minderlerde
  useEffect(() => {
    // v95.3: liste sunucuyla ortak (fotoğrafta da aynısı çizilir)
    setDynNpcs(camiiDynamicNpcs({ imam, sermon: gaveSermonToday(imam), beggars }));
  }, [imam, beggars, setDynNpcs]);

  const pray = async () => {
    setBusy(true);
    setErr(null);
    try {
      await prayAtMosque();
    } catch (e) {
      setErr(e?.message || 'İbadet edilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* v94: imam butonları sağ üstte */}
      <Menu show={walk} right>
        <button className="v3-btn" onClick={() => setPanel('imam')}>
          {imam ? `🕌 İmam: ${imam.displayName}` : '🕌 İmamlık Başvurusu'}
        </button>
        <button className="v3-btn" onClick={() => setBooklet(true)}>
          📖 İmam Kitapçığı
        </button>
      </Menu>
      <Menu show={walk}>
        <SuspicionBadge />
        <button className="v3-btn" onClick={() => setPanel('congregation')}>
          📿 {win}. Vakit Cemaati ({members.length})
        </button>
        {user && !prayed && (
          <button className="v3-btn primary" disabled={busy} onClick={pray}>
            {busy ? 'İbadet ediliyor…' : '🤲 İbadet Et'}
          </button>
        )}
        {err && <span className="v3-err">{err}</span>}
      </Menu>
      {booklet && <ImamBooklet onClose={() => setBooklet(false)} />}
      {panel === 'imam' && (
        <Sheet title="🕌 Mihrap — İbadet ve İmam" onClose={() => setPanel(null)}>
          <SimpleActionScreen
            signInMessage="İbadet etmek için giriş yapmalısın."
            description={`Günde 5 vakit (${WINDOW_HOURS[win]} şu an ${win}. vakit) ibadet ederek her seferinde şüpheni 5 azaltıp saygınlık kazanabilirsin. Ücretsiz.`}
            buttonLabel="İbadet Et (Şüphe -5, Saygınlık +)"
            doneLabel="Bu vakitte zaten ibadet ettin"
            isDone={(a) => Boolean(a.prayedWindows?.[win])}
            actionFn={prayAtMosque}
          />
          <ImamPanel />
        </Sheet>
      )}
      {panel === 'beggars' && (
        <Sheet title="🤲 Dilenciler" onClose={() => setPanel(null)}>
          <BeggarsSection />
        </Sheet>
      )}
      {panel === 'congregation' && (
        <Sheet title={`📿 ${win}. Vakitteki Cemaat (${members.length})`} onClose={() => setPanel(null)} closeLabel="Kapat">
          <div className="mosque-congregation-list">
            {members.length === 0 && <p className="mosque-hint">Bu vakitte henüz ibadet eden yok.</p>}
            {members.map((m) => (
              <div key={m.id} className="mosque-member">
                <AvatarSvg avatar={m.avatar} size={30} rounded />
                <span>{m.displayName}</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

// ── BANKA ──────────────────────────────────────────────────────────────────────
const TELLERS = [
  { npc: 'npc_vezne1', label: 'Vezne 1' },
  { npc: 'npc_vezne2', label: 'Vezne 2' },
  { npc: 'npc_vezne3', label: 'Vezne 3' },
];
export function BankaPart({ panel, setPanel, engineRef, onOpenHeist, flash, walk }) {
  const [myNumber, setMyNumber] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (panel !== 'number') return;
    setPanel(null);
    if (myNumber != null) {
      flash?.(`🎫 Numaran zaten var: ${pad2(myNumber)}`);
      return;
    }
    const n = 10 + Math.floor(Math.random() * 90);
    setMyNumber(n);
    flash?.(`🎫 Numaran: ${pad2(n)} — çağrılınca veznelerden birine git.`);
    timers.current.push(
      setTimeout(() => {
        const t = TELLERS[Math.floor(Math.random() * TELLERS.length)];
        engineRef.current?.say(t.npc, `Sıra ${pad2(n)}!`);
        flash?.(`🔔 Sıra sende (${pad2(n)}) — ${t.label}`);
        timers.current.push(setTimeout(() => setMyNumber(null), 8000));
      }, 10_000)
    );
  }, [panel, myNumber, setPanel, flash, engineRef]);
  return (
    <>
      <Menu show={walk}>
        <HeistBtn onOpenHeist={onOpenHeist} target="banka" />
        {myNumber != null && (
          <span className="v3-badge">
            🎫 Numaran: <b>{pad2(myNumber)}</b>
          </span>
        )}
      </Menu>
      {panel === 'bank' && (
        <Sheet title="🏦 Vezne — Parara Bank" onClose={() => setPanel(null)} closeLabel="Veznedarlardan Uzaklaş">
          <BankScreen />
        </Sheet>
      )}
    </>
  );
}

// ── GAZİNO ─────────────────────────────────────────────────────────────────────
// v64 fiyatları (sunucudaki GAZINO_BAR_PRICES ile aynı)
const BAR_MENU = [
  { id: 'cay', label: 'Çay', price: 100 },
  { id: 'kahve', label: 'Kahve', price: 500 },
  { id: 'kokteyl', label: 'Kokteyl', price: 1000 },
];
export function GazinoPart({ panel, setPanel, onOpenHeist, flash, walk }) {
  const { user } = useAuth();
  const [tableId, setTableId] = useState(null);
  const tableRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [barErr, setBarErr] = useState(null);
  useEffect(() => {
    tableRef.current = tableId;
    if (!user) return;
    // diğer oyuncular "10 Numara oynuyor" görsün (eski 2D kaydı)
    setDoc(doc(db, 'interiorPresence', user.uid), { activity: tableId ? 'onnumara' : null, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [tableId, user]);
  // masadan çıkmadan paneli kapatınca / mekândan çıkınca masadan da kalkılır
  useEffect(() => {
    if (panel !== 'onnumara' && tableRef.current) {
      const tid = tableRef.current;
      tableRef.current = null;
      setTableId(null);
      leaveOnNumaraTable(tid).catch(() => {});
    }
  }, [panel]);
  useEffect(
    () => () => {
      if (tableRef.current) leaveOnNumaraTable(tableRef.current).catch(() => {});
    },
    []
  );
  const buy = async (item) => {
    setBusy(item.id);
    setBarErr(null);
    try {
      await buyFromGazinoBar(item.id);
      flash?.(`🍸 ${item.label} elinde (2 dk) · −${fmt(item.price)}`);
      setPanel(null);
    } catch (e) {
      setBarErr(e?.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Menu show={walk}>
        <HeistBtn onOpenHeist={onOpenHeist} target="casino" />
      </Menu>
      {panel === 'slot' && (
        <Sheet title="🎰 Slot Makinesi" onClose={() => setPanel(null)}>
          <SlotScreen />
        </Sheet>
      )}
      {panel === 'piyango' && (
        <Sheet title="🎟️ Piyango Bileti" onClose={() => setPanel(null)}>
          <LotteryScreen />
        </Sheet>
      )}
      {panel === 'onnumara' && (
        <Sheet title="🃏 10 Numara Masası" onClose={() => setPanel(null)}>
          {tableId ? <OnNumaraTable tableId={tableId} myUid={user?.uid} onLeave={() => setTableId(null)} /> : <OnNumaraScreen onEnterTable={(id) => setTableId(id)} />}
        </Sheet>
      )}
      {panel === 'bar' && (
        <Sheet title="🍸 Bar" onClose={() => setPanel(null)}>
          <div className="v3-menu-grid">
            {BAR_MENU.map((item) => (
              <button key={item.id} className="v3-item" disabled={busy === item.id} onClick={() => buy(item)}>
                <HeldIcon product={item.id} size={40} />
                <span>{item.label}</span>
                <em>
                  <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {fmt(item.price)}
                </em>
              </button>
            ))}
          </div>
          {barErr && <p className="ws-error">{barErr}</p>}
        </Sheet>
      )}
    </>
  );
}

// Oyuncu dükkânlarındaki gibi üstte (sağda) hızlı butonlar — tezgâha yürümeden açılır
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

// ── KARAKOL ────────────────────────────────────────────────────────────────────
// Sol üstte (camiideki gibi): Polislik Başvurusu · Polis Kitapçığı · Rüşvet Ver
export function KarakolPart({ panel, setPanel, walk }) {
  const [booklet, setBooklet] = useState(false);
  return (
    <>
      <Menu show={walk}>
        <button className="v3-btn" onClick={() => setPanel('application')}>
          👮 Polislik Başvurusu
        </button>
        <button className="v3-btn" onClick={() => setBooklet(true)}>
          📘 Polis Kitapçığı
        </button>
        <button className="v3-btn" onClick={() => setPanel('bribe')}>
          🤝 Rüşvet Ver
        </button>
      </Menu>
      {booklet && <PoliceBooklet onClose={() => setBooklet(false)} />}
      {(panel === 'bribe' || panel === 'application') && (
        <Sheet
          title={panel === 'bribe' ? '👮 Karakol Girişi — Memur' : '🎖️ Komiser Ofisi — Polislik Başvurusu'}
          onClose={() => setPanel(null)}
          closeLabel={panel === 'bribe' ? 'Memurdan Uzaklaş' : 'Ofisten Çık'}
        >
          <PoliceStationScreen mode={panel} />
        </Sheet>
      )}
    </>
  );
}

// ── ARABA GALERİSİ ─────────────────────────────────────────────────────────────
export function GaleriPart({ panel, setPanel, onOpenHeist, walk }) {
  return (
    <>
      <Menu show={walk}>
        <HeistBtn onOpenHeist={onOpenHeist} target="araba_galerisi" />
      </Menu>
      <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'gallery', label: '🚗 Satılık arabalar' }]} />
      {panel === 'gallery' && (
        <Sheet title="🚗 Araba Galerisi — Güncel Fiyat Listesi" onClose={() => setPanel(null)} closeLabel="Galericiden Uzaklaş">
          <VehicleGalleryScreen />
        </Sheet>
      )}
    </>
  );
}

// ── SİLAH MAĞAZASI ─────────────────────────────────────────────────────────────
export function SilahPart({ panel, setPanel, walk }) {
  const open = panel === 'weapon' || panel === 'workshop';
  return (
    <>
      <TopBtns
        show={walk && !panel}
        setPanel={setPanel}
        items={[
          { panel: 'weapon', label: '🔫 Satılık silahlar' },
          { panel: 'workshop', label: '🛠️ Tamir / Geliştirme' },
        ]}
      />
      {open && (
        <Sheet title="🔫 Neon Silah Mağazası" onClose={() => setPanel(null)} closeLabel="Tezgahtan Uzaklaş">
          <div className="bz-tabs ws-shop-tabs">
            <button className={panel === 'weapon' ? 'on' : ''} onClick={() => setPanel('weapon')}>
              🔫 Satılık silahlar
            </button>
            <button className={panel === 'workshop' ? 'on' : ''} onClick={() => setPanel('workshop')}>
              🛠️ Tamir / Geliştirme
            </button>
          </div>
          {panel === 'weapon' ? <WeaponShopScreen /> : <Workshop shop={{ kind: 'game', type: 'silahci' }} />}
        </Sheet>
      )}
    </>
  );
}

// ── MODİFİYE GARAJI ────────────────────────────────────────────────────────────
export function ModifiyePart({ panel, setPanel, onOpenHeist, walk }) {
  return (
    <>
      <Menu show={walk}>
        <HeistBtn onOpenHeist={onOpenHeist} target="modifiye_garaji" />
      </Menu>
      <TopBtns show={walk && !panel} setPanel={setPanel} items={[{ panel: 'garage', label: '🛠️ Tamir / Geliştirme' }]} />
      {panel === 'garage' && (
        <Sheet title="🔧 Modifiye Garajı — Tamir / Geliştirme" onClose={() => setPanel(null)} closeLabel="Ustadan Uzaklaş">
          <GarageScreen />
        </Sheet>
      )}
    </>
  );
}

// ── PARK ───────────────────────────────────────────────────────────────────────
// v64 fiyatları (sunucudaki BUFE_PRICES ile aynı)
const BUFE_MENU = [
  { id: 'sosisli', label: 'Sosisli', price: 200 },
  { id: 'tost', label: 'Tost', price: 300 },
  { id: 'cay', label: 'Çay', price: 20 },
  { id: 'kahve', label: 'Kahve', price: 100 },
  { id: 'oralet', label: 'Oralet', price: 40 },
  { id: 'latte', label: 'Latte', price: 500 },
];
export function ParkPart({ panel, setPanel, flash, walk }) {
  const { inventory } = useInventory();
  const qty = inventory?.yasakliMadde || 0;
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [sellResult, setSellResult] = useState(null);
  const buy = async (item) => {
    setBusy(item.id);
    setErr(null);
    try {
      await buyFromBufe(item.id);
      flash?.(`${item.label} elinde (2 dk) · −${fmt(item.price)}`);
      setPanel(null);
    } catch (e) {
      setErr(e?.message || 'Satın alma başarısız.');
    } finally {
      setBusy(null);
    }
  };
  const sell = async (mode) => {
    setBusy(mode);
    setErr(null);
    try {
      const r = await sellContrabandAtPark(mode);
      setSellResult(r.data);
    } catch (e) {
      setErr(e?.message || 'Satış başarısız.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Menu show={walk}>
        <SuspicionBadge />
      </Menu>
      {panel === 'bufe' && (
        <Sheet title="🌭 Büfe" onClose={() => setPanel(null)} closeLabel="Kapat">
          <div className="v3-menu-grid">
            {BUFE_MENU.map((item) => (
              <button key={item.id} className="v3-item" disabled={busy === item.id} onClick={() => buy(item)}>
                <HeldIcon product={item.id} size={40} />
                <span>{item.label}</span>
                <em>
                  <span className="gold-coin-icon" style={{ width: 11, height: 11 }} /> {fmt(item.price)}
                </em>
              </button>
            ))}
          </div>
          {err && <p className="ws-error">{err}</p>}
        </Sheet>
      )}
      {panel === 'npc' && (
        <Sheet title="🕶️ Şüpheli Adam" onClose={() => setPanel(null)}>
          <ShadyDealPanel qty={qty} busy={busy === 'risky' || busy === 'safe' ? busy : null} onSell={sell} />
          {err && <p className="ws-error">{err}</p>}
        </Sheet>
      )}
      {sellResult && <ResultModal {...shadyResultView(sellResult)} onClose={() => setSellResult(null)} />}
    </>
  );
}
