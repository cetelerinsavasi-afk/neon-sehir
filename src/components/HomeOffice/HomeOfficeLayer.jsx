import { useEffect, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useOfficeSpend, useNetOccupancy } from '../../hooks/useVenueData';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { NET_SEEN_MS } from '../../../functions/venue.js';
import { OFFICE_DAILY_LIMIT, OFFICE_DONATE_AMOUNTS, activeOfficeKeys, ownedOfficeKeys, officeMinuteOf, MINUTE_KEYS } from '../../../functions/officeData.js';
import StudioScreen from './StudioScreen';
import { InterviewStudio, PaintStudio } from './MinuteStudios';
import './HomeOffice.css';

// =============================================================================
// v100 — Ofis katmanı (her evde / işletmede; oyunun mekânlarında değil)
//   • Bağış kutusu: sahip açtıysa yaklaşınca "🤲 Bağış yap" → 100/250/500/1000
//   • Mikser konsolu: sahip her zaman ücretsiz; sahip ücretli yaptıysa herkes
//     "🎛️ Müzik yap · X/dk" ile kullanır. Konsolda tek kişi çalışır; çalışanın
//     başında herkes "🎵 Müzik yapıyor" görür.
//   • Diğer ücretli ürünler (raf, dolap…): HouseScreen eşya butonları (officeBuy).
// apiRef: { label(a), act(a), dim(a), open(kind) }
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// v135 — dakika ücretli ofis mobilyaları: mikser (müzik) · haber masası (röportaj,
// oturunca) · tuval (resim). Hepsinde sahip ücretsiz; başkaları ücretliyse.
const DEV = {
  mixer: { act: 'studio', icon: '🎛️', verb: 'Müzik yap', busy: 'müzik yapıyor', badge: '🎵 Müzik yapıyor', none: 'Burada mikser konsolu yok.' },
  newsdesk: { act: 'interview', icon: '🎙️', verb: 'Röportaj yap', busy: 'röportaj yapıyor', badge: '🎙️ Röportaj yapıyor', none: 'Burada haber stüdyosu yok.', seated: true },
  easel: { act: 'paint', icon: '🎨', verb: 'Resim çiz', busy: 'resim çiziyor', badge: '🎨 Resim çiziyor', none: 'Burada tuval yok.' },
};
const ACT_KEY = Object.fromEntries(Object.entries(DEV).map(([k, d]) => [d.act, k]));

export default function HomeOfficeLayer({ apiRef, houseId, houseDoc, isOwner, engineRef, engineKey, online, flash }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [donate, setDonate] = useState(false);
  const [open, setOpen] = useState(null); // { key, deviceId }
  const [busy, setBusy] = useState(false);
  const active = activeOfficeKeys(houseDoc);
  const owned = ownedOfficeKeys(houseDoc);
  const donateOn = active.includes('bagiskutusu');
  // bu odada kullanılabilir dakika mobilyaları (sahipse hepsi; değilse ücretli olanlar)
  const usable = MINUTE_KEYS.filter((k) => owned.includes(k) && (isOwner || active.includes(k)));
  const anyMinuteHere = MINUTE_KEYS.some((k) => owned.includes(k));
  const occ = useNetOccupancy(houseId, anyMinuteHere);
  const priceOf = (k) => (isOwner ? 0 : officeMinuteOf(houseDoc, k));
  const actsKey = `${donateOn ? 'd' : ''}|${usable.join(',')}`;
  useEffect(() => {
    const map = {};
    if (donateOn) map.bagiskutusu = [{ act: 'donate', label: '🤲 Bağış yap' }];
    usable.forEach((k) => {
      map[k] = [{ act: DEV[k].act, label: `${DEV[k].icon} ${DEV[k].verb}`, ...(DEV[k].seated ? { seated: true } : {}) }];
    });
    engineRef.current?.setBizActs?.(Object.keys(map).length ? map : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actsKey, engineRef, engineKey]);
  useEffect(() => () => engineRef.current?.setBizActs?.(null), [engineRef]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!anyMinuteHere) return undefined;
    const iv = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(iv);
  }, [anyMinuteHere]);

  // dakika mobilyasında çalışanlar (taze nabız)
  const working = (() => {
    void tick;
    const t = Date.now();
    return occ.filter((s) => DEV[s.deviceKey] && s.deviceId && t - Number(s.lastSeenMs || 0) < NET_SEEN_MS && Number(s.creditUntilMs || 0) + 5000 > t);
  })();
  const occupantOf = (deviceId) => working.find((s) => s.deviceId === deviceId && s.uid !== user?.uid) || null;
  const nameOf = (uid) => online?.find((o) => o.uid === uid)?.displayName || 'Biri';

  // başlarında "🎵 Müzik yapıyor" / "🎙️ Röportaj yapıyor" / "🎨 Resim çiziyor"
  const workKey = working.map((s) => `${s.uid}:${s.deviceKey}`).sort().join(',');
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng?.setActivityBadge || !anyMinuteHere) return undefined;
    const rows = workKey ? workKey.split(',').map((x) => x.split(':')) : [];
    const apply = () => rows.forEach(([uid, k]) => eng.setActivityBadge(uid, DEV[k]?.badge || null));
    apply();
    const iv = setInterval(apply, 2000); // sonradan yüklenen figürler için
    return () => {
      clearInterval(iv);
      rows.forEach(([uid]) => eng.setActivityBadge(uid, null));
    };
  }, [workKey, anyMinuteHere, engineRef, engineKey]);

  const startDevice = async (key, deviceId) => {
    const d = DEV[key];
    const dev = deviceId || (houseDoc?.items || []).find((it) => it.k === key && it.p === 1)?.i;
    if (!dev) return flash?.(`${d.icon} ${d.none}`);
    const o = occupantOf(dev);
    if (o) return flash?.(`${d.icon} Dolu — şu an ${nameOf(o.uid)} ${d.busy}.`);
    const price = priceOf(key);
    setBusy(true);
    try {
      const r = await shopAction({ op: 'netStart', houseId, itemId: dev, expect: price });
      if (r.charged) flash?.(`${d.icon} Süren başladı: −${fmt(r.charged)} altın / dakika`);
      setOpen({ key, deviceId: dev });
    } catch (err) {
      const m = String(err?.message || '');
      if (m === 'device-full') flash?.(`${d.icon} Dolu, biraz sonra tekrar dene.`);
      else if (m === 'mixer-private') flash?.(`${d.icon} Bunu sadece sahibi kullanabilir.`);
      else if (m.startsWith('price-changed')) flash?.(`💲 Dakika ücreti değişti: ${fmt(m.split(':')[1])} altın. Tekrar dene.`);
      else flash?.(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(
    apiRef,
    () => ({
      label(a) {
        const key = ACT_KEY[a.act];
        if (key) {
          const d = DEV[key];
          const o = occupantOf(a.itemId);
          if (o) return `${d.icon} Dolu — ${nameOf(o.uid)} ${d.busy}`;
          return isOwner ? `${d.icon} ${d.verb} (ücretsiz)` : `${d.icon} ${d.verb} · ${fmt(priceOf(key))} / dakika`;
        }
        if (a.act === 'donate') return isOwner ? '🤲 Bağış kutusu (senin)' : '🤲 Bağış yap';
        return a.label;
      },
      dim(a) {
        return Boolean(ACT_KEY[a.act]) && Boolean(occupantOf(a.itemId));
      },
      act(a) {
        if (a.act === 'donate') setDonate(true);
        else if (ACT_KEY[a.act]) startDevice(ACT_KEY[a.act], a.itemId);
      },
      // üst buton: en yakın ilgili eşyaya yürü (yaklaşınca eylem butonu çıkar)
      open(kind) {
        const k = kind === 'donate' ? 'bagiskutusu' : ACT_KEY[kind] || 'mixer';
        if (!engineRef.current?.approachNearest?.(k)) {
          if (kind === 'donate') setDonate(true);
          else startDevice(k, null);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOwner, workKey, online, houseDoc]
  );

  const close = (msg) => {
    setOpen(null);
    if (msg) flash?.(msg);
  };
  const common = open ? { houseId, houseDoc, price: priceOf(open.key), isOwner, flash, onClose: close } : null;
  return (
    <>
      {donate && <DonateSheet houseId={houseId} houseDoc={houseDoc} isOwner={isOwner} gold={Number(player?.gold || 0)} onClose={() => setDonate(false)} flash={flash} />}
      {open?.key === 'mixer' && <StudioScreen {...common} />}
      {open?.key === 'newsdesk' && <InterviewStudio {...common} />}
      {open?.key === 'easel' && <PaintStudio {...common} />}
      {busy && <div className="ho-busy" aria-hidden="true" />}
    </>
  );
}

function DonateSheet({ houseId, houseDoc, isOwner, gold, onClose, flash }) {
  const spent = useOfficeSpend(houseId, !isOwner);
  const left = Math.max(0, OFFICE_DAILY_LIMIT - spent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const give = async (a) => {
    setErr('');
    if (a > left) return setErr(left > 0 ? `Bugün burada en fazla ${fmt(left)} altın daha harcayabilirsin.` : `Bugünkü sınıra ulaştın (${fmt(OFFICE_DAILY_LIMIT)}).`);
    if (a > gold) return setErr('Altının yetmiyor.');
    setBusy(true);
    try {
      const r = await shopAction({ op: 'officeDonate', houseId, amount: a });
      setDone(r.amount);
      flash?.(`🤲 ${fmt(r.amount)} altın bağışladın.`);
    } catch (e) {
      setErr(bizErrText(e));
    } finally {
      setBusy(false);
    }
  };
  const halt = (e) => e.stopPropagation();
  return createPortal(
    <div className="ho-modal-bg" onClick={() => !busy && onClose()} onPointerDown={halt}>
      <div className="ho-modal" onClick={halt}>
        <div className="ho-head">
          <h3>🤲 Bağış Kutusu</h3>
          <button className="ho-x sm" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        <p className="ho-dim">
          {houseDoc?.office?.emoji ? `${houseDoc.office.emoji} ` : ''}
          {houseDoc?.name || 'Ofis'} · {houseDoc?.ownerName || ''}
        </p>
        {isOwner ? (
          <p className="ho-dim">Bu bağış kutusu senin.</p>
        ) : (
          <>
            <div className="ho-stat">
              <span>Cebindeki altın</span>
              <b>
                <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(gold)}
              </b>
            </div>
            <div className="ho-stat">
              <span>Bugün burada</span>
              <b>
                {fmt(spent)} / {fmt(OFFICE_DAILY_LIMIT)}
              </b>
            </div>
            <div className="ho-presets">
              {OFFICE_DONATE_AMOUNTS.map((v) => (
                <button key={v} className="ho-preset" disabled={busy || v > left} onClick={() => give(v)}>
                  {fmt(v)}
                </button>
              ))}
            </div>
            {done && !err && <p className="ho-ok">✓ {fmt(done)} altın bağışladın.</p>}
            {err && <p className="ho-err">{err}</p>}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
