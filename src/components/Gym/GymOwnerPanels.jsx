import { useEffect, useState } from 'react';
import { shopAction } from '../../services/gameActions';
import PriceField from '../Shop/PriceField';
import { BIZ_TAX_RATE } from '../../../functions/tax.js';
import { bizErrText } from '../../lib/bizErrors';
import { GYM_PRICE, GYM_EQUIPMENT, GAME_GYM_PRICE, gymPriceOf } from '../../../functions/gym.js';
import { EQUIP } from './gymMeta';
import '../../styles/bizui.css';
import '../Shop/Shop.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// Spor salonu: günlük üyelik ücreti (500–2.000)
export function GymPriceSection({ houseId, houseDoc }) {
  const cur = gymPriceOf(houseDoc);
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => setV(cur), [cur]);
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🎟️ Günlük ücret</p>
      <PriceField
        label="Günlük ücret"
        min={GYM_PRICE.min}
        max={GYM_PRICE.max}
        step={50}
        value={v}
        refPrice={GAME_GYM_PRICE}
        refLabel="Oyunun salonu"
        taxRate={BIZ_TAX_RATE}
        saved={cur}
        onChange={setV}
      />
      <button
        className="bz-btn gold wide"
        disabled={busy || v === cur}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await shopAction({ op: 'gymPrice', houseId, price: v });
            setMsg({ ok: true, text: `✓ Üyelik ücreti ${fmt(v)} altın olarak kaydedildi.` });
          } catch (e) {
            setMsg({ ok: false, text: bizErrText(e) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Kaydediliyor…' : v !== cur ? '💾 Ücreti kaydet' : '✓ Kayıtlı'}
      </button>
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
    </div>
  );
}

// Salondaki aletler (görevler bunlardan seçilir)
export function GymInvSection({ houseDoc }) {
  const counts = GYM_EQUIPMENT.map((k) => [k, (houseDoc?.items || []).filter((it) => it.k === k && it.p === 1).length]);
  const kinds = counts.filter(([, n]) => n > 0).length;
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🏋️ Salondaki aletler</p>
      {counts.map(([k, n]) => (
        <div key={k} className="bz-row">
          <span>
            {EQUIP[k].icon} {EQUIP[k].name}
          </span>
          <b className={n ? 'bz-good' : 'bz-bad'}>{n ? `${n} tane` : 'yok'}</b>
        </div>
      ))}
      {kinds < 3 && <p className="bz-warn">En az 3 çeşit alet gerekli.</p>}
    </div>
  );
}
