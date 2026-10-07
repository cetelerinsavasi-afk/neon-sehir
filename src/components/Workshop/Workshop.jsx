import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useWeapons } from '../../hooks/useWeapons';
import { useVehicles } from '../../hooks/useVehicles';
import { useInventory } from '../../hooks/useInventory';
import { shopAction } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleImage, vehicleDisplayName } from '../VehicleCard/VehicleCard';
import {
  WORKSHOP_ITEM_TYPE,
  gameWorkshopPrice,
  clampWorkshopPrice,
  workshopJob,
  workshopCost,
  lifeCapOf,
  VEHICLE_WEAPON_MAX_REPAIRS,
  upgradeSlots,
  weaponPowerAtLevel,
} from '../../../functions/itemRules.js';
import { BIZ_MATERIALS } from '../../../functions/businessCatalogData.js';
import './Workshop.css';

// =============================================================================
// Workshop — v77 Atölye (silahçı: silah · modifiye: araç). Yazısız tasarım:
//   üstte iki sekme (🔧 tamir · ⬆ geliştir), solda ürün kartı (ömür hücreleri +
//   gelişim basamakları), ortada malzeme çubuğu (sol = dükkânın, sağ = benim;
//   tutamaç sınır; %0/%50/%100'de yapışır), altta kilitli işçilik + toplam +
//   tek büyük onay. Eksikler vurgulanır (kırmızı halka, kilit, sarsılma),
//   uyarı cümlesi yok. Tüm tutarlar sunucuda (shop.js) yeniden hesaplanır.
// shop: { kind:'game', type } | { kind:'player', type, houseId, houseDoc }
// =============================================================================

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const weaponImage = (id) => weaponCatalog.find((w) => w.id === id)?.image;

function Gold({ v, cls = '' }) {
  return (
    <span className={`wk-gold ${cls}`}>
      <span className="gold-coin-icon" style={{ width: 14, height: 14 }} />
      {fmt(v)}
    </span>
  );
}

// Ömür hücreleri: dolu = kalan ömür, parlayan = tamirle eklenecek kısım
function LifeCells({ life, cap, gain = 0 }) {
  return (
    <div className="wk-life" title={`${life}/${cap}`}>
      {Array.from({ length: cap }, (_, i) => (
        <i key={i} className={i < life ? 'on' : i < life + gain ? 'gain' : ''} />
      ))}
    </div>
  );
}

export default function Workshop({ shop, onClose, onGoGame }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { weapons } = useWeapons();
  const { vehicles } = useVehicles();
  const { inventory } = useInventory();
  const itemType = WORKSHOP_ITEM_TYPE[shop.type];
  const isGame = shop.kind === 'game';
  const [tab, setTab] = useState('repair');
  const [itemId, setItemId] = useState(null);
  const [upgradeType, setUpgradeType] = useState('gear');
  const [shopQty, setShopQty] = useState(0);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cue, setCue] = useState(null); // { kind, n } — kısa süreli vurgu
  const [done, setDone] = useState(null);
  const [stock, setStock] = useState({});
  const [seenPrice, setSeenPrice] = useState(null); // fiyat değişikliğini yakalamak için

  // dükkânın malzeme stoğu (canlı)
  useEffect(() => {
    if (isGame || !shop.houseId) return undefined;
    return onSnapshot(doc(db, 'businessInventories', shop.houseId), (s) => setStock(s.exists() ? s.data().materials || {} : {}), () => setStock({}));
  }, [isGame, shop.houseId]);

  const items = useMemo(() => (itemType === 'weapon' ? weapons : vehicles).filter((x) => !x.listed), [itemType, weapons, vehicles]);
  const item = items.find((x) => x.id === itemId) || items[0] || null;
  useEffect(() => {
    if (!itemId && items[0]) setItemId(items[0].id);
  }, [itemId, items]);

  const job = item ? workshopJob({ itemType, item, action: tab, upgradeType: itemType === 'vehicle' ? upgradeType : undefined }) : null;
  const material = job?.material || (tab === 'repair' ? 'tamirMalzemesi' : itemType === 'weapon' ? 'silahUpgrade' : 'arabaGelistirme');
  const price = isGame ? gameWorkshopPrice(material) : clampWorkshopPrice(material, shop.houseDoc?.bizPrices?.materials?.[material]);
  const priceKey = `${material}:${price.mat}:${price.labor}`;
  const qty = job?.qty || 0;
  const have = Math.max(0, Number(inventory[material] || 0));
  const shopHave = isGame ? Infinity : Math.max(0, Number(stock[material] || 0));
  // tutamaç sınırları (shopQty): sol kilit = elimde yetmeyen, sağ kilit = dükkânda yetmeyen
  const minShop = Math.max(0, qty - Math.min(have, qty));
  const maxShop = Math.min(qty, shopHave);
  const impossible = qty > 0 && minShop > maxShop;
  // varsayılan: önce kendi malzemem (en ucuzu)
  useEffect(() => {
    setTouched(false);
  }, [item?.id, tab, upgradeType]);
  useEffect(() => {
    if (!touched) setShopQty(minShop);
    else setShopQty((v) => Math.min(maxShop, Math.max(minShop, v)));
  }, [minShop, maxShop, touched]);
  // fiyat değişti mi? (onay ekranındayken sahip fiyatı değiştirirse)
  const priceChanged = seenPrice !== null && seenPrice !== priceKey;
  useEffect(() => {
    // ekran açılınca / sekme ya da ürün değişince o anki fiyat "görülmüş" sayılır
    setSeenPrice(priceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, item?.id]);

  const cost = workshopCost({ mat: price.mat, labor: price.labor, qty, ownQty: qty - shopQty });
  const gold = Number(player?.gold || 0);
  const isOwner = !isGame && shop.houseDoc?.ownerUid === user?.uid;
  const poor = !isOwner && gold < cost.total;
  const canDo = Boolean(item && job && !job.block && qty > 0 && !impossible && !poor && !busy);

  const flash = (kind) => {
    setCue({ kind, n: Date.now() });
    setTimeout(() => setCue((c) => (c?.kind === kind ? null : c)), 1600);
  };

  const onBar = (v) => {
    let n = Math.round(Number(v));
    // %0 / %50 / %100'e hafifçe yapış
    for (const snap of [0, qty / 2, qty]) if (Math.abs(n - snap) <= Math.max(1, qty * 0.04)) n = Math.round(snap);
    setTouched(true);
    setShopQty(Math.min(maxShop, Math.max(minShop, n)));
  };

  const confirm = async () => {
    if (priceChanged) {
      setSeenPrice(priceKey);
      return;
    }
    if (poor) {
      flash('gold');
      return;
    }
    if (!canDo) return;
    setBusy(true);
    try {
      await shopAction({
        op: 'workshop',
        shop: isGame ? 'game' : shop.houseId,
        shopType: shop.type,
        itemId: item.id,
        action: tab,
        upgradeType: itemType === 'vehicle' ? upgradeType : undefined,
        ownQty: cost.own,
        expect: cost.total,
      });
      setDone({ n: Date.now(), tab });
      setTimeout(() => setDone(null), 1400);
      setTouched(false);
    } catch (err) {
      const m = String(err?.message || '');
      if (m.startsWith('price-changed')) setSeenPrice('__stale__');
      else if (m === 'gold') flash('gold');
      else if (m === 'shop-short') flash('shop');
      else if (m === 'own-short') flash('own');
      else if (m === 'not-present') flash('door');
      else flash('err');
    } finally {
      setBusy(false);
    }
  };

  // ---- görünüm ----------------------------------------------------------------------
  const cap = item ? lifeCapOf(itemType) : 0;
  const life = item ? item.lifeDays ?? cap : 0;
  const repairsLeft = item ? VEHICLE_WEAPON_MAX_REPAIRS - (item.repairsUsed || 0) : 0;
  const slots = item ? upgradeSlots(itemType, item) : [false, false];
  const img = item ? (itemType === 'weapon' ? weaponImage(item.catalogId) : vehicleImage(item.catalogId)) : null;
  const name = item ? (itemType === 'weapon' ? item.name : vehicleDisplayName(item)) : '';
  const nextSlot = slots.findIndex((s) => !s);
  const pct = (n) => (qty > 0 ? (n / qty) * 100 : 0);
  const mat = BIZ_MATERIALS[material] || { icon: '📦', name: material };

  return (
    <div className="wk-root" onClick={(e) => e.stopPropagation()}>
      <div className="wk-head">
        <div className="wk-tabs">
          <button className={tab === 'repair' ? 'on' : ''} onClick={() => setTab('repair')} title="Tamir">
            🔧
          </button>
          <button className={tab === 'upgrade' ? 'on' : ''} onClick={() => setTab('upgrade')} title="Geliştir">
            ⬆
          </button>
        </div>
        <span className={`wk-wallet${cue?.kind === 'gold' ? ' cue-blink' : ''}`} key={cue?.kind === 'gold' ? cue.n : 'w'}>
          <Gold v={gold} cls={poor ? 'bad' : ''} />
        </span>
        {onClose && (
          <button className="wk-x" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="wk-empty">
          <span>{itemType === 'weapon' ? '🔫' : '🚗'}</span>
          <b>0</b>
        </div>
      ) : (
        <>
          {items.length > 1 && (
            <div className="wk-picker">
              {items.map((x) => {
                const xi = itemType === 'weapon' ? weaponImage(x.catalogId) : vehicleImage(x.catalogId);
                return (
                  <button key={x.id} className={x.id === item?.id ? 'on' : ''} onClick={() => setItemId(x.id)} title={itemType === 'weapon' ? x.name : vehicleDisplayName(x)}>
                    {xi ? <img src={xi} alt="" /> : <span>{itemType === 'weapon' ? '🔫' : '🚗'}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className={`wk-card${done ? ' wk-done' : ''}`} key={done?.n || 'card'}>
            <div className="wk-card-img">{img ? <img src={img} alt="" /> : <span>{itemType === 'weapon' ? '🔫' : '🚗'}</span>}</div>
            <div className="wk-card-body">
              <b className="wk-card-name">{name}</b>
              {itemType === 'weapon' ? (
                <span className="wk-stat">
                  ⚡ {fmt(item.power)}
                  {tab === 'upgrade' && !job?.block && <em className="cue-glow"> → {fmt(weaponPowerAtLevel(item.basePower, (item.level || 1) + 1))}</em>}
                </span>
              ) : (
                <span className="wk-stat">
                  ⚙️ {item.gearLevel} · ⛽ {(item.baseTank || 0) + (item.tankBonus || 0)}
                </span>
              )}
              <LifeCells life={life} cap={cap} gain={tab === 'repair' && !job?.block ? job?.gain || 0 : 0} />
              <div className="wk-meta">
                <span className={job?.block === 'repairs' ? 'cue-ring wk-pill' : 'wk-pill'}>
                  🔧 {repairsLeft}/{VEHICLE_WEAPON_MAX_REPAIRS}
                </span>
                <span className="wk-steps">
                  {slots.map((on, i) => {
                    const pick = itemType === 'vehicle' && tab === 'upgrade' && !on;
                    const isNext = tab === 'upgrade' && !on && (itemType === 'vehicle' ? (i === 0 ? 'gear' : 'tank') === upgradeType : i === nextSlot);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`wk-step${on ? ' on' : ''}${isNext ? ' cue-pulse next' : ''}`}
                        disabled={!pick}
                        onClick={() => pick && setUpgradeType(i === 0 ? 'gear' : 'tank')}
                        title={itemType === 'vehicle' ? (i === 0 ? 'Vites' : 'Depo') : `Sv. ${i + 2}`}
                      >
                        {itemType === 'vehicle' ? (i === 0 ? '⚙️' : '⛽') : `${i + 2}`}
                      </button>
                    );
                  })}
                </span>
              </div>
            </div>
          </div>

          {job?.block ? (
            <div className="wk-blocked">
              <span className="wk-blocked-ico">{job.block === 'full' || job.block === 'maxLevel' || job.block === 'done' ? '✓' : '🔒'}</span>
            </div>
          ) : (
            <>
              <div className={`wk-bar-box${cue?.kind === 'shop' || cue?.kind === 'own' ? ' cue-shake' : ''}`} key={cue?.n || 'bar'}>
                <div className="wk-bar-ends">
                  <span className={shopHave < qty ? 'cue-ring wk-end' : 'wk-end'} title="Dükkân">
                    🏪 {isGame ? '∞' : fmt(shopHave)}
                  </span>
                  <span className="wk-need">
                    {mat.icon} ×{fmt(qty)}
                  </span>
                  <span className={have < qty ? 'wk-end mine cue-lock' : 'wk-end mine'} title="Benim">
                    👜 {fmt(have)}
                  </span>
                </div>
                <div
                  className={`wk-bar${impossible ? ' impossible cue-ring' : ''}`}
                  style={{
                    '--shop': `${pct(shopQty)}%`,
                    '--lockL': `${pct(minShop)}%`,
                    '--lockR': `${pct(qty - maxShop)}%`,
                  }}
                >
                  {!impossible && <div className="wk-bar-fill" />}
                  {!impossible && minShop > 0 && <div className="wk-lock-left" title="👜" />}
                  {!impossible && qty - maxShop > 0 && <div className="wk-lock-right" title="🏪" />}
                  {!impossible && <input
                    type="range"
                    min={0}
                    max={qty}
                    step={1}
                    value={shopQty}
                    disabled={impossible || busy}
                    onChange={(e) => onBar(e.target.value)}
                    aria-label="Malzeme payı"
                  />}
                </div>
                {impossible ? (
                  <div className="wk-bar-nums">
                    <span>
                      🏪 {fmt(shopHave)} + 👜 {fmt(have)} &lt; {fmt(qty)}
                    </span>
                    {!isGame && onGoGame && (
                      <button className="wk-door cue-pulse" onClick={onGoGame} title="Oyunun dükkânı">
                        🚪 ★
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="wk-bar-nums">
                    <span>
                      🏪 {fmt(cost.shopQty)} × <b className={priceChanged ? 'wk-changed' : ''}>{fmt(price.mat)}</b>
                    </span>
                    <span>👜 {fmt(cost.own)}</span>
                  </div>
                )}
              </div>

              <div className="wk-foot">
                <div className="wk-labor" title="İşçilik">
                  <span>🛠️🔒</span>
                  <Gold v={cost.labor} />
                  <small>
                    {fmt(qty)} × <b className={priceChanged ? 'wk-changed' : ''}>{fmt(price.labor)}</b>
                  </small>
                </div>
                <div className={`wk-total${poor ? ' bad' : ''}${impossible ? ' cue-dim' : ''}${cue?.kind === 'gold' ? ' cue-shake' : ''}${priceChanged ? ' wk-changed-box' : ''}`} key={cue?.kind === 'gold' ? `t${cue.n}` : 'total'}>
                  <span>Σ</span>
                  {impossible ? <b>—</b> : <Gold v={cost.total} />}
                </div>
              </div>
              <button className={`wk-go${!canDo || priceChanged ? ' dim' : ''}${priceChanged ? ' cue-pulse' : ''}`} disabled={busy} onClick={confirm}>
                {busy ? '…' : priceChanged ? '↻ ✓' : tab === 'repair' ? '🔧 ✓' : '⬆ ✓'}
              </button>
              {cue?.kind === 'door' && <p className="wk-flash">🚪</p>}
              {cue?.kind === 'err' && <p className="wk-flash">⚠️</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
