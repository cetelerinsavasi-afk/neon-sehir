import { useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useImamState } from '../../hooks/useImamState';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { useBeggars } from '../../hooks/useBeggars';
import { useDailyActions } from '../../hooks/useDailyActions';
import { useInventory } from '../../hooks/useInventory';
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
import VehicleGalleryScreen from '../VehicleGalleryScreen/VehicleGalleryScreen';
import WeaponShopScreen from '../WeaponShopScreen/WeaponShopScreen';
import Workshop from '../Workshop/Workshop';
import GarageScreen from '../GarageScreen/GarageScreen';
import ResultModal from '../ResultModal/ResultModal';
import InfoIcon from '../InfoIcon/InfoIcon';
import HeldIcon from '../HouseScreen/HeldIcon';
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

function Menu({ show, children }) {
  if (!show) return null;
  return <div className="v3-menu">{children}</div>;
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
    const list = [];
    if (imam) {
      const sermon = gaveSermonToday(imam);
      list.push({
        id: 'npc_imam',
        name: `İmam ${imam.displayName || ''}`.trim(),
        av: imam.avatar || {},
        x: sermon ? 2.6 : 0,
        z: sermon ? -4.3 : -5.75,
        station: 'cm_mih',
        lines: sermon && imam.lastNasihat ? [imam.lastNasihat] : ['Namaza gelin.', 'Cemaatle kılınan namaz daha faziletlidir.'],
      });
    }
    (beggars || []).slice(0, 3).forEach((b, i) => {
      list.push({
        id: `npc_dil_${b.id}`,
        name: `🤲 ${b.displayName || 'Dilenci'}`,
        av: b.avatar || {},
        x: -7.8 + i,
        z: 5.6,
        seat: `cm_dm${i + 1}:0`,
        station: 'cm_bk',
        lines: ['Allah rızası için…', 'Hayrınıza bir yardım…', 'Allah razı olsun.'],
      });
    });
    setDynNpcs(list);
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
      <Menu show={walk}>
        <button className="v3-btn" onClick={() => setPanel('imam')}>
          {imam ? `🕌 İmam: ${imam.displayName}` : '🕌 İmamlık Başvurusu'}
        </button>
        <button className="v3-btn" onClick={() => setBooklet(true)}>
          📖 İmam Kitapçığı
        </button>
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

// ── KARAKOL ────────────────────────────────────────────────────────────────────
export function KarakolPart({ panel, setPanel }) {
  if (panel !== 'bribe' && panel !== 'commissioner') return null;
  return (
    <Sheet title={panel === 'bribe' ? '👮 Karakol Girişi — Memur' : '🎖️ Komiser Ofisi'} onClose={() => setPanel(null)} closeLabel={panel === 'bribe' ? 'Memurdan Uzaklaş' : 'Ofisten Çık'}>
      <PoliceStationScreen mode={panel} />
    </Sheet>
  );
}

// ── ARABA GALERİSİ ─────────────────────────────────────────────────────────────
export function GaleriPart({ panel, setPanel, onOpenHeist, walk }) {
  return (
    <>
      <Menu show={walk}>
        <HeistBtn onOpenHeist={onOpenHeist} target="araba_galerisi" />
      </Menu>
      {panel === 'gallery' && (
        <Sheet title="🚗 Araba Galerisi — Güncel Fiyat Listesi" onClose={() => setPanel(null)} closeLabel="Galericiden Uzaklaş">
          <VehicleGalleryScreen />
        </Sheet>
      )}
    </>
  );
}

// ── SİLAH MAĞAZASI ─────────────────────────────────────────────────────────────
export function SilahPart({ panel, setPanel }) {
  const [tab, setTab] = useState('buy');
  useEffect(() => {
    if (panel === 'workshop') setTab('workshop');
    else if (panel === 'weapon') setTab('buy');
  }, [panel]);
  if (panel !== 'weapon' && panel !== 'workshop') return null;
  return (
    <Sheet title="🔫 Neon Silah Mağazası" onClose={() => setPanel(null)} closeLabel="Tezgahtan Uzaklaş">
      <div className="bz-tabs ws-shop-tabs">
        <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>
          🔫 Satılık silahlar
        </button>
        <button className={tab === 'workshop' ? 'on' : ''} onClick={() => setTab('workshop')}>
          🛠️ Tamir / Geliştirme
        </button>
      </div>
      {tab === 'buy' ? <WeaponShopScreen /> : <Workshop shop={{ kind: 'game', type: 'silahci' }} />}
    </Sheet>
  );
}

// ── MODİFİYE GARAJI ────────────────────────────────────────────────────────────
export function ModifiyePart({ panel, setPanel, onOpenHeist, walk }) {
  return (
    <>
      <Menu show={walk}>
        <HeistBtn onOpenHeist={onOpenHeist} target="modifiye_garaji" />
      </Menu>
      {panel === 'garage' && (
        <Sheet title="🔧 Modifiye Garajı — Usta" onClose={() => setPanel(null)} closeLabel="Ustadan Uzaklaş">
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
const PARK_SELL_PRICE = 5000;
export function ParkPart({ panel, setPanel, flash }) {
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
  const sell = async () => {
    setBusy('sell');
    setErr(null);
    try {
      const r = await sellContrabandAtPark();
      setSellResult(r.data);
    } catch (e) {
      setErr(e?.message || 'Satış başarısız.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
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
          <p className="ws-hint">
            Sahip olduğun kaçak mal: <strong>{qty} adet</strong> · Satış fiyatı {fmt(PARK_SELL_PRICE)} altın/adet
            <InfoIcon text="Her satışta o anki şüphe yüzden kadar ihtimalle polis seni yakalayabilir. Yakalanırsan kazanacağın altın yerine aynı miktar devlete borç yazılır. Her satış şüpheni +5 artırır. Polisen, yakalanırsan ceza 2 katı olur." />
          </p>
          <button className="ws-panel-btn primary" disabled={busy === 'sell' || qty < 1} onClick={sell}>
            {busy === 'sell' ? 'Satılıyor…' : qty < 1 ? 'Malın yok' : 'Sat (1 adet)'}
          </button>
          {err && <p className="ws-error">{err}</p>}
        </Sheet>
      )}
      {sellResult && (
        <ResultModal
          title={sellResult.caught ? 'Yakalandın!' : 'Satış Başarılı! 🎉'}
          message={
            sellResult.caught
              ? `${fmt(sellResult.penalty)} altın devlete borç yazıldı.`
              : sellResult.debtRepaid > 0
                ? `${fmt(sellResult.earned)} altına sattın. ${fmt(sellResult.debtRepaid)} altın borçlarına gitti.`
                : `+${fmt(sellResult.earned)} altın kazandın.`
          }
          tone={sellResult.caught ? 'fail' : 'success'}
          onClose={() => setSellResult(null)}
        />
      )}
    </>
  );
}
