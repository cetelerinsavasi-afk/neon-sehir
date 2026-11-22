import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { usePlayer } from '../../../hooks/usePlayer';
import { useBelediyeRates } from '../../../hooks/useBelediyeRates';
import { useBackClose } from '../../../lib/backStack';
import { borsaAction } from '../../../services/gameActions';
import SignInPrompt from '../../SignInPrompt/SignInPrompt';
import { VendorAvatar, VENDOR_LOOK } from './vendorArt';
import {
  BORSA_CO_BY_ID,
  BORSA_MAX_PER_PLAYER,
  BORSA_SHARES,
  BORSA_TAX_RATE_ID,
  buyCost,
  sellGet,
  sellBase,
  coState,
  holdState,
  pendingAll,
  splitCollect,
  change24h,
  avgIncome,
  sortCos,
  sellAllValue,
} from '../../../../functions/borsa.js';
import { rateFrac } from '../../../../functions/belediyeRates.js';
import './BorsaApp.css';

// =============================================================================
// v176 — NEON BORSA (Cappstore uygulaması): seyyar satıcı hisseleri.
//   Veri: borsa/piyasa (tek belge, SADECE uygulama açıkken dinlenir) + oyuncu belgesi
//   (usePlayer zaten dinliyor → ek okuma yok). Kurallar functions/borsa.js'te (sunucuyla aynı).
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

let shared = { data: null, ready: false };
function useMarket() {
  const [snap, setSnap] = useState(shared);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'borsa', 'piyasa'),
        (s) => {
          shared = { data: s.exists() ? s.data() : null, ready: true };
          setSnap(shared);
        },
        () => setSnap({ data: shared.data, ready: true })
      ),
    []
  );
  return snap;
}

function Change({ pct }) {
  if (pct == null) return <span className="borsa-chg fl">—</span>;
  if (Math.abs(pct) < 0.05) return <span className="borsa-chg fl">%0</span>;
  return <span className={`borsa-chg ${pct > 0 ? 'up' : 'dn'}`}>{`${pct > 0 ? '▲' : '▼'} %${Math.abs(pct).toFixed(1)}`}</span>;
}

function Mini({ points }) {
  const pts = points.slice(-25);
  if (pts.length < 2) return <span className="borsa-mini" />;
  const mx = Math.max(...pts);
  const mn = Math.min(...pts);
  const r = mx - mn || 1;
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 60 + 2).toFixed(1)},${(22 - ((v - mn) / r) * 20).toFixed(1)}`).join(' L');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg className="borsa-mini" viewBox="0 0 64 24" aria-hidden="true">
      <path d={`M${d}`} fill="none" stroke={up ? '#2fd47a' : '#ff5a6e'} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const RANGES = [
  { id: 'd', label: '24 saat', n: 25 },
  { id: 'w', label: '3 gün', n: 73 },
  { id: 'a', label: '7 gün', n: 169 },
];
function BigChart({ points, color }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 180;
  let body = null;
  if (points.length >= 2 && w > 0) {
    const pad = 10;
    const mx = Math.max(...points);
    const mn = Math.min(...points);
    const r = mx - mn || 1;
    const xy = points.map((v, i) => [pad + (i / (points.length - 1)) * (w - pad * 2), H - 22 - ((v - mn) / r) * (H - 40)]);
    const d = `M${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
    const last = xy[xy.length - 1];
    body = (
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Saatlik fiyat grafiği">
        <defs>
          <linearGradient id="borsa-gf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${w - pad},${H - 22} L${pad},${H - 22} Z`} fill="url(#borsa-gf)" />
        <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="4.5" fill={color} stroke="#080d18" strokeWidth="2" />
        <text x={pad} y={H - 5} className="borsa-axis">{`${points.length - 1} saat önce`}</text>
        <text x={w - pad} y={H - 5} className="borsa-axis" textAnchor="end">
          şimdi
        </text>
        <text x={w - pad} y="12" className="borsa-axis" textAnchor="end">{`en yüksek ${fmt(mx)}`}</text>
      </svg>
    );
  }
  return (
    <div className="borsa-chart" ref={ref} style={{ height: H }}>
      {body || <p className="borsa-empty">Grafik saat başında çizilir.</p>}
    </div>
  );
}

export default function BorsaApp({ selected, onSelect }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const rates = useBelediyeRates();
  const { data: market, ready } = useMarket();
  const [tab, setTab] = useState('all');
  const [range, setRange] = useState('d');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const toastT = useRef(null);
  useBackClose(sheet, () => setSheet(false));
  useEffect(() => () => clearTimeout(toastT.current), []);
  useEffect(() => setRange('d'), [selected]);

  const cos = useMemo(() => sortCos(market), [market]);
  const pend = useMemo(() => pendingAll(player, market), [player, market]);
  // v181: elindeki hisselerin şu an satılırsa toplam değeri (komisyon dahil, her satışta fiyat bir basamak düşer)
  const worth = useMemo(() => {
    const rows = sortCos(market)
      .map((c) => {
        const n = holdState(player, c.id).n;
        return n > 0 ? { id: c.id, name: c.name, n, value: sellAllValue(n, coState(market, c.id).n) } : null;
      })
      .filter(Boolean);
    return { rows, total: rows.reduce((a, r) => a + r.value, 0), shares: rows.reduce((a, r) => a + r.n, 0) };
  }, [player, market]);
  const [sellAsk, setSellAsk] = useState(false);
  useBackClose(sellAsk, () => setSellAsk(false));
  if (!user) return <SignInPrompt message="Neon Borsa'yı kullanmak için giriş yapmalısın." />;

  const gold = player?.gold ?? 0;
  const taxFrac = rateFrac(rates, BORSA_TAX_RATE_ID);
  const taxPct = Math.round(taxFrac * 100);
  const show = (text, bad = false) => {
    clearTimeout(toastT.current);
    setToast({ text, bad });
    toastT.current = setTimeout(() => setToast(null), 2200);
  };
  const run = async (key, payload, ok) => {
    if (busy) return;
    setBusy(key);
    try {
      const r = await borsaAction(payload);
      show(ok(r));
    } catch (err) {
      show(String(err?.message || '').startsWith('price-changed') ? 'Fiyat değişti, tekrar bak' : err?.message || 'İşlem yapılamadı.', true);
    } finally {
      setBusy(null);
    }
  };
  const collect = () =>
    run('topla', { op: 'topla' }, (r) => {
      setSheet(false);
      return `+${fmt(r.pay)} altın hesabına geçti`;
    });

  const series = (co) => [...co.ch, sellBase(co.n)];

  // ---------------- detay ----------------
  const sel = selected && BORSA_CO_BY_ID[selected] ? selected : null;
  let body;
  let actions = null;
  if (sel) {
    const meta = BORSA_CO_BY_ID[sel];
    const co = coState(market, sel);
    const h = holdState(player, sel);
    const pts = series(co);
    const cost = buyCost(co.n);
    const get = sellGet(co.n);
    const why = cost == null ? 'Hisseler tükendi' : h.n >= BORSA_MAX_PER_PLAYER ? `En fazla ${BORSA_MAX_PER_PLAYER} hisse` : gold < cost ? 'Altın yetmiyor' : `${fmt(cost)} altın`;
    const canBuy = cost != null && h.n < BORSA_MAX_PER_PLAYER && gold >= cost;
    const n = RANGES.find((r) => r.id === range)?.n || 25;
    body = (
      <div className="borsa-detail">
        <div className="borsa-dh">
          <VendorAvatar id={sel} size={64} />
          <div>
            <h2>{meta.name}</h2>
            <span className="borsa-sub">{meta.kind === 'sirket' ? 'Şirket' : 'Seyyar satıcı'}</span>
          </div>
        </div>
        {/* v178: alış ve satış fiyatı ayrı (komisyon dahil, şu an 1 hisse) */}
        <div className="borsa-bigp">
          <div className="borsa-ab2">
            <div className="al">
              <small>Alış</small>
              <b>{cost == null ? 'Kapalı' : fmt(cost)}</b>
            </div>
            <div className="sat">
              <small>Satış</small>
              <b>{co.n ? fmt(get) : '—'}</b>
            </div>
          </div>
          <Change pct={change24h(co.ch, sellBase(co.n))} />
          <span className="borsa-sub"> son 24 saat</span>
        </div>
        <BigChart points={pts.slice(-n)} color={VENDOR_LOOK[sel]?.c || '#19e8ff'} />
        <div className="borsa-rng" role="group" aria-label="Grafik aralığı">
          {RANGES.map((r) => (
            <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="borsa-stats">
          {/* v183: hissedarlara her gün dağıtılan toplam paranın son 10 günlük ortalaması */}
          <div>
            <small>Hissedarlara günlük · 10 gün ort.</small>
            <b className="borsa-gold">{co.inc.length ? fmt(Math.floor(avgIncome(co.inc))) : '—'}</b>
          </div>
          <div>
            <small>Hissedarlara · dün</small>
            <b>{co.inc.length ? fmt(co.inc[co.inc.length - 1]) : '—'}</b>
          </div>
          <div>
            <small>Senin hissen</small>
            <b>{`${h.n} / ${BORSA_MAX_PER_PLAYER}`}</b>
          </div>
          <div>
            <small>Hepsini satarsan</small>
            <b>{h.n ? fmt(sellAllValue(h.n, co.n)) : '—'}</b>
          </div>
        </div>
        <div className="borsa-dbar">
          <div className="borsa-dbar-l">
            <span>{`%${co.n} dolu`}</span>
            <span>{`%${BORSA_SHARES - co.n} boş`}</span>
          </div>
          <div className="borsa-fill big">
            <i style={{ width: `${co.n}%` }} />
          </div>
        </div>
      </div>
    );
    actions = (
      <div className="borsa-act">
        <button className="borsa-btn gr" disabled={!canBuy || Boolean(busy)} onClick={() => run('al', { op: 'al', co: sel }, (r) => `1 hisse alındı · −${fmt(r.price)}`)}>
          {busy === 'al' ? '…' : 'Al'}
          <small>{why}</small>
        </button>
        <button className="borsa-btn rd" disabled={!h.n || Boolean(busy)} onClick={() => run('sat', { op: 'sat', co: sel }, (r) => `1 hisse satıldı · +${fmt(r.price)}`)}>
          {busy === 'sat' ? '…' : 'Sat'}
          <small>{h.n ? `${fmt(get)} altın` : 'Hissen yok'}</small>
        </button>
      </div>
    );
  } else {
    const mine = cos.filter((c) => holdState(player, c.id).n > 0 || pend.by[c.id]);
    const list = tab === 'mine' ? mine : cos;
    body = (
      <>
        <div className="borsa-inc">
          <small>Hisse gelirlerin</small>
          <div className="borsa-inc-big">
            <span className="borsa-coin" />
            {fmt(pend.total)}
          </div>
          <div className="borsa-row">
            <button className="borsa-btn cy" disabled={!pend.total || Boolean(busy)} onClick={collect}>
              {busy === 'topla' ? '…' : 'Topla'}
            </button>
            <button className="borsa-btn gh" onClick={() => setSheet(true)}>
              Detaylar
            </button>
          </div>
        </div>
        <div className="borsa-tabs" role="group">
          <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>
            Piyasa
          </button>
          <button aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>
            Hisselerim
          </button>
        </div>
        {/* v181: Hisselerim — elindeki hisselerin şu anki toplam değeri + (onaylı) hepsini sat */}
        {tab === 'mine' && worth.shares > 0 && (
          <div className="borsa-worth">
            <div>
              <small>{`${worth.shares} hisse · şu anki değeri`}</small>
              <b>
                <span className="borsa-coin" />
                {fmt(worth.total)}
              </b>
            </div>
            <button className="borsa-btn rd-gh" disabled={Boolean(busy)} onClick={() => setSellAsk(true)}>
              Hepsini sat
            </button>
          </div>
        )}
        <div className="borsa-sec">
          <span>Mekân</span>
          <span>Alış · Satış</span>
        </div>
        {!ready && <p className="borsa-empty">Yükleniyor…</p>}
        {ready && list.length === 0 && <p className="borsa-empty">Henüz hissen yok.</p>}
        {ready &&
          list.map((c) => {
            const co = coState(market, c.id);
            const h = holdState(player, c.id).n;
            return (
              <button key={c.id} className="borsa-it" onClick={() => onSelect(c.id, c.name)}>
                <VendorAvatar id={c.id} />
                <span className="borsa-it-mid">
                  <span className="borsa-it-name">
                    {c.name}
                    {h > 0 && <span className="borsa-own">{h}</span>}
                  </span>
                  <span className="borsa-sub">{`%${co.n} dolu`}</span>
                  <span className="borsa-fill">
                    <i style={{ width: `${co.n}%` }} />
                  </span>
                </span>
                <span className="borsa-px">
                  <span className="borsa-ab">
                    <i>Al</i>
                    <b>{buyCost(co.n) == null ? '—' : fmt(buyCost(co.n))}</b>
                  </span>
                  <span className="borsa-ab s">
                    <i>Sat</i>
                    <b>{co.n ? fmt(sellGet(co.n)) : '—'}</b>
                  </span>
                  <Change pct={change24h(co.ch, sellBase(co.n))} />
                  <Mini points={series(co)} />
                </span>
              </button>
            );
          })}
      </>
    );
  }

  const split = splitCollect(pend.total, taxFrac, player?.debtToState);
  const sellAllNow = () =>
    run('satHepsi', { op: 'satHepsi', expect: worth.total }, (r) => {
      setSellAsk(false);
      return `${r.shares} hisse satıldı · +${fmt(r.total)}`;
    });
  return (
    <div className="borsa">
      <div className={`borsa-scroll${sel ? ' has-act' : ''}`}>{body}</div>
      {actions}
      {sellAsk && worth.shares > 0 && (
        <div className="borsa-shade" onClick={(e) => e.target === e.currentTarget && !busy && setSellAsk(false)}>
          <div className="borsa-sheet" role="dialog" aria-label="Hepsini sat">
            <div className="borsa-grab" />
            <h3>Tüm hisseler satılsın mı?</h3>
            {worth.rows.map((w) => (
              <div key={w.id} className="borsa-ln">
                <span className="borsa-ln-n">
                  <VendorAvatar id={w.id} size={30} />
                  {`${w.name} · ${w.n}`}
                </span>
                <span>{fmt(w.value)}</span>
              </div>
            ))}
            <div className="borsa-ln tot">
              <span>Hesabına geçecek</span>
              <span className="borsa-gold">{fmt(worth.total)}</span>
            </div>
            {pend.total > 0 && <p className="borsa-note">Biriken gelirin silinmez, sonra toplayabilirsin.</p>}
            <div className="borsa-row">
              <button className="borsa-btn gh" disabled={Boolean(busy)} onClick={() => setSellAsk(false)}>
                Vazgeç
              </button>
              <button className="borsa-btn rd" disabled={Boolean(busy)} onClick={sellAllNow}>
                {busy === 'satHepsi' ? '…' : 'Hepsini sat'}
              </button>
            </div>
          </div>
        </div>
      )}
      {sheet && (
        <div className="borsa-shade" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="borsa-sheet" role="dialog" aria-label="Gelir detayları">
            <div className="borsa-grab" />
            <h3>Gelir detayları</h3>
            {pend.total <= 0 && <p className="borsa-empty">Henüz birikmiş gelir yok.</p>}
            {cos
              .filter((c) => pend.by[c.id])
              .map((c) => (
                <div key={c.id} className="borsa-ln">
                  <span className="borsa-ln-n">
                    <VendorAvatar id={c.id} size={30} />
                    {c.name}
                  </span>
                  <span className="borsa-gold">{fmt(pend.by[c.id])}</span>
                </div>
              ))}
            {pend.total > 0 && (
              <>
                <div className="borsa-ln t">
                  <span>Toplam</span>
                  <span>{fmt(split.gross)}</span>
                </div>
                <div className="borsa-ln t">
                  <span>{`Hisse gelir vergisi %${taxPct}`}</span>
                  <span>{`−${fmt(split.tax)}`}</span>
                </div>
                {split.toDebt > 0 && (
                  <div className="borsa-ln t">
                    <span>Borca</span>
                    <span>{`−${fmt(split.toDebt)}`}</span>
                  </div>
                )}
                <div className="borsa-ln tot">
                  <span>Hesabına geçecek</span>
                  <span className="borsa-gold">{fmt(split.pay)}</span>
                </div>
                <button className="borsa-btn cy wide" disabled={Boolean(busy)} onClick={collect}>
                  {busy === 'topla' ? '…' : 'Topla'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className={`borsa-toast${toast.bad ? ' bad' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
