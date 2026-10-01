// v70 — 2. El Pazarı'nda çete ilanları artık AYRI bir bölümde değil, oyuncu
// ilanlarıyla BİREBİR aynı kartlarda görünür (satıcı adı = çete adı). Aynı
// çetenin aynı ürünü aynı fiyata koyduğu ilanlar tek ilanda birleşir (sunucu
// listDepotItem yeni ilanı mevcut ilana ekler; eski ilanlar burada birleştirilir).
// Fiyatı uygunsa "Avantajlı Ürünler"e de girer. Satın alma çete sistemi
// üzerinden yapılır (para çete kasasına, ürün alıcıya YENİ olarak).
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { callGang, friendlyError, newRequestId } from './gangApi';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { weaponCatalog } from '../../data/weaponCatalog';

const VEHICLE_LIFE = 20;
const WEAPON_LIFE = 10;

// Çete ilanını oyuncu ilanı biçimine çevirir (ListingCard / avantajlı hesap aynı alanları okur)
function toPlayerListing(group) {
  const l = group[0];
  const quantity = group.reduce((s, x) => s + Number(x.quantity || 0), 0);
  const base = {
    id: `gang_${l.id}`,
    gang: true,
    gangListings: group.map((x) => ({ id: x.id, quantity: Number(x.quantity || 0) })),
    sellerId: `gang:${l.gangId}`,
    sellerName: l.gangName,
    gangName: l.gangName,
    quantity,
    unitPrice: l.unitPrice,
    createdAt: null,
    createdAtMs: l.createdAtMs,
  };
  const cid = Number(l.catalogId);
  if (l.itemType === 'vehicle') {
    const c = vehicleCatalog.find((v) => v.id === cid) || {};
    return { ...base, itemType: 'vehicle', vehicleCatalogId: cid, vehicleModel: l.label || c.name, vehicleGearLevel: c.gearLevel, vehicleTank: c.baseTank, vehicleGearUpgraded: false, vehicleTankUpgraded: false, vehicleLifeDays: VEHICLE_LIFE, vehicleRepairsUsed: 0, price: l.unitPrice };
  }
  if (l.itemType === 'weapon') {
    const c = weaponCatalog.find((w) => w.id === cid) || {};
    return { ...base, itemType: 'weapon', weaponCatalogId: cid, weaponName: l.label || c.name, weaponLevel: 1, weaponPower: c.power, weaponLifeDays: WEAPON_LIFE, weaponRepairsUsed: 0, price: l.unitPrice };
  }
  return { ...base, itemType: 'material', materialType: l.materialType, price: l.unitPrice * quantity };
}

export function useGangMarketListings() {
  const [cfg, setCfg] = useState(null);
  const [list, setList] = useState([]);
  useEffect(() => onSnapshot(doc(db, 'gangSystem/config'), (s) => setCfg(s.data() || null), () => setCfg(null)), []);
  const worldId = cfg?.liveOpen ? cfg.liveWorldId : null;
  useEffect(() => {
    if (!worldId) {
      setList([]);
      return undefined;
    }
    const q = query(collection(db, `gangWorlds/${worldId}/market`), where('status', '==', 'open'), limit(100));
    return onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => Number(l.quantity || 0) > 0)),
      () => setList([])
    );
  }, [worldId]);
  // aynı çete + aynı ürün + aynı fiyat → tek ilan
  const groups = new Map();
  for (const l of list) {
    const k = `${l.gangId}|${l.itemKey}|${l.unitPrice}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  return [...groups.values()].map(toPlayerListing);
}

// Birleşik ilandan qty adet satın al (gerekirse birden fazla eski ilandan sırayla)
export async function buyGangListing(listing, qty) {
  let left = Math.max(1, Math.floor(qty || 1));
  for (const g of listing.gangListings || []) {
    if (left <= 0) break;
    const n = Math.min(left, g.quantity);
    if (n <= 0) continue;
    try {
      await callGang({ world: 'live' }, 'buyMarketListing', { listingId: g.id, qty: n, requestId: newRequestId() });
    } catch (e) {
      throw new Error(friendlyError(e));
    }
    left -= n;
  }
  if (left > 0) throw new Error('İlanda bu kadar ürün kalmadı.');
}

// Geriye dönük uyum: eski import'lar kırılmasın (bölüm artık kategorilerin içinde)
export default function GangMarketSection() {
  return null;
}
