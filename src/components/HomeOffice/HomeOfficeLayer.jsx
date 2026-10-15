import { useEffect, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBizSpend, useNetOccupancy } from '../../hooks/useVenueData';
import { shopAction } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { netPriceOf, NET_SEEN_MS } from '../../../functions/venue.js';
import { MESCIT_DAILY_LIMIT, MESCIT_PRESETS, MESCIT_MIN, HO_ITEM_ACTS } from '../../../functions/homeOfficeData.js';
import StudioScreen from './StudioScreen';
import './HomeOffice.css';

// =============================================================================
// v93 — Home ofislerin ev ekranındaki katmanı (HouseScreen içinde, bizType ho iken)
//   • Mescit: bağış kutusuna yaklaşınca "🤲 Bağış yap" → bağış penceresi
//   • Müzik stüdyosu: mikser konsoluna yaklaşınca "🎛️ Müzik yap · X/dk" → süre
//     başlar, stüdyo (proje + Beat Atölyesi) açılır. Konsolda tek kişi çalışır;
//     çalışanın başında herkes "🎵 Müzik yapıyor" görür.
//   • Sinema: menü sistemi (MenuPanel) — HouseScreen'de cafe/bar gibi.
// apiRef: { acts, label(a), act(a), open(kind), busy }
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

export default function HomeOfficeLayer({ apiRef, houseId, houseDoc, bizType, isOwner, engineRef, engineKey, online, flash }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [donate, setDonate] = useState(false);
  const [studio, setStudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const studioOn = bizType === 'studyo';
  const occ = useNetOccupancy(houseId, studioOn);
  const price = netPriceOf(houseDoc);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!studioOn) return undefined;
    const iv = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(iv);
  }, [studioOn]);

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
    if (!eng?.setActivityBadge || !studioOn) return undefined;
    const uids = workKey ? workKey.split(',') : [];
    const apply = () => uids.forEach((uid) => eng.setActivityBadge(uid, '🎵 Müzik yapıyor'));
    apply();
    const iv = setInterval(apply, 2000); // sonradan yüklenen figürler için
    return () => {
      clearInterval(iv);
      uids.forEach((uid) => eng.setActivityBadge(uid, null));
    };
  }, [workKey, studioOn, engineRef, engineKey]);

  const startStudio = async (deviceId) => {
    const mixer = deviceId || (houseDoc?.items || []).find((it) => it.k === 'mixer' && it.p === 1)?.i;
    if (!mixer) return flash?.('🎛️ Bu stüdyoda mikser konsolu yok.');
    const o = occupantOf(mixer);
    if (o) return flash?.(`🎛️ Konsol dolu — şu an ${nameOf(o.uid)} müzik yapıyor.`);
    setBusy(true);
    try {
      const r = await shopAction({ op: 'netStart', houseId, itemId: mixer, expect: isOwner ? 0 : price });
      if (r.charged) flash?.(`🎛️ Stüdyo süren başladı: −${fmt(r.charged)} altın / dakika`);
      setStudio(true);
    } catch (err) {
      const m = String(err?.message || '');
      if (m === 'device-full') flash?.('🎛️ Konsol dolu, biraz sonra tekrar dene.');
      else if (m.startsWith('price-changed')) flash?.(`💲 Dakika ücreti değişti: ${fmt(m.split(':')[1])} altın. Tekrar dene.`);
      else flash?.(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(
    apiRef,
    () => ({
      acts: HO_ITEM_ACTS[bizType] || null,
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
    [bizType, isOwner, price, workKey, online, houseDoc]
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
  const spent = useBizSpend(houseId, !isOwner);
  const left = Math.max(0, MESCIT_DAILY_LIMIT - spent);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const n = Math.floor(Number(amount) || 0);
  const give = async (v) => {
    const a = Math.floor(Number(v) || 0);
    setErr('');
    if (a < MESCIT_MIN) return setErr(`En az ${fmt(MESCIT_MIN)} altın bağışlayabilirsin.`);
    if (a > left) return setErr(left > 0 ? `Bugün bu mescide en fazla ${fmt(left)} altın daha bağışlayabilirsin.` : 'Bugünkü bağış sınırına ulaştın (10.000).');
    if (a > gold) return setErr('Altının yetmiyor.');
    setBusy(true);
    try {
      const r = await shopAction({ op: 'mescitDonate', houseId, amount: a });
      setDone(r.amount);
      setAmount('');
      flash?.(`🤲 ${fmt(r.amount)} altın bağışladın. Allah kabul etsin.`);
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
        <p className="ho-dim">{houseDoc?.name || 'Mescit'} · {houseDoc?.ownerName || ''}</p>
        {isOwner ? (
          <p className="ho-dim">Burası senin mescidin.</p>
        ) : (
          <>
            <div className="ho-stat">
              <span>Cebindeki altın</span>
              <b>
                <span className="gold-coin-icon" style={{ width: 13, height: 13 }} /> {fmt(gold)}
              </b>
            </div>
            <div className="ho-stat">
              <span>Bugün bu mescide</span>
              <b>
                {fmt(spent)} / {fmt(MESCIT_DAILY_LIMIT)}
              </b>
            </div>
            <div className="ho-presets">
              {MESCIT_PRESETS.map((v) => (
                <button key={v} className="ho-preset" disabled={busy || v > left} onClick={() => give(v)}>
                  {fmt(v)}
                </button>
              ))}
            </div>
            <div className="ho-row">
              <input className="ho-input" inputMode="numeric" placeholder="Başka miktar" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} />
              <button className="ho-btn gold" disabled={busy || !n} onClick={() => give(n)}>
                {busy ? '…' : 'Bağışla'}
              </button>
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
