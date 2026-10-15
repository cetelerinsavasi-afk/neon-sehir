import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { houseAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { HOUSE_PRICE } from '../../../functions/houseCatalogData.js';
import { BIZ_TYPES, HOME_OFFICE_KEYS, bizMissing } from '../../../functions/businessCatalogData.js';
import BizRequirements, { FillConfirm } from '../HouseScreen/BizRequirements';
import '../../styles/bizui.css';
import '../HouseScreen/HouseBusiness.css';
import '../BusinessHub/BusinessHub.css';

// =============================================================================
// v93.2 — Evler › Home Ofisler › "Home Ofis Aç": türler alt alta; dokununca
// gerekli mobilyalar, eksikleri hemen al, ev seç / yeni ev al → eve girilir.
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const costText = (m) =>
  m.gold || m.gem ? [m.gold ? `${fmt(m.gold)} altın` : '', m.gem ? `${fmt(m.gem)} zümrüt` : ''].filter(Boolean).join(' + ') : 'Hepsi envanterinde ✓';

export default function HomeOfficeOpen({ onClose, onEnter }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const gold = Number(player?.gold || 0);
  const gem = Number(player?.emerald || 0);
  const [open, setOpen] = useState(HOME_OFFICE_KEYS[0]);
  const [invItems, setInvItems] = useState({});
  const [myHouses, setMyHouses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fill, setFill] = useState(null); // tür
  const [pick, setPick] = useState(null); // ev seçimi (tür)

  useEffect(() => {
    if (!user) return undefined;
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
  }, [user]);

  const buyMissing = async (type, chosen) => {
    setBusy(true);
    setMsg(null);
    try {
      await houseAction({ op: 'buyItems', items: chosen.buy, expect: { gold: chosen.gold, gem: chosen.gem } });
      setFill(null);
      setMsg({ ok: true, text: '✓ Mobilyalar envanterine eklendi.' });
    } catch (err) {
      setFill(null);
      setMsg({ ok: false, text: bizErrText(err) });
    } finally {
      setBusy(false);
    }
  };
  const chooseHouse = async (type, h) => {
    setBusy(true);
    setMsg(null);
    try {
      let id = h?.id;
      if (h) await houseAction({ op: 'bizIntent', houseId: h.id, type });
      else {
        if (gold < HOUSE_PRICE) throw new Error('Altının yetmiyor.');
        const r = await houseAction({ op: 'buy', bizIntent: type });
        id = r.data.houseId;
      }
      setPick(null);
      onEnter?.(id);
    } catch (err) {
      setMsg({ ok: false, text: bizErrText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bz-modal-bg" onClick={() => !busy && onClose()}>
      <div className="bz-modal bz bh-open-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bz-head">
          <div className="bz-head-main">
            <h3>🏢 Home Ofis Aç</h3>
          </div>
          <button className="bz-x" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="bz-wallet">
          <span>Cebindeki</span>
          <b>
            {fmt(gold)} altın · {fmt(gem)} zümrüt
          </b>
        </div>
        {HOME_OFFICE_KEYS.map((type) => {
          const t = BIZ_TYPES[type];
          const m = bizMissing(type, [], invItems);
          const nBuy = Object.values(m.buy).reduce((a, b) => a + b, 0);
          const isOpen = open === type;
          return (
            <div key={type} className={`hb-row2${isOpen ? ' open' : ''}`}>
              <button className="hb-row2-head" onClick={() => setOpen(isOpen ? null : type)}>
                <span className="hb-type-ico">{t.icon}</span>
                <span className="hb-row2-title">
                  <b>{t.label}</b>
                </span>
                <span className={`bz-tag${nBuy ? ' bad' : ' ok'}`}>{nBuy ? `${nBuy} mobilya eksik` : '✓ Mobilyalar hazır'}</span>
                <span className="hb-row2-arrow">{isOpen ? '▴' : '▾'}</span>
              </button>
              {isOpen && (
                <div className="hb-row2-body">
                  <BizRequirements type={type} invItems={invItems} showPlaced={false} />
                  <div className="bz-row">
                    <span>Eksikler</span>
                    <b>{costText(m)}</b>
                  </div>
                  <div className="bz-row">
                    <span>🏠 Yeni ev</span>
                    <b className={gold < HOUSE_PRICE ? 'bz-bad' : ''}>{fmt(HOUSE_PRICE)} altın</b>
                  </div>
                  <div className="bz-btns">
                    {nBuy > 0 && (
                      <button className="bz-btn ghost" disabled={busy} onClick={() => setFill(type)}>
                        🛒 Eksikleri al ({nBuy})
                      </button>
                    )}
                    <button className="bz-btn gold" disabled={busy} onClick={() => (myHouses.length ? setPick(type) : chooseHouse(type, null))}>
                      {busy ? 'İşleniyor…' : myHouses.length ? '🏠 Ev seç' : `🏠 Ev al — ${fmt(HOUSE_PRICE)}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      </div>

      {fill && (
        <FillConfirm
          type={fill}
          m={bizMissing(fill, [], invItems)}
          gold={gold}
          gem={gem}
          busy={busy}
          placeTitle="Envanterinde olanlar (tekrar alınmaz)"
          onCancel={() => setFill(null)}
          onConfirm={(chosen) => buyMissing(fill, chosen || bizMissing(fill, [], invItems))}
        />
      )}
      {pick && (
        <div className="bz-modal-bg" onClick={(e) => (e.stopPropagation(), !busy && setPick(null))}>
          <div className="bz-modal bz bh-convert" onClick={(e) => e.stopPropagation()}>
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>
                  {BIZ_TYPES[pick].icon} Ev seç
                </h3>
              </div>
              <button className="bz-x" disabled={busy} onClick={() => setPick(null)}>
                ✕
              </button>
            </div>
            <div className="bh-convert-list">
              {myHouses.map((h) => (
                <button key={h.id} className="hh-row" disabled={busy} onClick={() => chooseHouse(pick, h)}>
                  <span className="hh-avatar bh-game-ico">🏠</span>
                  <span className="hh-info">
                    <b>{h.name}</b>
                  </span>
                  <span className="bh-go">Seç ›</span>
                </button>
              ))}
            </div>
            <button className="bz-btn gold wide" disabled={busy || gold < HOUSE_PRICE} onClick={() => chooseHouse(pick, null)}>
              🆕 Yeni ev al — {fmt(HOUSE_PRICE)} altın
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
