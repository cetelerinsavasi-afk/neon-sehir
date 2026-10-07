import { useEffect, useMemo, useState } from 'react';
import { useWeapons } from '../../hooks/useWeapons';
import { useVehicles } from '../../hooks/useVehicles';
import { useInventory } from '../../hooks/useInventory';
import { useShopListings } from '../../hooks/useShopListings';
import { shopAction } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleImage, vehicleDisplayName } from '../VehicleCard/VehicleCard';
import HoldButton from '../HoldButton/HoldButton';
import { ListingCells } from './ShopShowcase';
import { WORKSHOP_MATERIALS, workshopBand, gameWorkshopPrice, clampWorkshopPrice, itemListingBand, lifeCapOf } from '../../../functions/itemRules.js';
import { BIZ_MATERIALS, midnightDayKey } from '../../../functions/businessCatalogData.js';
import './Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const weaponImage = (id) => weaponCatalog.find((w) => w.id === id)?.image;
const SHOP_MAX = 10;
const VITRIN_KIND = { silahci: 'weapon', galeri: 'vehicle' };

// Min–max izli kaydırıcı; üstündeki küçük işaret oyunun (NPC) fiyatı
export function PriceSlider({ min, max, value, npc, onChange, icon }) {
  const pos = (v) => (max > min ? ((v - min) / (max - min)) * 100 : 100);
  return (
    <div className="sh-slider">
      <span className="sh-slider-ico">{icon}</span>
      <div className="sh-slider-track">
        <span className="sh-npc" style={{ left: `${pos(npc)}%` }} title={`★ ${fmt(npc)}`}>
          ★
        </span>
        <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <div className="sh-slider-ends">
          <span>{fmt(min)}</span>
          <span>{fmt(max)}</span>
        </div>
      </div>
      <b className="sh-slider-val">{fmt(value)}</b>
    </div>
  );
}

function MaterialPrices({ houseId, houseDoc, type }) {
  const mats = WORKSHOP_MATERIALS[type] || [];
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(0);
  const saved = houseDoc?.bizPrices?.materials || {};
  useEffect(() => {
    setDraft(Object.fromEntries(mats.map((k) => [k, clampWorkshopPrice(k, saved[k])])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs, type]);
  const dirty = mats.some((k) => draft[k] && (draft[k].mat !== clampWorkshopPrice(k, saved[k]).mat || draft[k].labor !== clampWorkshopPrice(k, saved[k]).labor));
  const save = async () => {
    setBusy(true);
    try {
      await shopAction({ op: 'prices', houseId, materials: draft });
      setOk(Date.now());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sh-section">
      {mats.map((k) => {
        const b = workshopBand(k);
        const g = gameWorkshopPrice(k);
        const d = draft[k] || g;
        return (
          <div key={k} className="sh-mat-price">
            <div className="sh-mat-title">
              {BIZ_MATERIALS[k].icon} <b>{BIZ_MATERIALS[k].name}</b>
              <span className="sh-unit">
                Σ {fmt(d.mat + d.labor)} / ★ {fmt(g.mat + g.labor)}
              </span>
            </div>
            <PriceSlider icon="📦" min={b.matMin} max={b.matMax} npc={g.mat} value={d.mat} onChange={(v) => setDraft((x) => ({ ...x, [k]: { ...d, mat: v } }))} />
            <PriceSlider icon="🛠️" min={b.laborMin} max={b.laborMax} npc={g.labor} value={d.labor} onChange={(v) => setDraft((x) => ({ ...x, [k]: { ...d, labor: v } }))} />
          </div>
        );
      })}
      <button className={`hs-btn gold wide${dirty ? ' cue-pulse' : ''}`} disabled={busy || !dirty} onClick={save} key={ok}>
        {busy ? '…' : ok && !dirty ? '✓' : '💾'}
      </button>
    </div>
  );
}

function itemView(kind, it) {
  return {
    img: kind === 'weapon' ? weaponImage(it.catalogId) : vehicleImage(it.catalogId),
    name: kind === 'weapon' ? `${it.name} · Sv.${it.level || 1}` : vehicleDisplayName(it),
    cap: lifeCapOf(kind),
    life: it.lifeDays ?? lifeCapOf(kind),
  };
}

// Vitrindeki ürünler: ilan fiyatı / yeniden ilan / ilanı kaldır / geri çek / anında sat
function VitrinManager({ houseId, kind }) {
  const { weapons } = useWeapons();
  const { vehicles } = useVehicles();
  const listings = useShopListings(houseId);
  const items = (kind === 'weapon' ? weapons : vehicles).filter((x) => x.shopHouseId === houseId);
  const [open, setOpen] = useState(null);
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (key, payload) => {
    setBusy(key);
    setErr(null);
    try {
      await shopAction({ houseId, ...payload });
      setOpen(null);
    } catch (e) {
      setErr({ key, m: e?.message || '' });
    } finally {
      setBusy(null);
    }
  };
  if (!items.length) {
    return (
      <div className="hb-empty">
        <span>{kind === 'weapon' ? '🔫' : '🚗'}</span>
        <b>0 / {SHOP_MAX}</b>
      </div>
    );
  }
  return (
    <div className="sh-section">
      <div className="sh-count">
        {kind === 'weapon' ? '🔫' : '🚗'} {items.length}/{SHOP_MAX}
      </div>
      {items.map((it) => {
        const v = itemView(kind, it);
        const listing = listings.find((l) => l.id === it.shopListingId);
        const band = itemListingBand(kind, it);
        const isOpen = open === it.id;
        return (
          <div key={it.id} className="sh-vrow">
            <div className="sh-vrow-main">
              <div className="sh-thumb">{v.img ? <img src={v.img} alt="" /> : '📦'}</div>
              <div className="sh-vrow-info">
                <b>{v.name}</b>
                <ListingCells life={v.life} cap={v.cap} />
              </div>
              <span className={`sh-tag${listing ? '' : ' off'}`}>
                {listing ? (
                  <>
                    <span className="gold-coin-icon" style={{ width: 12, height: 12 }} /> {fmt(listing.price)}
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
            <div className="sh-vrow-acts">
              {listing ? (
                <button className="hs-btn ghost" disabled={!!busy} onClick={() => run(`u${it.id}`, { op: 'vitrinUnlist', itemId: it.id })} title="İlanı kaldır">
                  🏷️✕
                </button>
              ) : (
                <button
                  className={`hs-btn gold${!listing ? ' cue-pulse' : ''}`}
                  disabled={!!busy}
                  onClick={() => {
                    setOpen(isOpen ? null : it.id);
                    setPrice(band.max);
                  }}
                  title="İlana koy"
                >
                  🏷️
                </button>
              )}
              <HoldButton className="hs-btn ghost" disabled={!!busy} onDone={() => run(`i${it.id}`, { op: 'vitrinInstantSell', itemId: it.id })}>
                ⚡ {fmt(band.instant)}
              </HoldButton>
              <HoldButton className="hs-btn hb-danger" disabled={!!busy} onDone={() => run(`r${it.id}`, { op: 'vitrinRemove', itemId: it.id })}>
                ✋ ↩ <ListingCells life={v.life} cap={Math.min(v.cap, 4)} broken />
              </HoldButton>
            </div>
            {isOpen && !listing && (
              <div className="sh-listform">
                <PriceSlider icon="🏷️" min={band.min} max={band.max} npc={band.max} value={price} onChange={setPrice} />
                <button className="hs-btn gold wide" disabled={!!busy} onClick={() => run(`l${it.id}`, { op: 'vitrinList', itemId: it.id, price })}>
                  🏷️ {fmt(price)}
                </button>
              </div>
            )}
            {err && err.key.endsWith(it.id) && <p className="hs-err">⚠️ {err.m}</p>}
          </div>
        );
      })}
    </div>
  );
}

// Envanterden vitrine koy
function VitrinAdd({ houseId, kind }) {
  const { weapons } = useWeapons();
  const { vehicles } = useVehicles();
  const all = kind === 'weapon' ? weapons : vehicles;
  const inShop = all.filter((x) => x.shopHouseId === houseId).length;
  const today = midnightDayKey(Date.now());
  const mine = all.filter((x) => !x.listed);
  const [pick, setPick] = useState(null);
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const sel = mine.find((x) => x.id === pick);
  const band = sel ? itemListingBand(kind, sel) : null;
  const full = inShop >= SHOP_MAX;
  const add = async () => {
    setBusy(true);
    setErr(null);
    try {
      await shopAction({ op: 'vitrinAdd', houseId, itemId: pick, price });
      setPick(null);
    } catch (e) {
      setErr(e?.message || '');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sh-section">
      <div className={`sh-count${full ? ' cue-ring' : ''}`}>
        ➕ {kind === 'weapon' ? '🔫' : '🚗'} {inShop}/{SHOP_MAX}
      </div>
      <div className="sh-pickgrid">
        {mine.map((it) => {
          const v = itemView(kind, it);
          const banned = it.shopBanDayKey === today;
          const dead = v.life <= 0;
          const blocked = full || banned || dead || it.mortgaged || it.seizedByBank;
          return (
            <button
              key={it.id}
              className={`sh-pick${pick === it.id ? ' on' : ''}${blocked ? ' cue-dim' : ''}${banned || dead ? ' cue-lock' : ''}`}
              disabled={blocked}
              onClick={() => {
                setPick(it.id);
                setPrice(itemListingBand(kind, it).max);
              }}
              title={v.name}
            >
              <div className="sh-thumb">{v.img ? <img src={v.img} alt="" /> : '📦'}</div>
              <ListingCells life={v.life} cap={v.cap} />
            </button>
          );
        })}
        {mine.length === 0 && (
          <div className="hb-empty">
            <span>{kind === 'weapon' ? '🔫' : '🚗'}</span>
            <b>0</b>
          </div>
        )}
      </div>
      {sel && band && (
        <div className="sh-listform">
          <PriceSlider icon="🏷️" min={band.min} max={band.max} npc={band.max} value={price} onChange={setPrice} />
          <button className="hs-btn gold wide" disabled={busy} onClick={add}>
            {busy ? '…' : `➕ 🏷️ ${fmt(price)}`}
          </button>
          {err && <p className="hs-err">⚠️ {err}</p>}
        </div>
      )}
    </div>
  );
}

// Malzeme stoğu: benim envanterim ⇄ dükkân
function MaterialStock({ houseId, type, inv }) {
  const { inventory } = useInventory();
  const mats = WORKSHOP_MATERIALS[type] || [];
  const [amt, setAmt] = useState({});
  const [busy, setBusy] = useState(null);
  const [cue, setCue] = useState(null);
  const move = async (k, q) => {
    setBusy(k);
    try {
      await shopAction({ op: 'stock', houseId, material: k, qty: q });
      setAmt((a) => ({ ...a, [k]: 0 }));
    } catch {
      setCue({ k, n: Date.now() });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="sh-section">
      {mats.map((k) => {
        const shopN = Number(inv?.materials?.[k] || 0);
        const mineN = Number(inventory[k] || 0);
        const a = Math.max(0, Math.floor(Number(amt[k]) || 0));
        return (
          <div key={`${k}${cue?.k === k ? cue.n : ''}`} className={`sh-stock${cue?.k === k ? ' cue-shake' : ''}`}>
            <div className="sh-stock-head">
              <span className={shopN === 0 ? 'cue-ring sh-stock-n' : 'sh-stock-n'}>🏪 {fmt(shopN)}</span>
              <b>{BIZ_MATERIALS[k].icon}</b>
              <span className="sh-stock-n mine">👜 {fmt(mineN)}</span>
            </div>
            <div className="sh-stock-row">
              <button className="hs-btn ghost" disabled={busy === k || a <= 0 || a > shopN} onClick={() => move(k, -a)}>
                ⬅ 👜
              </button>
              <input className="hh-input sh-num" inputMode="numeric" value={a || ''} placeholder="0" onChange={(e) => setAmt((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} />
              <button className="hs-btn gold" disabled={busy === k || a <= 0 || a > mineN} onClick={() => move(k, a)}>
                🏪 ➡
              </button>
            </div>
            <div className="sh-quick">
              {[10, 100, 1000].map((q) => (
                <button key={q} onClick={() => setAmt((x) => ({ ...x, [k]: (Math.floor(Number(x[k]) || 0) + q).toString() }))}>
                  +{fmt(q)}
                </button>
              ))}
              <button onClick={() => setAmt((x) => ({ ...x, [k]: String(mineN) }))}>👜 max</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// BizSettings sekmeleri için (houseBusinessLogic.BIZ_PRICE_SECTIONS / BIZ_INV_SECTIONS)
export function ShopPriceSection({ houseId, houseDoc }) {
  const type = houseDoc?.biz?.type;
  return (
    <>
      {WORKSHOP_MATERIALS[type] && <MaterialPrices houseId={houseId} houseDoc={houseDoc} type={type} />}
      {VITRIN_KIND[type] && <VitrinManager houseId={houseId} kind={VITRIN_KIND[type]} />}
    </>
  );
}
export function ShopInvSection({ houseId, houseDoc, inv }) {
  const type = houseDoc?.biz?.type;
  const parts = useMemo(() => ({ mats: Boolean(WORKSHOP_MATERIALS[type]), vit: VITRIN_KIND[type] }), [type]);
  return (
    <>
      {parts.mats && <MaterialStock houseId={houseId} type={type} inv={inv} />}
      {parts.vit && <VitrinAdd houseId={houseId} kind={parts.vit} />}
    </>
  );
}
