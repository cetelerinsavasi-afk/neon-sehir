import { lazy, Suspense, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useHouseList } from '../../hooks/useHouseList';
import { houseAction } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { HOUSE_PRICE } from '../../../functions/houseCatalogData.js';
import './HouseScreen.css';
import { useBackClose } from '../../lib/backStack';

// three.js ağır bir kütüphane — sadece bir eve GİRİLDİĞİNDE yüklenir.
const HouseScreen = lazy(() => import('./HouseScreen'));

const PRIVACY_LABEL = { public: '🌐 Herkese açık', friends: '👥 Arkadaşlar', private: '🔒 Gizli' };

export function HouseRow({ h, onEnter, mineRow }) {
  return (
    <button className={`hh-row${mineRow ? ' mine' : ''}`} onClick={() => onEnter(h.id)}>
      <span className="hh-avatar">
        <AvatarSvg avatar={h.ownerAvatar} size={42} rounded />
      </span>
      <span className="hh-info">
        <b>{h.name || `${h.ownerName || 'Oyuncu'}'in Evi`}</b>
        <span>
          {h.ownerName || 'Oyuncu'} · {PRIVACY_LABEL[h.privacy || 'public']}
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
  const list = useHouseList({ enabled: Boolean(user) });
  const [houseId, setHouseId] = useState(initialHouseId);
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

        {user && list.mine.length > 0 && (
          <>
            <div className="hs-list-title">Evlerim</div>
            {list.mine.map((h) => (
              <HouseRow key={h.id} h={h} onEnter={setHouseId} mineRow />
            ))}
          </>
        )}

        {user && (
          <>
            <div className="hs-list-title">Girebileceğin Evler</div>
            {list.loading && <p className="hs-dim">Yükleniyor…</p>}
            {!list.loading && list.enterable.length === 0 && (
              <p className="hs-dim hh-empty">Şu an girebileceğin bir ev yok. Arkadaşlarının evlerine davet bekleyebilir ya da kendi evini alabilirsin.</p>
            )}
            {list.enterable.map((h) => (
              <HouseRow key={h.id} h={h} onEnter={setHouseId} />
            ))}
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
