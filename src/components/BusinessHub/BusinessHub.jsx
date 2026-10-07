import { lazy, Suspense, useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBusinessList } from '../../hooks/useBusinessList';
import { houseAction, shopAction } from '../../services/gameActions';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { HOUSE_PRICE } from '../../../functions/houseCatalogData.js';
import { BIZ_TYPES, BIZ_ITEM_LABELS, bizMinCost, bizMissing } from '../../../functions/businessCatalogData.js';
import { useBackClose } from '../../lib/backStack';
import '../HouseScreen/HouseScreen.css';
import './BusinessHub.css';

const HouseScreen = lazy(() => import('../HouseScreen/HouseScreen'));

// Oyunun kendi dükkânı (her zaman açık) — oyuncu dükkânları gibi dünkü kazancına
// göre sıralanır (gameVenues/{tür}.bizRank); sırası yoksa sıralılardan sonra.
const GAME_VENUE = {
  silahci: { name: 'Neon Silah Mağazası' },
  galeri: { name: 'Neon Araba Galerisi' },
  modifiye: { name: 'Neon Modifiye Garajı' },
  // spor: oyunun salonu da 3D bir ev (houses/game_spor) — içine girilir
  spor: { name: 'Neon Spor Salonu', house: true },
};

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
function Coin({ gem, v, bad }) {
  return (
    <span className={`bh-coin${bad ? ' bad' : ''}`}>
      <span className={gem ? 'emerald-icon' : 'gold-coin-icon'} style={{ width: 13, height: 13 }} />
      {fmt(v)}
    </span>
  );
}

// v77 — BusinessHub: haritada bir işletme türüne (Spor Salonu, Cafe, Bar,
// İnternet Kafe, Silahçı, Galeri, Modifiye) tıklayınca açılır. Aktif dükkânlar
// (dünkü kazanç sırasıyla; kazanç gösterilmez), en üstte "[tür] aç" ve varsa
// oyunun kendi dükkânı. Bir dükkâna girince 3D ev ekranı açılır.
export default function BusinessHub({ type, onClose, onOpenGameVenue }) {
  const t = BIZ_TYPES[type];
  const { user } = useAuth();
  const { player } = usePlayer();
  const [houseId, setHouseId] = useState(null);
  const { list, loading, gameRank, gamePeople } = useBusinessList(type, { enabled: Boolean(user) && !houseId });
  const [openAsk, setOpenAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [shake, setShake] = useState(0);
  const [convertAsk, setConvertAsk] = useState(false);
  useBackClose(!houseId, () => (convertAsk ? setConvertAsk(false) : openAsk ? setOpenAsk(false) : onClose()));
  // "Hepsini al" için envanter + "evini çevir" önerisi için işletme olmayan evlerim
  const [invItems, setInvItems] = useState({});
  const [myHouses, setMyHouses] = useState([]);
  useEffect(() => {
    if (!user || !openAsk) return undefined;
    const u1 = onSnapshot(doc(db, 'houseInventories', user.uid), (s) => setInvItems(s.exists() ? s.data().items || {} : {}), () => setInvItems({}));
    const u2 = onSnapshot(
      query(collection(db, 'houses'), where('ownerUid', '==', user.uid), limit(20)),
      (s) => setMyHouses(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((h) => !h.biz?.type)),
      () => setMyHouses([])
    );
    return () => {
      u1();
      u2();
    };
  }, [user, openAsk]);

  if (!t) return null;

  if (houseId) {
    return (
      <Suspense
        fallback={
          <div className="hs-root">
            <div className="hs-loading">
              <div className="hs-spinner" />
            </div>
          </div>
        }
      >
        <HouseScreen
          key={houseId}
          houseId={houseId}
          onExit={(note) => {
            setHouseId(null);
            if (note) setMsg(note);
          }}
          onOpenGameVenue={GAME_VENUE[type] && !GAME_VENUE[type].house ? () => onOpenGameVenue?.() : undefined}
        />
      </Suspense>
    );
  }

  const gold = Number(player?.gold || 0);
  const gem = Number(player?.emerald || 0);
  const cost = bizMinCost(type);
  const game = GAME_VENUE[type];

  const today = futbolDayKey(Date.now());
  const openGame = async () => {
    if (!game?.house) return onOpenGameVenue?.();
    setBusy(true);
    setMsg(null);
    try {
      const r = await shopAction({ op: 'gymEnsureGame' });
      setHouseId(r.houseId);
    } catch (err) {
      setMsg(err?.message || '⚠️');
    } finally {
      setBusy(false);
    }
  };

  const missing = bizMissing(type, [], invItems);
  const toBuy = Object.values(missing.buy).reduce((a, b) => a + b, 0);
  const buyMissing = async () => {
    if (gold < missing.gold || gem < missing.gem) {
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await houseAction({ op: 'buyItems', items: missing.buy, expect: { gold: missing.gold, gem: missing.gem } });
    } catch (err) {
      setMsg(err?.message || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };
  const convert = async (h) => {
    setBusy(true);
    setMsg(null);
    try {
      await houseAction({ op: 'bizIntent', houseId: h.id, type });
      setConvertAsk(false);
      setOpenAsk(false);
      setHouseId(h.id);
    } catch (err) {
      setMsg(err?.message || '⚠️');
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    if (myHouses.length && !convertAsk) {
      setConvertAsk(true);
      return;
    }
    if (gold < HOUSE_PRICE) {
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await houseAction({ op: 'buy', bizIntent: type });
      setConvertAsk(false);
      setOpenAsk(false);
      setHouseId(r.data.houseId);
    } catch (err) {
      setMsg(err?.message || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hs-root hh-root bh-root">
      <div className="hh-head">
        <button className="hs-icon-btn" onClick={onClose} title="Kapat">✕</button>
        <div className="hh-title">
          <b>
            {t.icon} {t.label}
          </b>
        </div>
        {user && (
          <button
            className="hh-buy"
            onClick={() => {
              setMsg(null);
              setOpenAsk(true);
            }}
          >
            {t.label} aç <span>+</span>
          </button>
        )}
      </div>

      <div className="hh-body">
        {msg && <p className="hs-err">{msg}</p>}
        {!user && <p className="hs-dim hh-empty">Giriş yap.</p>}
        {user && loading && <p className="hs-dim">…</p>}
        {user && !loading && list.length === 0 && !game && (
          <div className="bh-empty">
            <span>{t.icon}</span>
            <b>0</b>
          </div>
        )}
        {(() => {
          const rank = (h) => (Number.isFinite(h.bizRank) && h.bizRank > 0 ? h.bizRank : Infinity);
          const gr = Number.isFinite(gameRank) ? gameRank : Infinity;
          const at = game ? list.filter((h) => rank(h) < gr || (gr === Infinity && rank(h) !== Infinity)).length : -1;
          const rows = list.map((h) => ({ kind: 'h', h }));
          if (game) rows.splice(at, 0, { kind: 'game' });
          return rows;
        })().map(({ kind, h }) =>
          kind === 'game' ? (
            <button key="game" className="hh-row bh-game" disabled={busy} onClick={openGame}>
              <span className="hh-avatar bh-game-ico">{t.icon}</span>
              <span className="hh-info">
                <b>{game.name}</b>
                <span>★ 7/24</span>
              </span>
              {game.house ? (
                <span className={`hh-count${gamePeople ? ' live' : ''}`}>
                  <i />
                  {gamePeople}
                </span>
              ) : (
                <span className="bh-go">›</span>
              )}
            </button>
          ) : (
          <button key={h.id} className={`hh-row${h.mine ? ' mine' : ''}`} onClick={() => setHouseId(h.id)}>
            <span className="hh-avatar">
              <AvatarSvg avatar={h.ownerAvatar} size={42} rounded />
            </span>
            <span className="hh-info">
              <b>
                {h.name || t.label}
                {type === 'spor' && h.gymBonusDay === today && <em className="bh-bonus">🔥 +%10</em>}
              </b>
              <span>{h.ownerName || 'Oyuncu'}</span>
            </span>
            <span className={`hh-count${h.people ? ' live' : ''}`}>
              <i />
              {h.people}
            </span>
          </button>
          )
        )}
      </div>

      {openAsk && (
        <div className="hs-modal-bg" onClick={() => !busy && setOpenAsk(false)}>
          <div className="hs-modal hh-buy-modal bh-open-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hh-buy-hero">{t.icon}</div>
            <b className="hh-buy-title">{t.label} aç</b>
            <p className="hs-dim bh-lead">🏠 Ev al → mobilyaları yerleştir → ⚙️ aç</p>

            <div className="bh-cost-row">
              <span>🏠 Ev</span>
              <Coin v={HOUSE_PRICE} bad={gold < HOUSE_PRICE} />
            </div>
            <div className="bh-req">
              {cost.lines.map((l, gi) => {
                const lab = BIZ_ITEM_LABELS[l.key] || { name: l.key, icon: '📦' };
                const mg = missing.groups[gi];
                const inInv = mg ? Object.values(mg.fromInv).reduce((a, b) => a + b, 0) : 0;
                const left = mg ? mg.buy : l.n;
                const alts = l.any.filter((k) => k !== l.key).slice(0, 3);
                return (
                  <div className="bh-req-row" key={l.key}>
                    <span className="bh-req-ico">{lab.icon}</span>
                    <span className="bh-req-name">
                      {lab.name}
                      {l.n > 1 && <i> ×{l.n}</i>}
                      {alts.length > 0 && (
                        <em className="bh-alt" title={alts.map((k) => BIZ_ITEM_LABELS[k]?.name || k).join(' / ')}>
                          / {alts.map((k) => BIZ_ITEM_LABELS[k]?.icon || '•').join('')}
                        </em>
                      )}
                    </span>
                    {inInv > 0 ? <span className="bh-inv" title="Envanterde">📦{inInv}</span> : <span />}
                    {left > 0 ? (
                      l.price && <Coin gem={l.price.t === 'gem'} v={l.price.v * left} />
                    ) : (
                      <span className="bh-have">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bh-total" key={shake}>
              <span>Σ</span>
              <span className="bh-total-vals">
                <Coin v={HOUSE_PRICE + missing.gold} bad={gold < HOUSE_PRICE + missing.gold} />
                {missing.gem > 0 && <Coin gem v={missing.gem} bad={gem < missing.gem} />}
              </span>
            </div>
            <div className={`bh-wallet${shake ? ' shake' : ''}`} key={`w${shake}`}>
              <span>👛</span>
              <span className="bh-total-vals">
                <Coin v={gold} bad={gold < HOUSE_PRICE} />
                <Coin gem v={gem} />
              </span>
            </div>
            {toBuy > 0 && (
              <button className={`hs-btn ghost wide bh-buyall${gold < missing.gold || gem < missing.gem ? ' bh-dim' : ''}`} disabled={busy} onClick={buyMissing}>
                🛒 Hepsini al · {toBuy}
                <span className="bh-total-vals">
                  {missing.gold > 0 && <Coin v={missing.gold} />}
                  {missing.gem > 0 && <Coin gem v={missing.gem} />}
                </span>
              </button>
            )}
            {toBuy === 0 && <p className="bh-allset">📦 ✓</p>}
            <div className="hh-modal-row">
              <button className="hs-btn ghost" disabled={busy} onClick={() => setOpenAsk(false)}>
                Vazgeç
              </button>
              <button className={`hs-btn gold${gold < HOUSE_PRICE ? ' bh-dim' : ''}`} disabled={busy} onClick={buy}>
                {busy ? '…' : 'Satın al'}
              </button>
            </div>
          </div>
        </div>
      )}
      {openAsk && convertAsk && (
        <div className="hs-modal-bg" onClick={() => !busy && setConvertAsk(false)}>
          <div className="hs-modal bh-convert" onClick={(e) => e.stopPropagation()}>
            <div className="hh-buy-hero">
              🏠 → {t.icon}
            </div>
            <b className="hh-buy-title">Evini {t.label.toLocaleLowerCase('tr-TR')} yapmak ister misin?</b>
            <div className="bh-convert-list">
              {myHouses.map((h) => (
                <button key={h.id} className="hh-row" disabled={busy} onClick={() => convert(h)}>
                  <span className="hh-avatar bh-game-ico">🏠</span>
                  <span className="hh-info">
                    <b>{h.name}</b>
                    <span>
                      🪑 {(h.items || []).filter((x) => x.p === 1).length}
                      {h.bizIntent ? ` · ${BIZ_TYPES[h.bizIntent]?.icon || ''}` : ''}
                    </span>
                  </span>
                  <span className="bh-go">{t.icon} ›</span>
                </button>
              ))}
            </div>
            <button className={`hs-btn gold wide${gold < HOUSE_PRICE ? ' bh-dim' : ''}`} disabled={busy} onClick={buy}>
              🆕 Yeni ev · <Coin v={HOUSE_PRICE} bad={gold < HOUSE_PRICE} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
