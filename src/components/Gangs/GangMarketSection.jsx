// 2. El Pazarı içinde "Çete depoları" bölümü: çetelerin depodan ilana koyduğu
// araba / silah / yasaklı madde. Satın alma çete sistemi üzerinden yapılır
// (para çete kasasına, ürün alıcıya YENİ olarak). Mevcut 2. el ilan
// koleksiyonuna ve fonksiyonlarına dokunmaz. Çeteler canlıya açık değilse
// hiçbir şey göstermez.
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { callGang, friendlyError, newRequestId } from './gangApi';
import { itemInfo } from './itemInfo';

const KIND = { vehicle: 'vehicle', weapon: 'weapon', material: 'material' };

export default function GangMarketSection({ view }) {
  const [cfg, setCfg] = useState(null);
  const [list, setList] = useState([]);
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => onSnapshot(doc(db, 'gangSystem/config'), (s) => setCfg(s.data() || null), () => setCfg(null)), []);
  const worldId = cfg?.liveOpen ? cfg.liveWorldId : null;
  useEffect(() => {
    if (!worldId) return undefined;
    const q = query(collection(db, `gangWorlds/${worldId}/market`), where('status', '==', 'open'), limit(60));
    return onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setList([])
    );
  }, [worldId]);

  if (!worldId || !KIND[view]) return null;
  const items = list.filter((l) => l.itemType === KIND[view]);
  if (items.length === 0) return null;

  const buy = async (l) => {
    const n = Math.max(1, Math.min(l.quantity, Number(qty[l.id] || 1)));
    setBusy(l.id);
    setMsg(null);
    try {
      await callGang({ world: 'live' }, 'buyMarketListing', { listingId: l.id, qty: n, requestId: newRequestId() });
      setMsg({ ok: true, text: `✅ ${n} × ${l.label} satın alındı (yeni ürün).` });
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="market-section-title">🏴 Çete depoları</p>
      {items.map((l) => {
        const it = itemInfo(l.itemKey);
        return (
          <div key={l.id} className="market-listing-card">
            {it.image ? <img className="market-card-photo" src={it.image} alt={l.label} /> : <span className="market-card-emoji">{it.emoji}</span>}
            <div className="market-listing-info">
              <span className="market-listing-label">
                {l.label} <span className="market-seller">· YENİ</span>
              </span>
              <span className="market-listing-price">
                {Number(l.unitPrice).toLocaleString('tr-TR')} altın / adet · {l.quantity} adet
                <span className="market-seller"> · {l.gangName}</span>
              </span>
              {l.itemType !== 'material' && <span className="market-listing-life-label">Ömür: 20 / 20 gün · Tamir hakkı: 10/10</span>}
              {l.quantity > 1 && (
                <input
                  className="market-material-filter"
                  inputMode="numeric"
                  value={qty[l.id] || 1}
                  onChange={(e) => setQty({ ...qty, [l.id]: Number(String(e.target.value).replace(/\D/g, '')) || 1 })}
                  aria-label="Adet"
                />
              )}
            </div>
            <button className="market-btn small" disabled={busy === l.id} onClick={() => buy(l)}>
              {busy === l.id ? '…' : 'Satın Al'}
            </button>
          </div>
        );
      })}
      {msg && <p className={msg.ok ? 'market-hint' : 'market-error'}>{msg.text}</p>}
    </>
  );
}
