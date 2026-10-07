import { useEffect, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import { PriceSlider } from '../Shop/ShopOwnerPanels';
import { GYM_PRICE, GYM_EQUIPMENT, gymPriceOf } from '../../../functions/gym.js';
import { EQUIP } from './gymMeta';
import '../Shop/Shop.css';

// Spor salonu: günlük üyelik ücreti (500–2.000)
export function GymPriceSection({ houseId, houseDoc }) {
  const cur = gymPriceOf(houseDoc);
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(cur), [cur]);
  return (
    <div className="sh-section">
      <div className="sh-mat-price">
        <div className="sh-mat-title">
          🏋️ <b>1 gün</b>
          <span className="sh-unit">★ 2.000</span>
        </div>
        <PriceSlider icon="🎟️" min={GYM_PRICE.min} max={GYM_PRICE.max} npc={2000} value={v} onChange={(x) => setV(Math.round(x / 50) * 50)} />
      </div>
      <button
        className={`hs-btn gold wide${v !== cur ? ' cue-pulse' : ''}`}
        disabled={busy || v === cur}
        onClick={async () => {
          setBusy(true);
          try {
            await shopAction({ op: 'gymPrice', houseId, price: v });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '…' : '💾'}
      </button>
    </div>
  );
}

// Salondaki aletler (görevler bunlardan seçilir)
export function GymInvSection({ houseDoc }) {
  return (
    <div className="sh-section">
      {GYM_EQUIPMENT.map((k) => {
        const n = (houseDoc?.items || []).filter((it) => it.k === k && it.p === 1).length;
        return (
          <div key={k} className="hb-inv-row">
            <span>{EQUIP[k].icon}</span>
            <span>{EQUIP[k].name}</span>
            <b>×{n}</b>
          </div>
        );
      })}
    </div>
  );
}
