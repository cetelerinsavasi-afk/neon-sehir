// =============================================================================
// v146 — ÇETE KARARGAHI parçaları (HouseScreen içinde)
//   HqLayer      — sağ üstte "🏴 Çete" → çete panelleri (sohbet · savaş · ticaret · çetem)
//   HqYetkiPanel — ＋: çete kasası (altın + zümrüt) ve karargah yetkilileri (Baba verir)
//   HqInvites    — ⚙️ › Davet: başka çeteleri karargaha davet et / daveti kaldır
// Kurallar sunucuda (functions/hq.js); burası sadece görünüm.
// =============================================================================
import { Suspense, lazy, useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { houseAction } from '../../services/gameActions';
import { retryImport } from '../../lib/lazyRetry';
import '../HouseScreen/HouseBusiness.css';

const GangPanel = lazy(retryImport(() => import('../Gangs/GangPanel'))); // v160.3: 5 sekmeli Çeteler paneli
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const RANK = { baba: 'Mafya Babası', sagkol: 'Sağ Kol', kidemli: 'Kıdemli', tetikci: 'Tetikçi', comez: 'Çömez' };

// v160.3: herkes "🏴 Çete" görür — kendi çetende Savaş sekmesi, başka çetenin karargahında o
// çetenin herkese açık bilgileri (Çete sekmesi; Sohbet / Savaş / Ticaret kilitli)
export function HqLayer({ role, hidden, onSwitchHouse, gangId = null, gangName = '' }) {
  const [open, setOpen] = useState(false);
  const member = role === 'baba' || role === 'yetkili' || role === 'uye';
  const enterHq = onSwitchHouse
    ? (id) => {
        setOpen(false);
        onSwitchHouse(id);
      }
    : (id) => window.dispatchEvent(new CustomEvent('neon-open-house', { detail: { houseId: id } }));
  // Çeteler › Karargaha gir: şehirdeki o çetenin karargahına (CityScreen dinler)
  const enterGangHq = (g) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('neon-enter-gang-hq', { detail: { gangId: g?.id } }));
  };
  const start = member || !gangId ? { org: 'gang', tab: 'savas' } : { profile: { id: gangId, name: gangName }, tab: 'profil' };
  return (
    <>
      {!hidden && !open && (
        <div className="hb-topbtns">
          <button className="hb-topbtn" onClick={() => setOpen(true)}>
            🏴 Çete
          </button>
          {role === 'davetli' && <span className="hb-topbtn hq-guest">📨 Davetlisin</span>}
        </div>
      )}
      {open && (
        <Suspense fallback={null}>
          <GangPanel start={start} onClose={() => setOpen(false)} onEnterHq={enterGangHq} hqNav={{ enterHq }} />
        </Suspense>
      )}
    </>
  );
}

export function HqYetkiPanel({ houseId, role, onClose, flash }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () =>
    houseAction({ op: 'hqInfo', houseId })
      .then((r) => setInfo(r.data || null))
      .catch((e) => flash?.(e?.message || 'Yüklenemedi.'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseId]);
  const toggle = async (m) => {
    setBusy(m.uid);
    try {
      await houseAction({ op: 'hqYetki', houseId, uid: m.uid, on: !m.yetki });
      flash?.(m.yetki ? `${m.name} artık yetkili değil.` : `🏴 ${m.name} karargah yetkilisi oldu.`);
      await load();
    } catch (e) {
      flash?.(e?.message || 'Olmadı.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="hs-modal-bg" onClick={onClose}>
      <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hs-modal-head xleft">
          <button className="hs-x" onClick={onClose}>
            ✕
          </button>
          <b>🏴 Karargah yetkilileri</b>
        </div>
        {!info ? (
          <p className="hs-dim">Yükleniyor…</p>
        ) : (
          <>
            <div className="hq-kasa">
              <span>Çete kasası</span>
              <b>
                <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(info.kasa)}
              </b>
              <b>💎 {fmt(info.gem)}</b>
            </div>
            <p className="hs-dim hs-perm-info">Mafya Babası ve yetkililer çete kasasındaki altın ve zümrütle mobilya alıp yerleştirir, fiyatları ve davetleri düzenler. Çeteden çıkanın yetkisi kendiliğinden düşer.</p>
            {(info.members || []).map((m) => (
              <div key={m.uid} className="hs-person">
                <span className="hs-person-main static">
                  <span className="hs-person-name">
                    {m.name}
                    <em> · {RANK[m.rank] || m.rank}</em>
                    {(m.yetki || m.rank === 'baba') && <em> · 🛠️ yetkili</em>}
                  </span>
                </span>
                {role === 'baba' && m.rank !== 'baba' && (
                  <button className={m.yetki ? 'ghost' : 'hs-perm-give'} disabled={busy === m.uid} onClick={() => toggle(m)}>
                    {busy === m.uid ? '…' : m.yetki ? 'Yetkiyi kaldır' : 'Yetki ver'}
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ⚙️ › Davet — aktif çeteler (kendi çeten hariç). Daveti kaldırmak içeridekileri atmaz.
export function HqInvites({ houseId, houseDoc, flash }) {
  const worldId = houseDoc?.hq?.worldId || null;
  const own = houseDoc?.hq?.gangId || null;
  const invited = new Set(houseDoc?.hqInvites || []);
  const [gangs, setGangs] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (!worldId) return undefined;
    return onSnapshot(
      query(collection(db, `gangWorlds/${worldId}/gangs`), where('status', '==', 'active'), limit(100)),
      (s) => setGangs(s.docs.map((d) => ({ id: d.id, name: d.data().name || 'Çete', logo: d.data().logo || null, n: d.data().memberCount || 0 })).filter((g) => g.id !== own)),
      () => setGangs([])
    );
  }, [worldId, own]);
  const toggle = async (g) => {
    const on = !invited.has(g.id);
    setBusy(g.id);
    try {
      await houseAction({ op: 'hqInvite', houseId, gangId: g.id, on });
      flash?.(on ? `📨 ${g.name} karargaha davet edildi.` : `${g.name} daveti kaldırıldı (içeridekiler atılmaz).`);
    } catch (e) {
      flash?.(e?.message || 'Olmadı.');
    } finally {
      setBusy(null);
    }
  };
  if (!gangs) return <p className="of-hint">Yükleniyor…</p>;
  const sorted = [...gangs].sort((a, b) => Number(invited.has(b.id)) - Number(invited.has(a.id)) || a.name.localeCompare(b.name, 'tr'));
  return (
    <div className="of-list">
      <p className="of-hint">Davet ettiğin çetenin üyeleri Savaş › Davetler'den karargahına girebilir.</p>
      {sorted.length === 0 && <p className="of-hint">Başka çete yok.</p>}
      {sorted.map((g) => {
        const on = invited.has(g.id);
        return (
          <div key={g.id} className="hs-person">
            <span className="hs-person-main static">
              <span className="hq-logo" style={{ background: g.logo?.bg || '#1f2a40', color: g.logo?.color || '#fff' }}>
                {g.logo?.emoji || '🏴'}
              </span>
              <span className="hs-person-name">
                {g.name}
                <em> · {g.n} üye</em>
                {on && <em> · 📨 davetli</em>}
              </span>
            </span>
            <button className={on ? 'ghost' : 'hs-perm-give'} disabled={busy === g.id} onClick={() => toggle(g)}>
              {busy === g.id ? '…' : on ? 'Daveti kaldır' : 'Davet et'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
