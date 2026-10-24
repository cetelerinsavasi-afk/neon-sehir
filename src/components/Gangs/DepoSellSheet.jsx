import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useGang, useGangAction } from './GangContext';
import { AmountInput, Btn, Sheet } from './ui';
import { fmt } from './gangConstants';
import { GAME_DEPO_ID, GAME_DEPO_PRICES, depoPricesOf } from '../../../functions/depo.js';

// v124 — Çete deposundaki yasaklı maddeyi bir DEPOYA anında sat (gang action
// 'sellToDepo', functions/gang/actions/trade.js). Depolar alış fiyatına göre
// (yüksekten düşüğe) listelenir; oyuncu deposunda kasasının yettiği kadar
// (cap) satılabilir. Oyunun deposu sınırsız alır (1.500). Liste sadece bu
// pencere açılınca bir kez okunur (canlı dinleyici yok — Firebase maliyeti).
export default function DepoSellSheet({ free, onClose }) {
  const { isTest } = useGang();
  const { run, busy } = useGangAction();
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(GAME_DEPO_ID);
  const [qty, setQty] = useState(Math.min(free, 1));

  useEffect(() => {
    let alive = true;
    const game = { id: GAME_DEPO_ID, name: 'Neon Liman Deposu', buy: GAME_DEPO_PRICES.buy, cap: Infinity, game: true };
    if (isTest) {
      setRows([game]);
      return undefined;
    }
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'houses'), where('bizType', '==', 'depo'), limit(60)));
        const houses = snap.docs.filter((d) => !d.data().bizGame);
        const views = await Promise.all(houses.map((d) => getDoc(doc(db, 'depotView', d.id)).catch(() => null)));
        const list = houses.map((d, i) => {
          const h = d.data();
          const v = views[i]?.exists() ? views[i].data() : null;
          const buy = v?.buy || depoPricesOf(h).buy;
          return { id: d.id, name: h.name || 'Depo', owner: h.ownerName || 'Oyuncu', buy, cap: Number(v?.cap || 0) };
        });
        list.sort((a, b) => b.buy - a.buy || b.cap - a.cap);
        if (alive) setRows([...list, game]);
      } catch {
        if (alive) setRows([game]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isTest]);

  const cur = rows?.find((r) => r.id === sel) || null;
  const max = cur ? Math.max(0, Math.min(free, cur.cap)) : 0;
  useEffect(() => {
    setQty((q) => Math.max(max > 0 ? 1 : 0, Math.min(q, max)));
  }, [max]);

  return (
    <Sheet title="Depoya sat" icon="📦" onClose={onClose}>
      <p className="dim gx-mini">💊 Çete deposunda satılabilir {fmt(free)} yasaklı madde var. Para çete kasasına girer.</p>
      {!rows && <p className="dim">Depolar yükleniyor…</p>}
      {rows?.map((r) => (
        <button key={r.id} className={`gx-depot-row gx-depo-pick${sel === r.id ? ' on' : ''}`} onClick={() => setSel(r.id)} disabled={!r.game && r.cap <= 0}>
          <span className="gx-depot-name">
            {r.game ? '🏢' : '📦'} {r.name}
            {!r.game && <span className="dim"> · {r.owner}</span>}
          </span>
          <b>{fmt(r.buy)}</b>
          <span className="dim gx-mini">{r.game ? 'sınırsız' : r.cap > 0 ? `en çok ${fmt(r.cap)} adet` : 'kasası boş'}</span>
        </button>
      ))}
      {cur && max > 0 && (
        <>
          <span className="dim gx-mini">Adet</span>
          <AmountInput value={qty} onChange={setQty} max={max} min={1} quick={[5, 10, 50]} />
          <Btn
            block
            busy={busy === 'sellToDepo'}
            disabled={!qty}
            onClick={async () => {
              const r = await run('sellToDepo', { depotId: cur.id, qty, expect: cur.buy }, { success: (res) => `📦 ${fmt(res?.qty)} yasaklı madde satıldı: kasaya +${fmt(res?.total)}`, withRequestId: true });
              if (r) onClose();
            }}
          >
            📦 {fmt(qty)} adet sat · {fmt(qty * cur.buy)} altın
          </Btn>
        </>
      )}
    </Sheet>
  );
}
