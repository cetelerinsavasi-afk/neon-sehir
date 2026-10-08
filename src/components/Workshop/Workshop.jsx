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
  WEAPON_MAX_LEVEL,
  weaponPowerAtLevel,
} from '../../../functions/itemRules.js';
import { BIZ_MATERIALS } from '../../../functions/businessCatalogData.js';
import '../../styles/bizui.css';
import './Workshop.css';

// =============================================================================
// Atölye (silahçı: silah · modifiye garajı: araba) — tamir ve geliştirme.
// Her şey yazıyla söylenir: ürünün ömrü, kalan tamir hakkı, geliştirilebilir mi,
// kaç malzeme gerekiyor, sende ve dükkânda ne kadar var, malzeme ücreti,
// işçilik, toplam ve cebindeki altın. Tutarlar sunucuda (shop.js) yeniden
// hesaplanır; ekrandaki hesap aynı kurallarla (itemRules.js) yapılır.
// shop: { kind:'game', type } | { kind:'player', type, houseId, houseDoc }
// =============================================================================

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const weaponImage = (id) => weaponCatalog.find((w) => w.id === id)?.image;

function Gold({ v, cls = '' }) {
  return (
    <span className={`bz-gold ${cls}`}>
      <span className="gold-coin-icon" style={{ width: 14, height: 14 }} />
      {fmt(v)}
    </span>
  );
}

// v77: oyuncu dükkânından oyunun dükkânına yönlendirme yok (para oyunculara kazandırılır)
export default function Workshop({ shop, onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { weapons } = useWeapons();
  const { vehicles } = useVehicles();
  const { inventory } = useInventory();
  const itemType = WORKSHOP_ITEM_TYPE[shop.type];
  const isWeapon = itemType === 'weapon';
  const isGame = shop.kind === 'game';
  const [tab, setTab] = useState('repair');
  const [itemId, setItemId] = useState(null);
  const [upgradeType, setUpgradeType] = useState('gear');
  const [ownQty, setOwnQty] = useState(0);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [stock, setStock] = useState({});
  const [seenPrice, setSeenPrice] = useState(null);

  // dükkânın malzeme stoğu (canlı)
  useEffect(() => {
    if (isGame || !shop.houseId) return undefined;
    return onSnapshot(doc(db, 'businessInventories', shop.houseId), (s) => setStock(s.exists() ? s.data().materials || {} : {}), () => setStock({}));
  }, [isGame, shop.houseId]);

  const items = useMemo(() => (isWeapon ? weapons : vehicles).filter((x) => !x.listed), [isWeapon, weapons, vehicles]);
  const item = items.find((x) => x.id === itemId) || items[0] || null;
  useEffect(() => {
    if (!itemId && items[0]) setItemId(items[0].id);
  }, [itemId, items]);

  const job = item ? workshopJob({ itemType, item, action: tab, upgradeType: isWeapon ? undefined : upgradeType }) : null;
  const material = job?.material || (tab === 'repair' ? 'tamirMalzemesi' : isWeapon ? 'silahUpgrade' : 'arabaGelistirme');
  const mat = BIZ_MATERIALS[material] || { icon: '📦', name: material };
  const price = isGame ? gameWorkshopPrice(material) : clampWorkshopPrice(material, shop.houseDoc?.bizPrices?.materials?.[material]);
  const priceKey = `${material}:${price.mat}:${price.labor}`;
  const qty = job?.qty || 0;
  const have = Math.max(0, Number(inventory[material] || 0));
  const shopHave = isGame ? Infinity : Math.max(0, Number(stock[material] || 0));
  // kendi malzemenden en az / en çok kaç adet kullanılabilir
  const maxOwn = Math.min(qty, have);
  const minOwn = Math.max(0, qty - Math.min(qty, shopHave));
  const impossible = qty > 0 && minOwn > maxOwn;

  useEffect(() => {
    setTouched(false);
    setMsg(null);
  }, [item?.id, tab, upgradeType]);
  // varsayılan: önce kendi malzemen (ücretsiz), eksik kalanı dükkândan
  useEffect(() => {
    if (!touched) setOwnQty(maxOwn);
    else setOwnQty((v) => Math.min(maxOwn, Math.max(minOwn, v)));
  }, [minOwn, maxOwn, touched]);
  const priceChanged = seenPrice !== null && seenPrice !== priceKey;
  useEffect(() => {
    setSeenPrice(priceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, item?.id]);

  const cost = workshopCost({ mat: price.mat, labor: price.labor, qty, ownQty });
  const gold = Number(player?.gold || 0);
  const isOwner = !isGame && shop.houseDoc?.ownerUid === user?.uid;
  const payable = isOwner ? 0 : cost.total;
  const poor = gold < payable;

  // engel cümlesi (varsa)
  let blockText = null;
  let blockOk = false;
  if (job?.block === 'repairs') blockText = `Tamir hakkı bitti: ${VEHICLE_WEAPON_MAX_REPAIRS} tamirin hepsi kullanıldı.`;
  else if (job?.block === 'full') {
    blockText = 'Ömrü zaten dolu, tamire gerek yok.';
    blockOk = true;
  } else if (job?.block === 'maxLevel') {
    blockText = `En yüksek seviyede (${WEAPON_MAX_LEVEL}/${WEAPON_MAX_LEVEL}). Daha fazla geliştirilemez.`;
    blockOk = true;
  } else if (job?.block === 'done') {
    blockText = upgradeType === 'gear' ? 'Vites geliştirmesi zaten yapıldı.' : 'Depo geliştirmesi zaten yapıldı.';
    blockOk = true;
  } else if (job?.block === 'listed') blockText = 'Bu ürün ilanda/vitrinde. Önce ilandan kaldır.';
  const canDo = Boolean(item && job && !job.block && qty > 0 && !impossible && !poor && !busy && !priceChanged);

  const confirm = async () => {
    if (!canDo) return;
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({
        op: 'workshop',
        shop: isGame ? 'game' : shop.houseId,
        shopType: shop.type,
        itemId: item.id,
        action: tab,
        upgradeType: isWeapon ? undefined : upgradeType,
        ownQty: cost.own,
        expect: cost.total,
      });
      setMsg({
        ok: true,
        text:
          tab === 'repair'
            ? `✓ Tamir edildi! Ömrüne ${job.gain} gün eklendi.`
            : isWeapon
              ? `✓ Geliştirildi! Yeni seviye ${(item.level || 1) + 1}.`
              : `✓ ${upgradeType === 'gear' ? 'Vites' : 'Depo'} geliştirildi!`,
      });
      setTouched(false);
    } catch (err) {
      const m = String(err?.message || '');
      if (m.startsWith('price-changed')) {
        setSeenPrice('__stale__');
        setMsg({ ok: false, text: 'Dükkân fiyatı az önce değişti. Yeni tutarı kontrol edip tekrar onayla.' });
      } else if (m === 'gold') setMsg({ ok: false, text: 'Altının yetmiyor.' });
      else if (m === 'shop-short') setMsg({ ok: false, text: 'Dükkânda yeterli malzeme kalmadı.' });
      else if (m === 'own-short') setMsg({ ok: false, text: 'Envanterinde yeterli malzeme yok.' });
      else if (m === 'not-present') setMsg({ ok: false, text: 'Dükkânın içinde olmalısın.' });
      else setMsg({ ok: false, text: m || 'İşlem yapılamadı.' });
    } finally {
      setBusy(false);
    }
  };

  // ---- ürün bilgileri ---------------------------------------------------------------
  const cap = item ? lifeCapOf(itemType) : 0;
  const life = item ? Math.max(0, item.lifeDays ?? cap) : 0;
  const repairsUsed = item ? item.repairsUsed || 0 : 0;
  const repairsLeft = VEHICLE_WEAPON_MAX_REPAIRS - repairsUsed;
  const level = item?.level || 1;
  const img = item ? (isWeapon ? weaponImage(item.catalogId) : vehicleImage(item.catalogId)) : null;
  const name = item ? (isWeapon ? item.name : vehicleDisplayName(item)) : '';
  const gain = tab === 'repair' && !job?.block ? job?.gain || 0 : 0;
  const lifeCls = life <= Math.ceil(cap * 0.2) ? 'crit' : life <= Math.ceil(cap * 0.5) ? 'low' : '';
  const kindName = isWeapon ? 'silah' : 'araba';
  const actName = tab === 'repair' ? 'Tamir et' : 'Geliştir';

  return (
    <div className="bz wk-root" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>🛠️ {isWeapon ? 'Silah' : 'Araba'} tamir ve geliştirme</h3>
          <p>{isGame ? 'Oyunun dükkânı · malzeme sınırsız' : `${shop.houseDoc?.name || 'Dükkân'}${isOwner ? ' · senin dükkânın (ücret ödemezsin)' : ''}`}</p>
        </div>
        {onClose && (
          <button className="bz-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        )}
      </div>
      <div className="bz-wallet">
        <span>Cebindeki altın</span>
        <b>
          <Gold v={gold} />
        </b>
      </div>

      <div className="bz-tabs">
        <button className={tab === 'repair' ? 'on' : ''} onClick={() => setTab('repair')}>
          🔧 Tamir
        </button>
        <button className={tab === 'upgrade' ? 'on' : ''} onClick={() => setTab('upgrade')}>
          ⬆️ Geliştirme
        </button>
      </div>

      {items.length === 0 ? (
        <p className="bz-note">Hiç {kindName}n yok.</p>
      ) : (
        <>
          {items.length > 1 && (
            <div className="bz-field">
              <label>{isWeapon ? 'Silahını seç' : 'Arabanı seç'}</label>
              <div className="wk-picker">
                {items.map((x) => {
                  const xi = isWeapon ? weaponImage(x.catalogId) : vehicleImage(x.catalogId);
                  return (
                    <button key={x.id} className={x.id === item?.id ? 'on' : ''} onClick={() => setItemId(x.id)}>
                      {xi ? <img src={xi} alt="" /> : <span>{isWeapon ? '🔫' : '🚗'}</span>}
                      <small>{isWeapon ? x.name : vehicleDisplayName(x)}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ürün kartı */}
          <div className="bz-sec">
            <div className="wk-item">
              <div className="wk-item-img">{img ? <img src={img} alt="" /> : <span>{isWeapon ? '🔫' : '🚗'}</span>}</div>
              <div className="wk-item-main">
                <b>{name}</b>
                {isWeapon ? (
                  <small>
                    Güç {fmt(item.power)} · Seviye {level}/{WEAPON_MAX_LEVEL}
                  </small>
                ) : (
                  <small>
                    Vites {item.gearLevel} · Depo {fmt((item.baseTank || 0) + (item.tankBonus || 0))}
                  </small>
                )}
              </div>
            </div>
            <div className="bz-row">
              <span>Ömür</span>
              <b className={lifeCls === 'crit' ? 'bz-bad' : ''}>
                {life} / {cap} gün{gain > 0 && <em className="bz-good"> → {life + gain}</em>}
              </b>
            </div>
            <div className={`bz-meter ${lifeCls}`}>
              {Array.from({ length: cap }, (_, i) => (
                <i key={i} className={i < life ? 'on' : i < life + gain ? 'gain' : ''} />
              ))}
            </div>
            <div className="bz-row">
              <span>Kalan tamir hakkı</span>
              <b className={repairsLeft <= 0 ? 'bz-bad' : ''}>
                {repairsLeft} / {VEHICLE_WEAPON_MAX_REPAIRS}
              </b>
            </div>
            {isWeapon ? (
              <div className="bz-row">
                <span>Geliştirme</span>
                <b className={level >= WEAPON_MAX_LEVEL ? 'bz-good' : ''}>{level >= WEAPON_MAX_LEVEL ? 'En yüksek seviyede' : `Açık (seviye ${level} → ${level + 1})`}</b>
              </div>
            ) : (
              <>
                <div className="bz-row">
                  <span>Vites geliştirmesi</span>
                  <b className={item.gearUpgraded ? 'bz-good' : ''}>{item.gearUpgraded ? '✓ Yapıldı' : 'Yapılabilir'}</b>
                </div>
                <div className="bz-row">
                  <span>Depo geliştirmesi</span>
                  <b className={item.tankUpgraded ? 'bz-good' : ''}>{item.tankUpgraded ? '✓ Yapıldı' : 'Yapılabilir'}</b>
                </div>
              </>
            )}
          </div>

          {tab === 'upgrade' && !isWeapon && (
            <div className="bz-tabs">
              <button className={upgradeType === 'gear' ? 'on' : ''} onClick={() => setUpgradeType('gear')}>
                ⚙️ Vites {item.gearUpgraded && '✓'}
              </button>
              <button className={upgradeType === 'tank' ? 'on' : ''} onClick={() => setUpgradeType('tank')}>
                ⛽ Depo {item.tankUpgraded && '✓'}
              </button>
            </div>
          )}

          {blockText ? (
            <p className={blockOk ? 'bz-ok' : 'bz-warn'}>{blockText}</p>
          ) : (
            <>
              {/* malzeme */}
              <div className="bz-sec">
                <p className="bz-sec-title">
                  Gerekli malzeme: {mat.icon} {mat.name} × {fmt(qty)}
                </p>
                <div className="bz-row">
                  <span>Senin envanterinde</span>
                  <b className={have >= qty ? 'bz-good' : ''}>{fmt(have)} adet</b>
                </div>
                <div className="bz-row">
                  <span>Dükkânın stoğunda</span>
                  <b>{isGame ? 'Sınırsız' : `${fmt(shopHave)} adet`}</b>
                </div>
                {tab === 'upgrade' && isWeapon && (
                  <div className="bz-row">
                    <span>Güç</span>
                    <b className="bz-good">
                      {fmt(item.power)} → {fmt(weaponPowerAtLevel(item.basePower, level + 1))}
                    </b>
                  </div>
                )}
                {impossible ? (
                  <p className="bz-warn">
                    Yeterli malzeme yok: {fmt(qty)} adet lazım, sende {fmt(have)}, dükkânda {fmt(shopHave)} var.
                  </p>
                ) : (
                  maxOwn > minOwn && (
                    <div className="bz-field">
                      <label>
                        Kendi malzemenden kullan: <b>{fmt(ownQty)}</b> adet · dükkândan satın al: <b>{fmt(qty - ownQty)}</b> adet
                      </label>
                      <input
                        className="bz-range"
                        type="range"
                        min={minOwn}
                        max={maxOwn}
                        step={1}
                        value={ownQty}
                        onChange={(e) => {
                          setTouched(true);
                          setOwnQty(Number(e.target.value));
                        }}
                      />
                      <div className="bz-range-ends">
                        <span>Daha çok dükkândan</span>
                        <span>Daha çok kendimden</span>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* ücret */}
              {!impossible && (
                <div className={`bz-sec${priceChanged ? ' wk-changed-box' : ''}`}>
                  <p className="bz-sec-title">Ücret</p>
                  <div className="bz-row">
                    <span>
                      Malzeme ücreti ({fmt(cost.shopQty)} adet × {fmt(price.mat)})
                    </span>
                    <b>
                      <Gold v={cost.material} />
                    </b>
                  </div>
                  <div className="bz-row">
                    <span>
                      İşçilik ({fmt(qty)} adet × {fmt(price.labor)})
                    </span>
                    <b>
                      <Gold v={cost.labor} />
                    </b>
                  </div>
                  {cost.own > 0 && (
                    <div className="bz-row">
                      <span>Kendi malzemen ({fmt(cost.own)} adet)</span>
                      <b className="bz-good">ücretsiz</b>
                    </div>
                  )}
                  <div className="bz-row total">
                    <span>Toplam</span>
                    <b className={poor ? 'bz-bad' : ''}>
                      <Gold v={payable} />
                    </b>
                  </div>
                  {isOwner && <p className="bz-hint">Kendi dükkânında ücret ödemezsin; sadece malzeme stoğundan düşer.</p>}
                  {poor && <p className="bz-warn">Altının yetmiyor: {fmt(payable)} altın gerekli, cebinde {fmt(gold)} var.</p>}
                  {priceChanged && (
                    <button className="bz-btn ghost sm" onClick={() => setSeenPrice(priceKey)}>
                      Yeni fiyatı gördüm
                    </button>
                  )}
                </div>
              )}

              <button className="bz-btn wide" disabled={!canDo} onClick={confirm}>
                {busy ? 'İşleniyor…' : `${tab === 'repair' ? '🔧' : '⬆️'} ${actName} — ${fmt(payable)} altın`}
              </button>
            </>
          )}
          {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
        </>
      )}
    </div>
  );
}
