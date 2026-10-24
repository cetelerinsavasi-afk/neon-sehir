import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useInventory } from '../../hooks/useInventory';
import { MagazaScreen } from '../MarketplaceScreen/MarketplaceScreen';
import { MATERIAL_KEYS, MATERIAL_LABELS, HOLDER_MATERIALS } from '../../../functions/materials.js';
import './Magaza.css';

// =============================================================================
// v124 — Ortak malzeme envanteri + Mağaza girişi
// Malzemeler oyuncunun cebinde değil; fabrika + silahçı/modifiyeci
// işletmelerinin ORTAK envanterinde (users/{uid}/inventory/{malzeme}).
// Atölyeler (tamir / geliştirme) bu envanterden kullanır.
// =============================================================================
const MAT_ICON = { tamirMalzemesi: '🔧', silahUpgrade: '🔫', arabaGelistirme: '🚗' };
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// Tam ekran Mağaza (body'ye portal — hangi panelden açılırsa açılsın üstte)
export function MagazaOverlay({ onClose }) {
  return createPortal(
    <div className="magaza-overlay" role="dialog" aria-label="Mağaza">
      <MagazaScreen onClose={onClose} />
    </div>,
    document.body
  );
}

export function MagazaButton({ className = 'mg-open-btn', label = '🏬 Mağaza' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <MagazaOverlay onClose={() => setOpen(false)} />}
    </>
  );
}

// holder: 'factory' | 'silahci' | 'modifiye' — o yerin kullandığı malzemeler gösterilir
export function SharedMaterials({ holder = 'factory', title = '📦 Envanter' }) {
  const { inventory } = useInventory();
  const mats = holder === 'factory' ? MATERIAL_KEYS : HOLDER_MATERIALS[holder] || [];
  return (
    <div className="mg-inv">
      <div className="mg-inv-head">
        <p className="mg-inv-title">{title}</p>
        <MagazaButton />
      </div>
      <p className="mg-hint">Fabrikanın ve işletmelerinin ortak envanteri. Atölyedeki tamir ve geliştirmeler buradan kullanılır.</p>
      {mats.map((k) => {
        const n = Number(inventory[k] || 0);
        return (
          <div key={k} className="mg-inv-row">
            <span>
              {MAT_ICON[k]} {MATERIAL_LABELS[k]}
            </span>
            <b className={n === 0 ? 'mg-zero' : ''}>{fmt(n)} adet</b>
          </div>
        );
      })}
    </div>
  );
}

// Fabrika: "📦 Envanter" penceresi
export function FactoryInventorySheet({ onClose }) {
  return (
    <div className="mg-sheet-backdrop" onClick={onClose}>
      <div className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="mg-sheet-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
        <SharedMaterials holder="factory" title="📦 Fabrika Envanteri" />
      </div>
    </div>
  );
}
