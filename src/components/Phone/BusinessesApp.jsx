import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { BIZ_TYPES, bizDayKey } from '../../../functions/businessCatalogData.js';
import { BizSettings } from '../HouseScreen/HouseBusiness';
import '../../styles/bizui.css';
import './Cappstore.css';

// =============================================================================
// v161 — İŞLETME uygulaması (Cappstore): oyuncunun bütün işletmeleri tek listede.
//   Liste: tek sorgu (sahibi olduğum evlerden açık işletmesi olanlar) + her işletmenin
//   bugünkü günlük raporu (businessDaily, tek okuma). Dokununca işletmenin ayarlar
//   menüsü (BizSettings: Fiyatlar · Envanter · Rapor) — mekândakiyle aynı bileşen.
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const netOf = (d) => (Number(d?.revenue) || 0) - (Number(d?.tax) || 0) - (Number(d?.salary) || 0);
const custOf = (d) => (d ? (Number.isFinite(d.customers) ? d.customers : Object.keys(d.cust || {}).length) : 0);

function useMyBusinesses(uid) {
  const [state, setState] = useState({ list: [], loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!uid) {
      setState({ list: [], loading: false });
      return undefined;
    }
    let alive = true;
    (async () => {
      const hs = await getDocs(query(collection(db, 'houses'), where('ownerUid', '==', uid), limit(100)));
      const biz = hs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((h) => h.biz?.type && BIZ_TYPES[h.biz.type]);
      const daily = await Promise.all(
        biz.map((h) =>
          getDoc(doc(db, 'businessDaily', `${h.id}_${bizDayKey(h.biz.type, Date.now())}`))
            .then((s) => (s.exists() ? s.data() : null))
            .catch(() => null)
        )
      );
      if (!alive) return;
      const list = biz.map((h, i) => ({ ...h, today: daily[i] })).sort((a, b) => netOf(b.today) - netOf(a.today) || String(a.name || '').localeCompare(String(b.name || ''), 'tr'));
      setState({ list, loading: false });
    })().catch(() => alive && setState({ list: [], loading: false }));
    return () => {
      alive = false;
    };
  }, [uid, tick]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

function BizDetail({ houseId, initial }) {
  const [houseDoc, setHouseDoc] = useState(initial);
  useEffect(() => onSnapshot(doc(db, 'houses', houseId), (s) => s.exists() && setHouseDoc({ id: s.id, ...s.data() }), () => {}), [houseId]);
  if (!houseDoc?.biz?.type) return <p className="biz-app-empty">Bu işletme şu an kapalı.</p>;
  return (
    <div className="biz-app-detail">
      <BizSettings houseId={houseId} houseDoc={houseDoc} />
    </div>
  );
}

export default function BusinessesApp({ selected, onSelect }) {
  const { user } = useAuth();
  const { list, loading } = useMyBusinesses(user?.uid || null);
  const sel = selected ? list.find((h) => h.id === selected) : null;
  if (selected && sel) return <BizDetail houseId={sel.id} initial={sel} />;
  const total = list.reduce((t, h) => t + netOf(h.today), 0);
  return (
    <div className="biz-app">
      <div className="biz-app-sum">
        <small>Bugün toplam net kazanç</small>
        <strong>
          <span className="gold-coin-icon" style={{ width: 20, height: 20 }} /> {fmt(total)}
        </strong>
        <span>{loading ? 'Yükleniyor…' : `${list.length} işletme`}</span>
      </div>
      {!loading && list.length === 0 && <p className="biz-app-empty">Henüz bir işletmen yok. Bir evde işletme açınca burada listelenir.</p>}
      <div className="biz-app-list">
        {list.map((h) => {
          const t = BIZ_TYPES[h.biz.type];
          const net = netOf(h.today);
          return (
            <button key={h.id} className="biz-app-row" onClick={() => onSelect(h.id, h.name || t.label)}>
              <span className="biz-app-ico" aria-hidden="true">
                {t.icon}
              </span>
              <span className="biz-app-txt">
                <b>{h.name || t.label}</b>
                <small>
                  {t.label} · {fmt(custOf(h.today))} müşteri
                  {Number.isFinite(h.bizRank) ? ` · dün ${h.bizRank}.` : ''}
                </small>
              </span>
              <span className="biz-app-earn">
                <b className={net < 0 ? 'neg' : ''}>
                  {net >= 0 ? '+' : ''}
                  {fmt(net)}
                </b>
                <small>bugün</small>
              </span>
              <span className="biz-app-chev" aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
