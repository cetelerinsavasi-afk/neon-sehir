import { useEffect, useMemo, useRef, useState } from 'react';
import { useBorsaMarket, setLiveU } from '../../../hooks/useBorsaMarket';
import { useAuth } from '../../../contexts/AuthContext';
import { usePlayer } from '../../../hooks/usePlayer';
import { useBackClose } from '../../../lib/backStack';
import { borsaAction } from '../../../services/gameActions';
import SignInPrompt from '../../SignInPrompt/SignInPrompt';
import { VendorAvatar, VENDOR_LOOK } from './vendorArt';
import {
  BORSA_CO_BY_ID,
  capOf,
  buyRoom,
  fmtSharesShort,
  coState,
  holdState,
  pendingAll,
  splitCollect,
  change24h,
  avgPerShare,
  sortCos,
  sellAllValue,
  marketGainAll,
  priceNow,
  chartPrice,
  tradeButtons,
  buyQuote,
  sellQuote,
} from '../../../../functions/borsa.js';
import { setGoldPreview } from '../../../lib/goldPreview';
import './BorsaApp.css';

// =============================================================================
// v176 — NEON BORSA: seyyar satıcı + şirket hisseleri.
// v189 — sınırsız ve küsuratlı hisse. Veri: canlı fiyat RTDB (borsaFiyat), piyasa belgesi açılışta
//   bir kez + saat başı (hooks/useBorsaMarket), oyuncu belgesi (usePlayer zaten dinliyor → ek okuma
//   yok). Kurallar functions/borsa.js'te (sunucuyla aynı formüller).
//   Hızlı basışlar birleşir: ekran anında güncellenir (iyimser gösterim, aynı formüller), sunucuya
//   ~0,8 sn sonra tek istek gider; cevapla ekran düzeltilir. Saniyede en fazla 1 istek.
// =============================================================================
const BATCH_MS = 800;
const GAP_MS = 1100; // sunucu kuralı: saniyede 1 istek
const TOL = 0.01; // birleştirilmiş istekte fiyat bu kadardan fazla kötüleşirse işlem yapılmaz
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// v185: hisselerimin piyasa kaynaklı değer değişimi
function Gain({ gain, pct }) {
  if (!gain) return <span className="borsa-gain fl">%0</span>;
  const up = gain > 0;
  return (
    <span className={`borsa-gain ${up ? 'up' : 'dn'}`}>
      {`${up ? '▲ +' : '▼ −'}${fmt(Math.abs(gain))}`}
      {pct != null && <i>{` %${Math.abs(pct).toFixed(1)}`}</i>}
    </span>
  );
}
function Change({ pct }) {
  if (pct == null) return <span className="borsa-chg fl">—</span>;
  if (Math.abs(pct) < 0.05) return <span className="borsa-chg fl">%0</span>;
  return <span className={`borsa-chg ${pct > 0 ? 'up' : 'dn'}`}>{`${pct > 0 ? '▲' : '▼'} %${Math.abs(pct).toFixed(1)}`}</span>;
}

function Mini({ points }) {
  const pts = points.slice(-169); // v190: listede 7 günlük grafik (saatlik nokta)
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

// v193: kısa, net hata yazıları
const errText = (err) => {
  const m = String(err?.message || '');
  if (m.startsWith('price-changed')) return 'Fiyat değişti';
  if (m.startsWith('Çok hızlı')) return 'Çok hızlı';
  if (m.startsWith('Yetersiz altın')) return 'Yetersiz altın';
  if (m.startsWith('Alım sınırı')) return 'Alım sınırı';
  return m && m.length <= 40 ? m : 'İşlem yapılamadı';
};
const newPrice = (err) => {
  const m = String(err?.message || '').match(/^price-changed:(\d+)/);
  return m ? Number(m[1]) : null;
};

export default function BorsaApp({ selected, onSelect, embed = false }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { data: market, ready } = useBorsaMarket();
  const [tab, setTab] = useState('all');
  const [range, setRange] = useState('d');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const toastT = useRef(null);
  // iyimser işlem: { co, op, x, cost, baseGold, phase: 'queued'|'sent'|'ack', ackU, at }
  const [pend, setPend] = useState(null);
  const pendRef = useRef(null);
  pendRef.current = pend;
  const batchT = useRef(0);
  const lastSend = useRef(0);
  // tek mekânda "hepsini sat" onayı: { co, net, changed }
  const [coSell, setCoSell] = useState(null);
  useBackClose(sheet, () => setSheet(false));
  useBackClose(Boolean(coSell), () => setCoSell(null));
  useEffect(() => () => (clearTimeout(toastT.current), clearTimeout(batchT.current)), []);
  useEffect(() => setRange('d'), [selected]);

  const show = (text, bad = false) => {
    clearTimeout(toastT.current);
    setToast({ text, bad });
    toastT.current = setTimeout(() => setToast(null), 2200);
  };

  // ---- iyimser gösterim -------------------------------------------------------
  const realHoldU = (id) => holdState(player, id).u;
  // sunucu cevabı geldi ve oyuncu belgesi de ona ulaştıysa iyimser kaydı kaldır
  useEffect(() => {
    if (pend?.phase !== 'ack') return undefined;
    if (realHoldU(pend.co) === pend.ackU) {
      setPend(null);
      return undefined;
    }
    const t = setTimeout(() => setPend((p) => (p === pend ? null : p)), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pend, player]);
  const view = useMemo(() => {
    if (!pend) return market;
    const m = { ...(market || {}), co: { ...(market?.co || {}) } };
    const c = { ...(m.co[pend.co] || {}) };
    if (pend.phase !== 'ack') c.u = Math.max(0, (c.u || 0) + (pend.op === 'al' ? pend.x : -pend.x));
    m.co[pend.co] = c;
    return m;
  }, [market, pend]);
  const holdU = (id) => {
    const real = realHoldU(id);
    if (!pend || pend.co !== id) return real;
    if (pend.phase === 'ack') return pend.ackU;
    return Math.max(0, real + (pend.op === 'al' ? pend.x : -pend.x));
  };
  const goldNow = (() => {
    const g = player?.gold ?? 0;
    if (!pend || g !== pend.baseGold) return g;
    return g + (pend.op === 'al' ? -pend.cost : pend.cost);
  })();
  // v193: telefonun üstündeki altın da basar basmaz değişsin
  const goldDelta = goldNow - (player?.gold ?? 0);
  useEffect(() => setGoldPreview(goldDelta), [goldDelta]);
  useEffect(() => () => setGoldPreview(0), []);

  const cos = useMemo(() => sortCos(view), [view]);
  const pend$ = useMemo(() => pendingAll(player, market), [player, market]);
  const worth = useMemo(() => {
    const rows = sortCos(market)
      .map((c) => {
        const u = holdState(player, c.id).u;
        return u > 0 ? { id: c.id, name: c.name, u, value: sellAllValue(u, coState(market, c.id).u) } : null;
      })
      .filter(Boolean);
    return { rows, total: rows.reduce((a, r) => a + r.value, 0), units: rows.reduce((a, r) => a + r.u, 0), ...marketGainAll(player, market) };
  }, [player, market]);
  const [sellAsk, setSellAsk] = useState(false);
  useBackClose(sellAsk, () => setSellAsk(false));
  if (!user) return <SignInPrompt message="Neon Borsa'yı kullanmak için giriş yapmalısın." />;

  const taxFrac = 0; // v202: Hisse Senedi Gelir Vergisi kalktı (sunucu da kesmez)
  const taxPct = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const call = async (payload) => {
    const gap = GAP_MS - (Date.now() - lastSend.current);
    if (gap > 0) await wait(gap);
    lastSend.current = Date.now();
    return borsaAction(payload);
  };
  const run = async (key, payload, ok, onErr) => {
    if (busy || pendRef.current) return;
    setBusy(key);
    try {
      const r = await call(payload);
      show(ok(r));
    } catch (err) {
      if (!onErr?.(err)) show(errText(err), true);
    } finally {
      setBusy(null);
    }
  };
  const collect = () =>
    run('topla', { op: 'topla' }, (r) => {
      setSheet(false);
      return `+${fmt(r.pay)} altın hesabına geçti`;
    });

  // ---- hızlı basışları birleştir ------------------------------------------------
  const sendBatch = async () => {
    const p = pendRef.current;
    if (!p || p.phase !== 'queued') return;
    const sent = { ...p, phase: 'sent' };
    setPend(sent);
    const S = coState(market, p.co).u; // gerçek (canlı) S
    let expect;
    try {
      expect = p.op === 'al' ? Math.ceil(buyQuote(S, p.x).total * (1 + TOL)) : Math.floor(sellQuote(S, Math.min(p.x, S)).net * (1 - TOL));
    } catch {
      expect = undefined;
    }
    try {
      const r = await call({ op: p.op, co: p.co, x: p.x, ...(expect != null ? { expect } : {}) });
      setLiveU(p.co, r.coU);
      setPend({ ...sent, phase: 'ack', ackU: r.u });
      show(p.op === 'al' ? `${fmtSharesShort(r.x)} hisse alındı · −${fmt(r.price)}` : `${fmtSharesShort(r.x)} hisse satıldı · +${fmt(r.price)}`);
    } catch (err) {
      setPend(null);
      show(errText(err), true);
    }
  };
  const press = (co, op, x, amount) => {
    if (x <= 0 || busy) return;
    const p = pendRef.current;
    if (p && p.phase !== 'queued') return; // önceki istek yolda
    if (p && (p.co !== co || p.op !== op)) return; // farklı işlem: önce bu gitsin
    const next = p ? { ...p, x: p.x + x, cost: p.cost + amount } : { co, op, x, cost: amount, baseGold: player?.gold ?? 0, phase: 'queued', at: Date.now() };
    setPend(next);
    pendRef.current = next;
    clearTimeout(batchT.current);
    batchT.current = setTimeout(sendBatch, BATCH_MS);
  };

  // tek mekânda hepsini sat (iki adımlı onay; fiyat değiştiyse yeni tutarla tekrar sorar)
  const askCoSell = (co) => {
    const u = realHoldU(co);
    if (u <= 0 || pend) return;
    setCoSell({ co, net: sellAllValue(u, coState(market, co).u), changed: false });
  };
  const doCoSell = () =>
    run(
      'satCo',
      { op: 'sat', co: coSell.co, all: true, expect: coSell.net },
      (r) => {
        setLiveU(coSell.co, r.coU);
        setCoSell(null);
        return `${fmtSharesShort(r.x)} hisse satıldı · +${fmt(r.price)}`;
      },
      (err) => {
        const np = newPrice(err);
        if (np == null) return false;
        setCoSell((c) => (c ? { ...c, net: np, changed: true } : c));
        return true;
      }
    );

  const series = (co) => [...co.ch, chartPrice(co.u)];

  // ---------------- detay ----------------
  const sel = selected && BORSA_CO_BY_ID[selected] ? selected : null;
  let body;
  let actions = null;
  if (sel) {
    const meta = BORSA_CO_BY_ID[sel];
    const co = coState(view, sel);
    const myU = holdU(sel);
    const pts = series(co);
    const btn = tradeButtons(co.u, myU);
    const n = RANGES.find((r) => r.id === range)?.n || 25;
    const lastPs = co.ps.length ? co.ps[co.ps.length - 1] : null;
    const queued = pend && pend.co === sel && pend.phase === 'queued' ? pend : null;
    const otherBusy = Boolean(busy) || (pend && (pend.phase !== 'queued' || pend.co !== sel));
    const buyBtn = (k) => {
      const b = btn[k].buy;
      const blockedOp = queued && queued.op !== 'al';
      const full = buyRoom(myU, co.u) <= 0; // v193: kişi başı alım sınırı
      const poor = b.x > 0 && goldNow < b.total;
      const shut = Boolean(meta.closed); // v219: Cafe / Bar — alım kapandı, satış serbest
      return (
        <button key={`al-${k}`} className="borsa-btn gr" disabled={shut || !b.x || poor || otherBusy || blockedOp} onClick={() => press(sel, 'al', b.x, b.total)}>
          {shut ? 'Alım kapandı' : full ? 'Alım sınırı' : `${fmtSharesShort(b.x)} hisse al`}
          <small>{shut || full ? '—' : fmt(b.total)}</small>
        </button>
      );
    };
    const sellBtn = (k) => {
      const s = btn[k].sell;
      const blockedOp = queued && queued.op !== 'sat';
      return (
        <button key={`sat-${k}`} className="borsa-btn rd" disabled={!s.x || otherBusy || blockedOp} onClick={() => press(sel, 'sat', s.x, s.net)}>
          {s.x ? `${fmtSharesShort(s.x)} hisse sat` : 'Hissen yok'}
          <small>{s.x ? `+${fmt(s.net)}` : '—'}</small>
        </button>
      );
    };
    body = (
      <div className="borsa-detail">
        <div className="borsa-dh">
          <VendorAvatar id={sel} size={64} />
          <div>
            <h2>{meta.name}</h2>
            <span className="borsa-sub">{meta.kind === 'sirket' ? 'Şirket' : meta.kind === 'mekan' ? 'Mekân' : 'Seyyar satıcı'}</span>
          </div>
        </div>
        <div className="borsa-bigp">
          <div className="borsa-ab2">
            <div className="al">
              <small>Anlık fiyat (1 hisse)</small>
              <b>{fmt(priceNow(co.u))}</b>
            </div>
            <div className="sat">
              <small>Satılmış hisse</small>
              <b>{fmtSharesShort(co.u)}</b>
            </div>
          </div>
          <Change pct={change24h(co.ch, chartPrice(co.u))} />
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
          <div>
            <small>Hisse başına günlük · 10 gün ort.</small>
            <b className="borsa-gold">{co.ps.length ? fmt(Math.floor(avgPerShare(co))) : '—'}</b>
          </div>
          <div>
            <small>Hisse başına · dün</small>
            <b>{lastPs != null ? fmt(lastPs) : '—'}</b>
          </div>
          <div>
            <small>Senin hissen</small>
            <b className="borsa-mine">{`${fmtSharesShort(myU)} / ${fmtSharesShort(capOf(co.u))}`}</b>
          </div>
          <div>
            <small>Hepsini satarsan</small>
            <b>{myU ? `+${fmt(sellAllValue(myU, co.u))}` : '—'}</b>
          </div>
        </div>
      </div>
    );
    actions = (
      <div className="borsa-act grid">
        {buyBtn('small')}
        {sellBtn('small')}
        {buyBtn('big')}
        {sellBtn('big')}
        <button className="borsa-btn rd-gh wide" disabled={!realHoldU(sel) || Boolean(busy) || Boolean(pend)} onClick={() => askCoSell(sel)}>
          {pend && pend.co === sel && pend.phase !== 'ack' ? '…' : 'Hepsini sat'}
        </button>
      </div>
    );
  } else {
    const mine = cos.filter((c) => holdState(player, c.id).u > 0 || pend$.by[c.id]);
    const list = tab === 'mine' ? mine : cos;
    body = (
      <>
        <div className="borsa-inc">
          <small>Hisse gelirlerin</small>
          <div className="borsa-inc-big">
            <span className="borsa-coin" />
            {fmt(pend$.total)}
          </div>
          <div className="borsa-row">
            <button className="borsa-btn cy" disabled={!pend$.total || Boolean(busy)} onClick={collect}>
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
        {tab === 'mine' && worth.units > 0 && (
          <div className="borsa-worth">
            <div>
              <small>{`${fmtSharesShort(worth.units)} hisse · şu anki değeri`}</small>
              <b>
                <span className="borsa-coin" />
                {fmt(worth.total)}
              </b>
              <Gain gain={worth.gain} pct={worth.pct} />
            </div>
            <button className="borsa-btn rd-gh" disabled={Boolean(busy)} onClick={() => setSellAsk(true)}>
              Hepsini sat
            </button>
          </div>
        )}
        <div className="borsa-sec">
          <span>Mekân</span>
          <span>{tab === 'mine' ? 'Senin hissen' : 'Fiyat'}</span>
        </div>
        {!ready && <p className="borsa-empty">Yükleniyor…</p>}
        {ready && list.length === 0 && <p className="borsa-empty">Henüz hissen yok.</p>}
        {ready &&
          list.map((c) => {
            const co = coState(view, c.id);
            const my = holdState(player, c.id).u;
            const avg = avgPerShare(co);
            return (
              <div key={c.id} className="borsa-it-wrap">
                <button className="borsa-it" onClick={() => onSelect(c.id, c.name)}>
                  <VendorAvatar id={c.id} />
                  <span className="borsa-it-mid">
                    <span className="borsa-it-name">
                      {c.name}
                      {my > 0 && <span className="borsa-own">{fmtSharesShort(my)}</span>}
                    </span>
                    {/* v189: satılmış toplam hisse + hisse başına son 10 günlük ortalama gelir */}
                    <span className="borsa-sub borsa-sub2">
                      <span>{`${fmtSharesShort(co.u)} hisse`}</span>
                      <span>{`ort. gelir: ${co.ps.length ? fmt(Math.floor(avg)) : '—'}`}</span>
                    </span>
                  </span>
                  <span className="borsa-px">
                    <span className="borsa-ab">
                      <i>Fiyat</i>
                      <b>{fmt(priceNow(co.u))}</b>
                    </span>
                    <Change pct={change24h(co.ch, chartPrice(co.u))} />
                    <Mini points={series(co)} />
                  </span>
                </button>
              </div>
            );
          })}
      </>
    );
  }

  const split = splitCollect(pend$.total, taxFrac, player?.debtToState);
  const sellAllNow = () =>
    run('satHepsi', { op: 'satHepsi', expect: worth.total }, (r) => {
      setSellAsk(false);
      return `${fmtSharesShort(r.units)} hisse satıldı · +${fmt(r.total)}`;
    });
  const coSellMeta = coSell ? BORSA_CO_BY_ID[coSell.co] : null;
  return (
    <div className={`borsa${embed ? ' embed' : ''}`}>
      <div className={`borsa-scroll${sel ? ' has-act' : ''}`}>{body}</div>
      {actions}
      {coSell && coSellMeta && (
        <div className="borsa-shade" onClick={(e) => e.target === e.currentTarget && !busy && setCoSell(null)}>
          <div className="borsa-sheet" role="dialog" aria-label="Hepsini sat">
            <div className="borsa-grab" />
            <h3>{`${coSellMeta.name} hisselerinin hepsi satılsın mı?`}</h3>
            {coSell.changed && <p className="borsa-note bad">Fiyat değişti</p>}
            <div className="borsa-ln">
              <span className="borsa-ln-n">
                <VendorAvatar id={coSell.co} size={30} />
                {`${fmtSharesShort(realHoldU(coSell.co))} hisse`}
              </span>
            </div>
            <div className="borsa-ln tot">
              <span>Hesabına geçecek</span>
              <span className="borsa-gold">{`+${fmt(coSell.net)}`}</span>
            </div>
            <div className="borsa-row">
              <button className="borsa-btn gh" disabled={Boolean(busy)} onClick={() => setCoSell(null)}>
                Vazgeç
              </button>
              <button className="borsa-btn rd" disabled={Boolean(busy)} onClick={doCoSell}>
                {busy === 'satCo' ? '…' : `Sat · +${fmt(coSell.net)}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {sellAsk && worth.units > 0 && (
        <div className="borsa-shade" onClick={(e) => e.target === e.currentTarget && !busy && setSellAsk(false)}>
          <div className="borsa-sheet" role="dialog" aria-label="Hepsini sat">
            <div className="borsa-grab" />
            <h3>Tüm hisseler satılsın mı?</h3>
            {worth.rows.map((w) => (
              <div key={w.id} className="borsa-ln">
                <span className="borsa-ln-n">
                  <VendorAvatar id={w.id} size={30} />
                  {`${w.name} · ${fmtSharesShort(w.u)}`}
                </span>
                <span>{fmt(w.value)}</span>
              </div>
            ))}
            <div className="borsa-ln tot">
              <span>Hesabına geçecek</span>
              <span className="borsa-gold">{fmt(worth.total)}</span>
            </div>
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
            {pend$.total <= 0 && <p className="borsa-empty">Henüz birikmiş gelir yok.</p>}
            {cos
              .filter((c) => pend$.by[c.id])
              .map((c) => (
                <div key={c.id} className="borsa-ln">
                  <span className="borsa-ln-n">
                    <VendorAvatar id={c.id} size={30} />
                    {c.name}
                  </span>
                  <span className="borsa-gold">{fmt(pend$.by[c.id])}</span>
                </div>
              ))}
            {pend$.total > 0 && (
              <>
                <div className="borsa-ln t">
                  <span>Toplam</span>
                  <span>{fmt(split.gross)}</span>
                </div>
                {split.tax > 0 && (
                  <div className="borsa-ln t">
                    <span>{`Hisse gelir vergisi %${taxPct}`}</span>
                    <span>{`−${fmt(split.tax)}`}</span>
                  </div>
                )}
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
