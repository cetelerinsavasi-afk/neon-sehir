// SADECE önizleme (v77): eldeki ürün çizimlerinin tamamı
import { createRoot } from 'react-dom/client';
import HeldIcon from '../src/components/HouseScreen/HeldIcon';
import { HOUSE_PRODUCTS } from '../functions/houseCatalogData.js';
import '../src/index.css';

createRoot(document.getElementById('root')).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#1a1f2b', color: '#fff' }}>
    {Object.keys(HOUSE_PRODUCTS).map((k) => (
      <div key={k} style={{ textAlign: 'center', fontSize: 12 }}>
        <HeldIcon product={k} size={72} />
        <div>{HOUSE_PRODUCTS[k].label}</div>
      </div>
    ))}
  </div>
);
window.__ready = true;
