// Ürün kalemi anahtarı → görünen ad/fiyat/görsel (silah:3, araba:5, yasakliMadde)
import { weaponCatalog } from '../../data/weaponCatalog';
import { vehicleCatalog } from '../../data/vehicleCatalog';
import { productOf } from './gangConstants';

export function itemsFor(productId) {
  const p = productOf(productId);
  if (p.kind === 'weapon') return weaponCatalog.map((w) => ({ key: `silah:${w.id}`, label: w.name, storePrice: w.price, image: w.image, sub: `💪 ${w.power.toLocaleString('tr-TR')} güç` }));
  if (p.kind === 'vehicle') return vehicleCatalog.map((v) => ({ key: `araba:${v.id}`, label: v.name, storePrice: v.price, image: v.image, sub: `⚙️ vites ${v.gearLevel}` }));
  return [{ key: p.id, label: p.label, storePrice: p.storePrice, emoji: p.emoji }];
}

export function itemInfo(key) {
  if (key.startsWith('silah:')) {
    const w = weaponCatalog.find((x) => String(x.id) === key.slice(6));
    return { label: w?.name || key, storePrice: w?.price || 0, emoji: '🔫', image: w?.image, product: 'silah' };
  }
  if (key.startsWith('araba:')) {
    const v = vehicleCatalog.find((x) => String(x.id) === key.slice(6));
    return { label: v?.name || key, storePrice: v?.price || 0, emoji: '🚗', image: v?.image, product: 'araba' };
  }
  const p = productOf(key);
  return { label: p.label, storePrice: p.storePrice || 0, emoji: p.emoji, product: p.id };
}
