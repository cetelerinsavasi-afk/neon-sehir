import { HOUSE_PRODUCTS } from '../../../functions/houseCatalogData.js';
import { heldDataUrl } from './heldArt';

// v77 — yiyecek/içecek/silah ürününün çizimi (eldekiyle aynı görsel)
export default function HeldIcon({ product, size = 18, className = '' }) {
  if (!product) return null;
  return (
    <img
      className={`held-icon ${className}`}
      src={heldDataUrl(product)}
      alt={HOUSE_PRODUCTS[product]?.label || ''}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', verticalAlign: 'middle', display: 'inline-block' }}
    />
  );
}
