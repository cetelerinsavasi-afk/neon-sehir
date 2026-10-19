import { useEffect, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useOfficeSpend, useNetOccupancy } from '../../hooks/useVenueData';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { NET_SEEN_MS } from '../../../functions/venue.js';
import { OFFICE_DAILY_LIMIT, OFFICE_DONATE_AMOUNTS, activeOfficeKeys, ownedOfficeKeys, officeMinuteOf } from '../../../functions/officeData.js';
import StudioScreen from './StudioScreen';
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

export default function HomeOfficeLayer({ apiRef, houseId, houseDoc, isOwner, engineRef, engineKey, online, flash }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [donate, setDonate] = useState(false);
  const [studio, setStudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = activeOfficeKeys(houseDoc);
  const owned = ownedOfficeKeys(houseDoc);
  const donateOn = active.includes('bagiskutusu');
  const mixerPaid = active.includes('mixer');
  const mixerHere = owned.includes('mixer');
  const studioOn = mixerHere && (isOwner || mixerPaid);
  const occ = useNetOccupancy(houseId, owned.includes('mixer'));
  const price = isOwner ? 0 : officeMinuteOf(houseDoc);
  // eşyalara eylem: bağış kutusu (açıksa), mikser (sahipse ya da ücretliyse)
  const actsKey = `${donateOn ? 'd' : ''}${studioOn ? 's' : ''}`;
  useEffect(() => {
    const map = {};
    if (actsKey.includes('d')) map.bagiskutusu = [{ act: 'donate', label: '🤲 Bağış yap' }];
    if (actsKey.includes('s')) map.mixer = [{ act: 'studio', label: '🎛️ Müzik yap' }];
    engineRef.current?.setBizActs?.(Object.keys(map).length ? map : null);
  }, [actsKey, engineRef, engineKey]);
  useEffect(() => () => engineRef.current?.setBizActs?.(null), [engineRef]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!mixerHere) return undefined;
    const iv = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(iv);
  }, [mixerHere]);

  // mikserde çalışanlar (taze nabız)
  const working = (() => {
    void tick;
    const t = Date.now();
    return occ.filter((s) => s.deviceKey === 'mixer' && s.deviceId && t - Number(s.lastSeenMs || 0) < NET_SEEN_MS && Number(s.creditUntilMs || 0) + 5000 > t);
  })();
  const occupantOf = (deviceId) => working.find((s) => s.deviceId === deviceId && s.uid !== user?.uid) || null;
  const nameOf = (uid) => online?.find((o) => o.uid === uid)?.displayName || 'Biri';

  // başlarında "🎵 Müzik yapıyor"
  const workKey = working.map((s) => s.uid).sort().join(',');
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng?.setActivityBadge || !mixerHere) return undefined;
    const uids = workKey ? workKey.split(',') : [];
    const apply = () => uids.forEach((uid) => eng.setActivityBadge(uid, '🎵 Müzik yapıyor'));
    apply();
    const iv = setInterval(apply, 2000); // sonradan yüklenen figürler için
    return () => {
      clearInterval(iv);
      uids.forEach((uid) => eng.setActivityBadge(uid, null));
    };
  }, [workKey, mixerHere, engineRef, engineKey]);

  const startStudio = async (deviceId) => {
    const mixer = deviceId || (houseDoc?.items || []).find((it) => it.k === 'mixer' && it.p === 1)?.i;
    if (!mixer) return flash?.('🎛️ Burada mikser konsolu yok.');
    const o = occupantOf(mixer);
    if (o) return flash?.(`🎛️ Konsol dolu — şu an ${nameOf(o.uid)} müzik yapıyor.`);
    setBusy(true);
    try {
      const r = await shopAction({ op: 'netStart', houseId, itemId: mixer, expect: price });
      if (r.charged) flash?.(`🎛️ Stüdyo süren başladı: −${fmt(r.charged)} altın / dakika`);
      setStudio(true);
    } catch (err) {
      const m = String(err?.message || '');
      if (m === 'device-full') flash?.('🎛️ Konsol dolu, biraz sonra tekrar dene.');
      else if (m === 'mixer-private') flash?.('🎛️ Bu mikseri sadece sahibi kullanabilir.');
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
        if (a.act === 'studio') {
          const o = occupantOf(a.itemId);
          if (o) return `🎛️ Dolu — ${nameOf(o.uid)} müzik yapıyor`;
          return isOwner ? '🎛️ Müzik yap (ücretsiz)' : `🎛️ Müzik yap · ${fmt(price)} / dakika`;
        }
        if (a.act === 'donate') return isOwner ? '🤲 Bağış kutusu (senin)' : '🤲 Bağış yap';
        return a.label;
      },
      dim(a) {
        return a.act === 'studio' && Boolean(occupantOf(a.itemId));
      },
      act(a) {
        if (a.act === 'donate') setDonate(true);
        else if (a.act === 'studio') startStudio(a.itemId);
      },
      // üst buton: en yakın ilgili eşyaya yürü (yaklaşınca eylem butonu çıkar)
      open(kind) {
        const k = kind === 'donate' ? 'bagiskutusu' : 'mixer';
        if (!engineRef.current?.approachNearest?.(k)) {
          if (kind === 'donate') setDonate(true);
          else startStudio(null);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOwner, price, workKey, online, houseDoc]
  );

  return (
    <>
      {donate && <DonateSheet houseId={houseId} houseDoc={houseDoc} isOwner={isOwner} gold={Number(player?.gold || 0)} onClose={() => setDonate(false)} flash={flash} />}
      {studio && (
        <StudioScreen
          houseId={houseId}
          price={price}
          isOwner={isOwner}
          flash={flash}
          onClose={(msg) => {
            setStudio(false);
            if (msg) flash?.(msg);
          }}
        />
      )}
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
