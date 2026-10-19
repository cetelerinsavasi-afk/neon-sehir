import { lazy, Suspense, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useHouseList } from '../../hooks/useHouseList';
import { useOfficeList } from '../../hooks/useOfficeList';
import { houseAction } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { HOUSE_PRICE } from '../../../functions/houseCatalogData.js';
import { BIZ_TYPES } from '../../../functions/businessCatalogData.js';
import { houseKind, HOUSE_MIN_ITEMS, LEGACY_EMOJI } from '../../../functions/officeData.js';
import './HouseScreen.css';
import { useBackClose } from '../../lib/backStack';

// three.js ağır bir kütüphane — sadece bir eve GİRİLDİĞİNDE yüklenir.
const HouseScreen = lazy(() => import('./HouseScreen'));

const PRIVACY_LABEL = { public: '🌐 Herkese açık', friends: '👥 Arkadaşlar', private: '🔒 Gizli' };

export function HouseRow({ h, onEnter, mineRow }) {
  const kind = houseKind(h);
  const isOffice = kind === 'ofis';
  const icon = isOffice ? h.office?.emoji || LEGACY_EMOJI[h.bizType] || '🏢' : h.bizType && BIZ_TYPES[h.bizType] ? BIZ_TYPES[h.bizType].icon : '';
  return (
    <button className={`hh-row${mineRow ? ' mine' : ''}${isOffice ? ' office' : ''}`} onClick={() => onEnter(h.id)}>
      <span className="hh-avatar">
        <AvatarSvg avatar={h.ownerAvatar} size={42} rounded />
      </span>
      <span className="hh-info">
        <b>
          {icon ? `${icon} ` : ''}
          {h.name || `${h.ownerName || 'Oyuncu'}'in Evi`}
        </b>
        <span>
          {h.ownerName || 'Oyuncu'} · {isOffice ? 'Ofis' : h.bizType && BIZ_TYPES[h.bizType] ? BIZ_TYPES[h.bizType].label : PRIVACY_LABEL[h.privacy || 'public']}
          {h.invited && <em className="hh-invited"> · 💌 davetlisin</em>}
        </span>
      </span>
      <span className={`hh-count${h.people ? ' live' : ''}`}>
        <i />
        {h.people}
      </span>
    </button>
  );
}

// HouseHub — haritada "Ev"e tıklayınca açılan ekran: ev satın al, evlerim,
// girebileceğim evler. Bir eve girilince HouseScreen açılır.
export default function HouseHub({ onClose, initialHouseId = null }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [houseId, setHouseId] = useState(initialHouseId);
  // v73 — evin içindeyken ev listesi dinlenmez (maliyet)
  const list = useHouseList({ enabled: Boolean(user) && !houseId });
  // v100 — üç sekme: Ofisler (ücretli mobilyası olan) · Evler (10+ mobilya) · Depolar
  const [tab, setTabState] = useState(() => {
    try {
      return localStorage.getItem('ns_househub_tab') || 'ofis';
    } catch {
      return 'ofis';
    }
  });
  const setTab = (t) => {
    setTabState(t);
    try {
      localStorage.setItem('ns_househub_tab', t);
    } catch {
      /* depolama kapalı */
    }
  };
  const offices = useOfficeList({ enabled: Boolean(user) && !houseId && tab === 'ofis' });
  const myHouses = list.mine.filter((h) => !h.bizType || houseKind(h) === 'ofis');
  const mineOf = (k) => myHouses.filter((h) => houseKind(h) === k);
  const enterableOf = (k) => list.enterable.filter((h) => houseKind(h) === k);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyName, setBuyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const gold = Number(player?.gold || 0);
  // v68 — Android geri tuşu: satın alma penceresi açıksa onu, değilse ev listesini kapatır
  useBackClose(!houseId, () => (buyOpen ? setBuyOpen(false) : onClose()));

  if (houseId) {
    const loader = (
      <div className="hs-root">
        <div className="hs-loading">
          <div className="hs-spinner" />
          <p>Eve giriliyor…</p>
        </div>
      </div>
    );
    return (
      <Suspense fallback={loader}>
        <HouseScreen
          key={houseId}
          houseId={houseId}
          onExit={(note) => {
            setHouseId(null);
            if (note) setMsg({ ok: false, text: note });
            if (initialHouseId) onClose();
          }}
        />
      </Suspense>
    );
  }

  const buy = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await houseAction({ op: 'buy', ...(buyName.trim() ? { name: buyName.trim() } : {}) });
      setBuyOpen(false);
      setBuyName('');
      setHouseId(r.data.houseId);
    } catch (err) {
      setMsg({ ok: false, text: err?.message || 'Ev satın alınamadı.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hs-root hh-root">
      <div className="hh-head">
        <button className="hs-icon-btn" onClick={onClose} title="Kapat">✕</button>
        <div className="hh-title">
          <b>🏠 Evler</b>
          <span>Evini döşe, arkadaşlarını ağırla</span>
        </div>
        {user && (
          <button className="hh-buy" onClick={() => { setMsg(null); setBuyOpen(true); }}>
            Ev Satın Al <span>+</span>
          </button>
        )}
      </div>

      <div className="hh-body">
        {!user && <p className="hs-dim hh-empty">Evlere girmek için giriş yapmalısın.</p>}
        {msg && <p className={msg.ok ? 'hs-ok' : 'hs-err'}>{msg.text}</p>}

        {user && (
          <div className="hh-tabs" role="tablist">
            {[
              ['ofis', '🏢 Ofisler'],
              ['ev', '🏠 Evler'],
              ['depo', '📦 Depolar'],
            ].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {user && tab === 'ofis' && (
          <>
            {offices.loading && <p className="hs-dim">Yükleniyor…</p>}
            {!offices.loading && offices.list.length === 0 && <p className="hs-dim hh-empty">Henüz ofis yok. Evine para kazandıran bir mobilya koyup ⚙️ Ayarlar › Ücretli Ürünler'den ücretli yaparsan burada görünür.</p>}
            {offices.list.map((h) => (
              <HouseRow key={h.id} h={h} onEnter={setHouseId} mineRow={h.mine} />
            ))}
          </>
        )}

        {user && tab !== 'ofis' && (
          <>
            {mineOf(tab).length > 0 && (
              <>
                <div className="hs-list-title">{tab === 'ev' ? 'Evlerim' : 'Depolarım'}</div>
                {mineOf(tab).map((h) => (
                  <HouseRow key={h.id} h={h} onEnter={setHouseId} mineRow />
                ))}
              </>
            )}
            <div className="hs-list-title">{tab === 'ev' ? 'Girebileceğin Evler' : 'Girebileceğin Depolar'}</div>
            {list.loading && <p className="hs-dim">Yükleniyor…</p>}
            {!list.loading && enterableOf(tab).length === 0 && (
              <p className="hs-dim hh-empty">{tab === 'ev' ? 'Şu an girebileceğin bir ev yok.' : 'Şu an girebileceğin bir depo yok.'}</p>
            )}
            {enterableOf(tab).map((h) => (
              <HouseRow key={h.id} h={h} onEnter={setHouseId} />
            ))}
            {tab === 'depo' && <p className="hs-dim hh-hint">📦 {HOUSE_MIN_ITEMS} mobilyadan azı olan evler depodur; {HOUSE_MIN_ITEMS}. mobilyada ev olur.</p>}
          </>
        )}
      </div>

      {buyOpen && (
        <div className="hs-modal-bg" onClick={() => !busy && setBuyOpen(false)}>
          <div className="hs-modal hh-buy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hh-buy-hero">🏡</div>
            <b className="hh-buy-title">Yeni Ev</b>
            <p className="hs-dim">
              Boş bir ev alırsın; içini mağazadan istediğin gibi döşersin. Kafe, kulüp, garaj, spor salonu… hayal gücüne kalmış. İstediğin kadar ev alabilirsin.
            </p>
            <div className="hh-price-row">
              <span>Fiyat</span>
              <b>
                <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {HOUSE_PRICE.toLocaleString('tr-TR')}
              </b>
            </div>
            <div className="hh-price-row">
              <span>Altının</span>
              <b className={gold < HOUSE_PRICE ? 'neg' : ''}>
                <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {gold.toLocaleString('tr-TR')}
              </b>
            </div>
            <input className="hh-input" value={buyName} maxLength={30} placeholder="Ev adı (isteğe bağlı)" onChange={(e) => setBuyName(e.target.value)} />
            {msg && !msg.ok && <p className="hs-err">{msg.text}</p>}
            <div className="hh-modal-row">
              <button className="hs-btn ghost" disabled={busy} onClick={() => setBuyOpen(false)}>Vazgeç</button>
              <button className="hs-btn gold" disabled={busy || gold < HOUSE_PRICE} onClick={buy}>
                {busy ? 'Alınıyor…' : gold < HOUSE_PRICE ? 'Yetersiz altın' : 'Satın Al'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
