import { useEffect, useMemo, useState } from 'react';
import { useWeapons } from '../../hooks/useWeapons';
import { useVehicles } from '../../hooks/useVehicles';
import { useInventory } from '../../hooks/useInventory';
import { useShopListings } from '../../hooks/useShopListings';
import { shopAction } from '../../services/gameActions';
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleImage, vehicleDisplayName } from '../VehicleCard/VehicleCard';
import HoldButton from '../HoldButton/HoldButton';
import PriceField from './PriceField';
import { BIZ_TAX_RATE, RESALE_TAX_RATE, resaleTax } from '../../../functions/tax.js';
import { bizErrText } from '../../lib/bizErrors';
import { WORKSHOP_MATERIALS, workshopBand, gameWorkshopPrice, clampWorkshopPrice, itemListingBand, lifeCapOf, VEHICLE_WEAPON_MAX_REPAIRS } from '../../../functions/itemRules.js';
import { BIZ_MATERIALS, midnightDayKey } from '../../../functions/businessCatalogData.js';
import '../../styles/bizui.css';
import './Shop.css';

// =============================================================================
// v77 — Silahçı / Modifiye Garajı / Araba Galerisi: SAHİP ekranları
//   Fiyatlar sekmesi : atölye fiyatları (malzeme + işçilik) · vitrindeki ürünler
//   Envanter sekmesi : malzeme stoğu (envanterim ⇄ dükkân) · vitrine ürün ekle
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const weaponImage = (id) => weaponCatalog.find((w) => w.id === id)?.image;
const SHOP_MAX = 10;
const VITRIN_KIND = { silahci: 'weapon', galeri: 'vehicle' };
const KIND_TXT = { weapon: { one: 'silah', cap: 'Silah', icon: '🔫' }, vehicle: { one: 'araba', cap: 'Araba', icon: '🚗' } };

function Gold({ v }) {
  return (
    <span className="bz-gold">
      <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
      {fmt(v)}
    </span>
  );
}

// ---- Atölye fiyatları -----------------------------------------------------------
function MaterialPrices({ houseId, houseDoc, type }) {
  const mats = WORKSHOP_MATERIALS[type] || [];
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const saved = houseDoc?.bizPrices?.materials || {};
  useEffect(() => {
    setDraft(Object.fromEntries(mats.map((k) => [k, clampWorkshopPrice(k, saved[k])])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs, type]);
  const savedOf = (k) => clampWorkshopPrice(k, saved[k]);
  const dirty = mats.some((k) => draft[k] && (draft[k].mat !== savedOf(k).mat || draft[k].labor !== savedOf(k).labor));
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({ op: 'prices', houseId, materials: draft });
      setMsg({ ok: true, text: '✓ Atölye fiyatların kaydedildi.' });
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🛠️ Atölye fiyatları</p>
      {mats.map((k) => {
        const b = workshopBand(k);
        const g = gameWorkshopPrice(k);
        const d = draft[k] || g;
        return (
          <div key={k} className="bz-sec sh-matbox">
            <p className="bz-sec-title">
              {BIZ_MATERIALS[k].icon} {BIZ_MATERIALS[k].name} — 1 adet için
            </p>
            <PriceField
              label="Malzeme fiyatı"
              hint="Senin stoğundan kullanılan her adet için."
              min={b.matMin}
              max={b.matMax}
              value={d.mat}
              refPrice={g.mat}
              refLabel="Oyunun dükkânı"
              saved={savedOf(k).mat}
              onChange={(v) => setDraft((x) => ({ ...x, [k]: { ...d, mat: v } }))}
            />
            <PriceField
              label="İşçilik ücreti"
              hint="Her adet için her zaman alınır (müşteri kendi malzemesini getirse de)."
              min={b.laborMin}
              max={b.laborMax}
              value={d.labor}
              refPrice={g.labor}
              refLabel="Oyunun dükkânı"
              saved={savedOf(k).labor}
              onChange={(v) => setDraft((x) => ({ ...x, [k]: { ...d, labor: v } }))}
            />
            <div className="bz-row total">
              <span>Müşteri 1 adet için öder (senin malzemenle)</span>
              <b>
                <Gold v={d.mat + d.labor} /> <small className="sh-cmp">oyunda {fmt(g.mat + g.labor)}</small>
              </b>
            </div>
            <p className="bz-hint">🏛️ Kazancından %{Math.round(BIZ_TAX_RATE * 100)} vergi kesilir (örn. 100 altınlık işten sana 90 kalır).</p>
          </div>
        );
      })}
      <button className="bz-btn gold wide" disabled={busy || !dirty} onClick={save}>
        {busy ? 'Kaydediliyor…' : dirty ? '💾 Fiyatları kaydet' : '✓ Fiyatlar kayıtlı'}
      </button>
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

function itemView(kind, it) {
  const cap = lifeCapOf(kind);
  return {
    img: kind === 'weapon' ? weaponImage(it.catalogId) : vehicleImage(it.catalogId),
    name: kind === 'weapon' ? it.name : vehicleDisplayName(it),
    sub: kind === 'weapon' ? `Seviye ${it.level || 1} · güç ${fmt(it.power)}` : `Vites ${it.gearLevel} · depo ${fmt((it.baseTank || 0) + (it.tankBonus || 0))}`,
    cap,
    life: Math.max(0, it.lifeDays ?? cap),
    repairsLeft: VEHICLE_WEAPON_MAX_REPAIRS - (it.repairsUsed || 0),
  };
}

// ---- Vitrindeki ürünler (Fiyatlar sekmesi) ---------------------------------------------
function VitrinManager({ houseId, kind }) {
  const { weapons } = useWeapons();
  const { vehicles } = useVehicles();
  const listings = useShopListings(houseId);
  const items = (kind === 'weapon' ? weapons : vehicles).filter((x) => x.shopHouseId === houseId);
  const K = KIND_TXT[kind];
  const [open, setOpen] = useState(null);
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const run = async (key, payload, okText) => {
    setBusy(key);
    setMsg(null);
    try {
      await shopAction({ houseId, ...payload });
      setOpen(null);
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">
        {K.icon} Vitrindeki {K.one}lar ({items.length}/{SHOP_MAX})
      </p>
      {items.length === 0 && <p className="bz-note">Vitrin boş.</p>}
      {items.map((it) => {
        const v = itemView(kind, it);
        const listing = listings.find((l) => l.id === it.shopListingId);
        const band = itemListingBand(kind, it);
        const isOpen = open === it.id;
        return (
          <div key={it.id} className="bz-item sh-vitem">
            <span className="bz-thumb">{v.img ? <img src={v.img} alt="" /> : K.icon}</span>
            <div className="bz-item-main">
              <b>{v.name}</b>
              <small>{v.sub}</small>
              <small>
                Ömür {v.life}/{v.cap} gün · tamir hakkı {v.repairsLeft}/{VEHICLE_WEAPON_MAX_REPAIRS}
              </small>
              {listing ? (
                <span className="bz-tag ok">
                  Satışta: <Gold v={listing.price} />
                </span>
              ) : (
                <span className="bz-tag warn">Satışta değil (ilana koy)</span>
              )}
              <div className="sh-acts">
                {listing ? (
                  <button className="bz-btn ghost sm" disabled={!!busy} onClick={() => run(`u${it.id}`, { op: 'vitrinUnlist', itemId: it.id }, 'İlan kaldırıldı; ürün vitrinde duruyor.')}>
                    İlanı kaldır
                  </button>
                ) : (
                  <button
                    className="bz-btn gold sm"
                    disabled={!!busy}
                    onClick={() => {
                      setOpen(isOpen ? null : it.id);
                      setPrice(band.max);
                    }}
                  >
                    🏷️ İlana koy
                  </button>
                )}
                <HoldButton className="bz-btn ghost sm" disabled={!!busy} onDone={() => run(`i${it.id}`, { op: 'vitrinInstantSell', itemId: it.id }, `Hemen satıldı: eline ${fmt(band.instant - resaleTax(band.instant))} altın geçti (vergi %1).`)}>
                  ⚡ Basılı tut: hemen sat ({fmt(band.instant - resaleTax(band.instant))} eline geçer)
                </HoldButton>
                <HoldButton className="bz-btn danger sm" disabled={!!busy} onDone={() => run(`r${it.id}`, { op: 'vitrinRemove', itemId: it.id }, 'Envanterine geri alındı (ömrü 1 gün azaldı).')}>
                  ↩ Basılı tut: geri al (ömür −1)
                </HoldButton>
              </div>
              {isOpen && !listing && (
                <div className="bz-field">
                  <PriceField label="Satış fiyatı" min={band.min} max={band.max} value={price} onChange={setPrice} refPrice={band.max} refLabel="Önerilen" taxRate={RESALE_TAX_RATE} />
                  <button className="bz-btn gold wide" disabled={!!busy} onClick={() => run(`l${it.id}`, { op: 'vitrinList', itemId: it.id, price }, 'İlana kondu!')}>
                    🏷️ {fmt(price)} altına ilana koy
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// ---- Envanterden vitrine ekle (Envanter sekmesi) -----------------------------------------
function VitrinAdd({ houseId, kind }) {
  const { weapons } = useWeapons();
  const { vehicles } = useVehicles();
  const all = kind === 'weapon' ? weapons : vehicles;
  const K = KIND_TXT[kind];
  const inShop = all.filter((x) => x.shopHouseId === houseId).length;
  const today = midnightDayKey(Date.now());
  const mine = all.filter((x) => !x.listed);
  const [pick, setPick] = useState(null);
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const sel = mine.find((x) => x.id === pick);
  const band = sel ? itemListingBand(kind, sel) : null;
  const full = inShop >= SHOP_MAX;
  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({ op: 'vitrinAdd', houseId, itemId: pick, price });
      setPick(null);
      setMsg({ ok: true, text: `✓ Vitrine kondu ve ${fmt(price)} altına satışa çıktı.` });
    } catch (e) {
      setMsg({ ok: false, text: bizErrText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">
        ➕ Vitrine {K.one} ekle
      </p>
      {full && <p className="bz-warn">Vitrin dolu.</p>}
      {mine.length === 0 && <p className="bz-note">Eklenecek {K.one} yok.</p>}
      <div className="bz-list">
        {mine.map((it) => {
          const v = itemView(kind, it);
          const reason =
            it.shopBanDayKey === today
              ? 'Bugün vitrinden geri alındı, yarın koyabilirsin'
              : v.life <= 0
                ? 'Ömrü bitmiş'
                : it.mortgaged || it.seizedByBank
                  ? 'İpotekli'
                  : null;
          const blocked = full || Boolean(reason);
          return (
            <button key={it.id} className={`bz-item sh-pickrow${pick === it.id ? ' on' : ''}`} disabled={blocked} onClick={() => {
              setPick(it.id);
              setPrice(itemListingBand(kind, it).max);
            }}>
              <span className="bz-thumb">{v.img ? <img src={v.img} alt="" /> : K.icon}</span>
              <span className="bz-item-main">
                <b>{v.name}</b>
                <small>
                  {v.sub} · ömür {v.life}/{v.cap}
                </small>
                {reason && <small className="bz-bad">{reason}</small>}
              </span>
              {pick === it.id && <span className="bz-tag ok">Seçildi</span>}
            </button>
          );
        })}
      </div>
      {sel && band && (
        <div className="bz-field">
          <PriceField label={`${sel.name || 'Ürün'} — satış fiyatı`} min={band.min} max={band.max} value={price} onChange={setPrice} refPrice={band.max} refLabel="Önerilen" taxRate={RESALE_TAX_RATE} />
          <button className="bz-btn gold wide" disabled={busy} onClick={add}>
            {busy ? 'Ekleniyor…' : `➕ Vitrine koy · ${fmt(price)} altına sat`}
          </button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// ---- Malzeme stoğu: envanterim ⇄ dükkân -------------------------------------------------
function MaterialStock({ houseId, type, inv }) {
  const { inventory } = useInventory();
  const mats = WORKSHOP_MATERIALS[type] || [];
  const [amt, setAmt] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const move = async (k, q) => {
    setBusy(k);
    setMsg(null);
    try {
      await shopAction({ op: 'stock', houseId, material: k, qty: q });
      setAmt((a) => ({ ...a, [k]: 0 }));
      setMsg({ ok: true, k, text: q > 0 ? `✓ ${fmt(q)} adet dükkâna kondu.` : `✓ ${fmt(-q)} adet envanterine alındı.` });
    } catch (e) {
      setMsg({ ok: false, k, text: bizErrText(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">📦 Malzeme stoğu</p>
      {mats.map((k) => {
        const shopN = Number(inv?.materials?.[k] || 0);
        const mineN = Number(inventory[k] || 0);
        const a = Math.max(0, Math.floor(Number(amt[k]) || 0));
        return (
          <div key={k} className="bz-sec sh-matbox">
            <p className="bz-sec-title">
              {BIZ_MATERIALS[k].icon} {BIZ_MATERIALS[k].name}
            </p>
            <div className="bz-row">
              <span>Dükkân stoğunda</span>
              <b className={shopN === 0 ? 'bz-bad' : ''}>{fmt(shopN)} adet</b>
            </div>
            <div className="bz-row">
              <span>Senin envanterinde</span>
              <b>{fmt(mineN)} adet</b>
            </div>
            <div className="bz-field">
              <label>Kaç adet?</label>
              <input className="hh-input sh-num" inputMode="numeric" value={a || ''} placeholder="0" onChange={(e) => setAmt((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} />
              <div className="sh-quick">
                {[10, 100, 1000].map((q) => (
                  <button key={q} onClick={() => setAmt((x) => ({ ...x, [k]: (Math.floor(Number(x[k]) || 0) + q).toString() }))}>
                    +{fmt(q)}
                  </button>
                ))}
                <button onClick={() => setAmt((x) => ({ ...x, [k]: String(mineN) }))}>Envanterimdekinin hepsi</button>
              </div>
            </div>
            <div className="bz-btns">
              <button className="bz-btn ghost sm" disabled={busy === k || a <= 0 || a > shopN} onClick={() => move(k, -a)}>
                ← Envanterime al
              </button>
              <button className="bz-btn gold sm" disabled={busy === k || a <= 0 || a > mineN} onClick={() => move(k, a)}>
                Dükkâna koy →
              </button>
            </div>
            {a > mineN && <p className="bz-hint bz-bad">Envanterinde {fmt(mineN)} adet var.</p>}
            {msg?.k === k && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
          </div>
        );
      })}
    </div>
  );
}

// BizSettings sekmeleri için
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
      {parts.vit && <VitrinAdd houseId={houseId} kind={parts.vit} />}
      {parts.mats && <MaterialStock houseId={houseId} type={type} inv={inv} />}
    </>
  );
}
