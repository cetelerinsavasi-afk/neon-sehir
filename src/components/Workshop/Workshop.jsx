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
  autoOwnQty,
  lifeCapOf,
  VEHICLE_WEAPON_MAX_REPAIRS,
  WEAPON_MAX_LEVEL,
  weaponPowerAtLevel,
} from '../../../functions/itemRules.js';
import { BIZ_MATERIALS } from '../../../functions/businessCatalogData.js';
import { CarStatBars, LevelPips, vehicleRaceLevel, VEHICLE_MAX_LEVEL } from '../RaceTrackScreen/CarStats';
import '../../styles/bizui.css';
import './Workshop.css';

// =============================================================================
// Atölye (silahçı: silah · modifiye garajı: araba) — tamir ve geliştirme.
// v79 sade akış: 1) sekme seç (Tamir / Geliştir) 2) ürünü seç 3) tek butona bas.
// Malzeme miktarını oyuncu SEÇMEZ: envanterdeki malzeme önce ve bedava
// kullanılır, eksik kalan dükkândan alınır; ikisi birlikte yetmiyorsa iş
// yapılamaz. Tutar sunucuda (shop.js) aynı kuralla (itemRules.js) hesaplanır.
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

  const job = item ? workshopJob({ itemType, item, action: tab, upgradeType: isWeapon ? undefined : 'level' }) : null;
  const material = job?.material || (tab === 'repair' ? 'tamirMalzemesi' : isWeapon ? 'silahUpgrade' : 'arabaGelistirme');
  const mat = BIZ_MATERIALS[material] || { icon: '📦', name: material };
  const price = isGame ? gameWorkshopPrice(material) : clampWorkshopPrice(material, shop.houseDoc?.bizPrices?.materials?.[material]);
  const priceKey = `${material}:${price.mat}:${price.labor}`;
  const qty = job?.qty || 0;
  const have = Math.max(0, Number(inventory[material] || 0));
  const shopHave = isGame ? Infinity : Math.max(0, Number(stock[material] || 0));

  // önce envanter (bedava), eksik kalan dükkândan — oyuncu seçmez
  const ownQty = autoOwnQty(qty, have);
  const fromShop = qty - ownQty;
  const notEnough = qty > 0 && fromShop > shopHave;
  const cost = workshopCost({ mat: price.mat, labor: price.labor, qty, ownQty });

  useEffect(() => {
    setMsg(null);
  }, [item?.id, tab]);
  // ürün/sekme değişince o anki fiyat "görülmüş" sayılır; panel açıkken
  // dükkân sahibi fiyatı değiştirirse buton bir kez onay ister.
  useEffect(() => {
    setSeenPrice(priceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, item?.id]);
  const priceChanged = seenPrice !== null && seenPrice !== priceKey;

  const gold = Number(player?.gold || 0);
  const isOwner = !isGame && shop.houseDoc?.ownerUid === user?.uid;
  const payable = isOwner ? 0 : cost.total;
  const poor = gold < payable;

  // ---- ürün bilgileri ---------------------------------------------------------------
  const cap = item ? lifeCapOf(itemType) : 0;
  const life = item ? Math.max(0, item.lifeDays ?? cap) : 0;
  const repairsLeft = VEHICLE_WEAPON_MAX_REPAIRS - (item?.repairsUsed || 0);
  const level = isWeapon ? item?.level || 1 : vehicleRaceLevel(item);
  const maxLevel = isWeapon ? WEAPON_MAX_LEVEL : VEHICLE_MAX_LEVEL;
  const img = item ? (isWeapon ? weaponImage(item.catalogId) : vehicleImage(item.catalogId)) : null;
  const name = item ? (isWeapon ? item.name : vehicleDisplayName(item)) : '';
  const gain = tab === 'repair' && !job?.block ? job?.gain || 0 : 0;
  const lifeCls = life <= Math.ceil(cap * 0.2) ? 'crit' : life <= Math.ceil(cap * 0.5) ? 'low' : '';
  const kindName = isWeapon ? 'silah' : 'araba';
  const isRepair = tab === 'repair';
  const actIcon = isRepair ? '🔧' : '⬆️';
  const actName = isRepair ? 'Tamir et' : 'Geliştir';

  // ---- neden yapılamıyor? (tek cümle) --------------------------------------------------
  let block = null; // { text, ok }
  if (job?.block === 'repairs') block = { text: `Tamir hakkı bitti (${VEHICLE_WEAPON_MAX_REPAIRS}/${VEHICLE_WEAPON_MAX_REPAIRS} kullanıldı). Bu ${kindName} artık tamir edilemez.` };
  else if (job?.block === 'full') block = { ok: true, text: 'Ömrü zaten tam dolu, tamire gerek yok.' };
  else if (job?.block === 'maxLevel') block = { ok: true, text: `En yüksek seviyede (${maxLevel}/${maxLevel}). Daha fazla geliştirilemez.` };
  else if (job?.block === 'listed') block = { text: 'Bu ürün ilanda/vitrinde. Önce ilandan kaldır.' };
  else if (job?.block) block = { text: 'Bu işlem bu ürün için yapılamaz.' };

  let reason = null; // butonun altındaki kırmızı cümle
  if (!block) {
    if (notEnough) reason = `Malzeme yetmiyor: ${fmt(qty)} lazım, sende ${fmt(have)}, dükkânda ${fmt(shopHave)} var.`;
    else if (poor) reason = `Altının yetmiyor: ${fmt(payable)} altın lazım, cebinde ${fmt(gold)} var.`;
  }
  const canDo = Boolean(item && job && !block && qty > 0 && !reason && !busy);

  const confirm = async () => {
    if (!canDo) return;
    if (priceChanged) {
      // ilk dokunuş: yeni fiyatı gördüğünü onayla
      setSeenPrice(priceKey);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({
        op: 'workshop',
        shop: isGame ? 'game' : shop.houseId,
        shopType: shop.type,
        itemId: item.id,
        action: tab,
        upgradeType: isWeapon ? undefined : 'level',
        expect: cost.total,
      });
      setMsg({
        ok: true,
        text: isRepair
          ? `✓ Tamir edildi! Ömrüne ${job.gain} gün eklendi.`
          : isWeapon
            ? `✓ Geliştirildi! Yeni seviye ${(item.level || 1) + 1}.`
            : `✓ Geliştirildi! Yeni seviye ${vehicleRaceLevel(item) + 1} — hız, ivme ve nitro arttı.`,
      });
    } catch (err) {
      const m = String(err?.message || '');
      if (m.startsWith('price-changed')) {
        setSeenPrice('__stale__');
        setMsg({ ok: false, text: 'Tutar az önce değişti. Butondaki yeni tutarı kontrol edip tekrar bas.' });
      } else if (m === 'gold') setMsg({ ok: false, text: 'Altının yetmiyor.' });
      else if (m === 'shop-short' || m === 'own-short') setMsg({ ok: false, text: 'Malzeme yetmiyor (az önce azalmış olabilir).' });
      else if (m === 'not-present') setMsg({ ok: false, text: 'Dükkânın içinde olmalısın.' });
      else setMsg({ ok: false, text: m || 'İşlem yapılamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const btnText = busy
    ? 'İşleniyor…'
    : notEnough
      ? 'Malzeme yetmiyor'
      : poor
        ? 'Altın yetmiyor'
        : priceChanged
      ? `Fiyat değişti: ${fmt(payable)} altın — onayla`
      : payable > 0
        ? `${actIcon} ${actName} · ${fmt(payable)} altın`
        : `${actIcon} ${actName} · ücretsiz`;

  return (
    <div className="bz wk-root" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>🛠️ {isWeapon ? 'Silah' : 'Araba'} atölyesi</h3>
          <p>{isGame ? 'Oyunun dükkânı' : `${shop.houseDoc?.name || 'Dükkân'}${isOwner ? ' · senin dükkânın' : ''}`}</p>
        </div>
        {onClose && (
          <button className="bz-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        )}
      </div>

      <div className="bz-tabs wk-tabs">
        <button className={isRepair ? 'on' : ''} onClick={() => setTab('repair')}>
          🔧 Tamir
          <small>ömrü uzat</small>
        </button>
        <button className={!isRepair ? 'on' : ''} onClick={() => setTab('upgrade')}>
          ⬆️ Geliştir
          <small>{isWeapon ? 'gücü artır' : 'hızı artır'}</small>
        </button>
      </div>

      {items.length === 0 ? (
        <p className="bz-note">Hiç {kindName}n yok.</p>
      ) : (
        <>
          {items.length > 1 && (
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
          )}

          {/* 1 — ürün ve işin sonucu */}
          <div className="bz-sec">
            <div className="wk-item">
              <div className="wk-item-img">{img ? <img src={img} alt="" /> : <span>{isWeapon ? '🔫' : '🚗'}</span>}</div>
              <div className="wk-item-main">
                <b>{name}</b>
                {isWeapon ? (
                  <small>
                    Seviye {level}/{maxLevel} · Güç {fmt(item.power)}
                  </small>
                ) : (
                  <small>
                    <LevelPips level={level} />
                  </small>
                )}
              </div>
            </div>

            {isRepair ? (
              <>
                <div className="bz-row">
                  <span>Ömür</span>
                  <b className={lifeCls === 'crit' ? 'bz-bad' : ''}>
                    {life} gün{gain > 0 && <em className="bz-good"> → {life + gain} gün</em>}
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
              </>
            ) : isWeapon ? (
              <>
                <div className="bz-row">
                  <span>Seviye</span>
                  <b>{level < maxLevel ? <>{level} <em className="bz-good">→ {level + 1}</em></> : `${level} (en yüksek)`}</b>
                </div>
                {level < maxLevel && (
                  <div className="bz-row">
                    <span>Güç</span>
                    <b>
                      {fmt(item.power)} <em className="bz-good">→ {fmt(weaponPowerAtLevel(item.basePower, level + 1))}</em>
                    </b>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bz-row">
                  <span>Seviye</span>
                  <b>{level < maxLevel ? <>{level} <em className="bz-good">→ {level + 1}</em></> : `${level} (en yüksek)`}</b>
                </div>
                <div className="wk-carstats">
                  <CarStatBars catalogId={item.catalogId} level={level} next={level < maxLevel} />
                </div>
              </>
            )}
          </div>

          {block ? (
            <p className={block.ok ? 'bz-ok' : 'bz-warn'}>{block.text}</p>
          ) : (
            <>
              {/* 2 — malzeme: otomatik paylaştırılır */}
              <div className="bz-sec">
                <p className="bz-sec-title">
                  Gerekli: {mat.icon} {mat.name} × {fmt(qty)}
                </p>
                <div className="wk-split">
                  <div className={`wk-src${ownQty > 0 ? ' on' : ''}`}>
                    <span>🎒 Envanterinden</span>
                    <b>{fmt(ownQty)}</b>
                    <small>{ownQty > 0 ? 'bedava' : 'sende yok'}</small>
                  </div>
                  <div className={`wk-src${fromShop > 0 ? ' on' : ''}${notEnough ? ' bad' : ''}`}>
                    <span>🏪 Dükkândan</span>
                    <b>{fmt(fromShop)}</b>
                    <small>{notEnough ? `dükkânda ${fmt(shopHave)} var` : fromShop > 0 ? `tanesi ${fmt(price.mat)} altın` : 'gerek yok'}</small>
                  </div>
                </div>
                <p className="bz-hint">Envanterindeki malzeme önce ve bedava kullanılır, eksik kalan dükkândan alınır.</p>
              </div>

              {/* 3 — tek buton */}
              {!notEnough && (
                <div className={`wk-pay${priceChanged ? ' changed' : ''}`}>
                  <div>
                    <span>Ödeyeceğin</span>
                    <small>
                      {isOwner
                        ? 'Kendi dükkânın: ücret yok, stoktan düşer'
                        : cost.material > 0
                          ? `İşçilik ${fmt(cost.labor)} + malzeme ${fmt(cost.material)}`
                          : `Sadece işçilik (${fmt(qty)} × ${fmt(price.labor)})`}
                    </small>
                  </div>
                  <b className={poor ? 'bz-bad' : ''}>
                    <Gold v={payable} />
                  </b>
                </div>
              )}

              <button className="bz-btn wide wk-go" disabled={!canDo} onClick={confirm}>
                {btnText}
              </button>
              {reason ? (
                <p className="bz-warn">{reason}</p>
              ) : (
                <p className="wk-wallet">
                  Cebinde <Gold v={gold} />
                </p>
              )}
            </>
          )}
          {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
        </>
      )}
    </div>
  );
}
