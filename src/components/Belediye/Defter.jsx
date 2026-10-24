// v127 — AYRINTILI DEFTER (Belediye › Başkanlık, sadece kadro)
// Eski admin "Ayrıntılı defter"in yerine: devlet defterinin geçmişi, bakanlıklara
// göre gruplu kalemler ve 30 günlük grafik. Veriler DEĞİŞMEDİ — eski kalemler yeni
// sistemin adlarıyla birleştirilerek gösterilir (ör. yayın + şarkı → Sosyal medya).
// Okuma: düğmeyle açılınca bir kez (sunucu: belediyeAction › defter) — özet +
// bugün (≤10 dk gecikmeli) + son 30 kapanmış gün ≈ 32 okuma.
import { useMemo, useState } from 'react';
import { belediyeAction } from '../../services/gameActions';
import { friendlyError } from '../Gangs/gangApi';
import { Btn, Chips } from '../Gangs/ui';
import { MINISTRIES } from '../../../functions/belediyeRates.js';
import { Signed, dayLabel, nf } from './belediyeUi';

const addDays = (k, n) => new Date(Date.parse(`${k}T12:00:00+03:00`) + n * 86_400_000 + 3 * 3600_000).toISOString().slice(0, 10);
const todayKey = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

// Defter kalemi → yeni sistemdeki kalem (bakanlık + ad). Aynı adı alanlar birleşir.
const BIZ = { silahci: 'Silahçı', modifiye: 'Modifiye', spor: 'Spor Salonu', cafe: 'Kafe', bar: 'Bar', internet: 'İnternet Kafe', sinema: 'Ofis', studyo: 'Ofis', mescit: 'Ofis', galeri: 'Galeri', gazino: 'Kumarhane', ofis: 'Ofis' };
function groupOf(kind, cat) {
  if (kind === 'in') {
    if (cat === 'vergi_fabrika') return ['sanayi', 'Fabrika vergisi'];
    if (cat === 'vergi_makine') return ['sanayi', 'Makine alım vergisi'];
    if (cat === 'vergi_maasIsci') return ['sanayi', 'Fabrika işçisi maaş vergisi'];
    if (cat === 'vergi_maas') return ['yonetim', 'Maaş vergileri (güncelleme öncesi birleşik kayıt)'];
    if (cat === 'vergi_yayin' || cat === 'vergi_sanatci') return ['kultur', 'Sosyal medya vergisi'];
    if (cat === 'vergi_maasFutbolcu') return ['kultur', 'Futbolcu maaş vergisi'];
    if (cat === 'vergi_maasMenajer') return ['kultur', 'Menajer maaş vergisi'];
    if (cat === 'vergi_ofis') return ['ticaret', 'İşletme vergisi · Ofis'];
    if (cat === 'vergi_gazino' || cat === 'vergi_gazinoCekim') return ['ticaret', 'İşletme vergisi · Kumarhane'];
    if (cat.startsWith('vergi_isl_')) return ['ticaret', `İşletme vergisi · ${BIZ[cat.slice(10)] || cat.slice(10)}`];
    if (cat === 'vergi_isletme') return ['ticaret', 'İşletme vergisi (tür ayrımı öncesi)'];
    if (cat === 'vergi_ikinciEl') return ['ticaret', '2. el satış vergisi'];
    if (cat === 'vergi_piyango') return ['ticaret', 'Piyango vergisi'];
    if (cat === 'vergi_oyun') return ['ticaret', 'Oyunun mekânları vergisi'];
    if (cat.startsWith('gazino_')) return ['ticaret', 'Oyunun gazinosu kârı'];
    if (cat === 'soygun_ceza' || cat === 'soygun_kurtarma') return ['guvenlik', 'Soygun cezaları'];
    if (cat === 'kacak_ceza') return ['guvenlik', 'Yasaklı madde cezaları'];
    if (cat === 'ist_operasyon') return ['guvenlik', 'Operasyon tahsilatı'];
    if (cat === 'ist_rusvet' || cat === 'rusvet_sahipsiz') return ['guvenlik', 'Rüşvetler'];
    if (cat === 'ist_savas' || cat === 'ist_bahis') return ['guvenlik', 'Savaş kazançları'];
    if (cat.startsWith('ist_')) return ['guvenlik', 'Diğer teşkilat gelirleri'];
    if (cat === 'bagis') return ['yonetim', 'Bağışlar'];
    if (cat === 'borc_acik') return ['yonetim', 'Kasa açığının borca çevrilmesi'];
    return ['yonetim', 'Diğer gelirler'];
  }
  if (cat === 'maas_polis' || cat === 'maas_istihbarat') return ['guvenlik', 'Polis maaşları'];
  if (cat === 'soygun_odeme') return ['guvenlik', 'Soygunda ödenen'];
  if (cat === 'soygun_polis_payi') return ['guvenlik', 'Polis soygun payı'];
  if (cat === 'ist_operasyon') return ['guvenlik', 'Operasyon giderleri'];
  if (cat === 'maas_imam') return ['kultur', 'İmam maaşı'];
  if (cat === 'maas_belediye') return ['yonetim', 'Kadro maaşları'];
  if (cat === 'borc_maas' || cat === 'borc_diger') return ['yonetim', 'Borç ödemeleri'];
  return ['yonetim', 'Diğer giderler'];
}

const emptyAcc = () => ({ in: {}, out: {}, inTotal: 0, outTotal: 0 });
function addInto(acc, d) {
  for (const k of ['in', 'out']) for (const [c, n] of Object.entries(d?.[k] || {})) acc[k][c] = (acc[k][c] || 0) + Number(n || 0);
  acc.inTotal += Number(d?.inTotal || 0);
  acc.outTotal += Number(d?.outTotal || 0);
  return acc;
}

// v127: sunucu üzerinden (belediyeAction › defter) — kadro kontrolü sunucuda
async function loadDefter() {
  const r = (await belediyeAction({ op: 'defter' }))?.data || {};
  const byDay = {};
  for (const d of r.days || []) byDay[d.dayKey] = d;
  const lt = r.live?.today;
  if (lt?.dayKey && !byDay[lt.dayKey]) byDay[lt.dayKey] = lt;
  const allTime = addInto(emptyAcc(), r.main?.totals || {});
  if (lt?.dayKey && lt.dayKey > (r.main?.closedThrough || '')) addInto(allTime, lt);
  return { today: r.today || todayKey(), byDay, allTime, liveAtMs: Number(r.live?.atMs || 0), firstDayKey: r.main?.firstDayKey || null };
}

function Chart({ daily, sel, onSel }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.inTotal, d.outTotal)));
  const W = 320;
  const H = 120;
  const slot = W / daily.length;
  const bw = Math.max(2, slot / 2 - 2);
  return (
    <div className="bd-chart">
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Son 30 günün gelir ve gideri">
        <line x1="0" x2={W} y1={H} y2={H} className="bd-chart-base" />
        {daily.map((d, i) => {
          const x = i * slot;
          const hi = (d.inTotal / max) * (H - 4);
          const ho = (d.outTotal / max) * (H - 4);
          const on = sel === d.dayKey;
          return (
            <g key={d.dayKey} onClick={() => onSel(on ? null : d.dayKey)} className={`bd-chart-day${on ? ' on' : ''}`}>
              <title>{`${dayLabel(d.dayKey)} · gelir ${nf(d.inTotal)} · gider ${nf(d.outTotal)} · net ${nf(d.inTotal - d.outTotal)}`}</title>
              <rect x={x} y="0" width={slot} height={H + 16} className="bd-chart-hit" />
              <rect x={x + 1} y={H - hi} width={bw} height={Math.max(0, hi)} rx="2" className="bd-chart-in" />
              <rect x={x + 1 + bw + 1} y={H - ho} width={bw} height={Math.max(0, ho)} rx="2" className="bd-chart-out" />
              {i % 5 === 4 && (
                <text x={x + slot / 2} y={H + 12} textAnchor="middle" className="bd-chart-lbl">
                  {dayLabel(d.dayKey)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="bd-chart-legend">
        <span>
          <i className="in" /> Gelir
        </span>
        <span>
          <i className="out" /> Gider
        </span>
        <span className="dim">Güne dokun → o günün dökümü</span>
      </div>
    </div>
  );
}

function Breakdown({ acc }) {
  const groups = useMemo(() => {
    const g = {};
    for (const kind of ['in', 'out'])
      for (const [cat, n] of Object.entries(acc[kind] || {})) {
        const v = Math.round(Number(n) || 0);
        if (!v) continue;
        const [m, label] = groupOf(kind, cat);
        const r = (g[m] ||= { in: 0, out: 0, lines: {} });
        r[kind] += v;
        const key = `${kind}|${label}`;
        r.lines[key] = (r.lines[key] || 0) + v;
      }
    return g;
  }, [acc]);
  const order = ['sanayi', 'ticaret', 'guvenlik', 'kultur', 'yonetim'].filter((m) => groups[m]);
  if (!order.length) return <p className="dim bd-note">Bu dönemde kayıt yok.</p>;
  return (
    <div className="gx-stack">
      {order.map((m) => {
        const r = groups[m];
        const lines = Object.entries(r.lines).sort((a, b) => (a[0][0] === b[0][0] ? b[1] - a[1] : a[0].startsWith('in') ? -1 : 1));
        return (
          <div key={m} className="gx-card bd-defter-min">
            <div className="bd-change">
              <b>
                {MINISTRIES[m].icon} {MINISTRIES[m].short}
              </b>
              <b>
                <Signed v={r.in - r.out} />
              </b>
            </div>
            {lines.map(([k, v]) => {
              const [kind, label] = k.split('|');
              return (
                <div key={k} className="bd-change bd-defter-line">
                  <span>{label}</span>
                  <span className={kind === 'in' ? 'bd-up' : 'bd-dn'}>
                    {kind === 'in' ? '+' : '−'}
                    {nf(v)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const PERIODS = [
  { id: 'today', label: 'Bugün' },
  { id: 'yesterday', label: 'Dün' },
  { id: 'last7', label: '7 gün' },
  { id: 'last30', label: '30 gün' },
  { id: 'all', label: 'Tümü' },
];

export default function Defter() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [period, setPeriod] = useState('last7');
  const [sel, setSel] = useState(null);
  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await loadDefter());
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <div className="gx-card bd-defter-closed">
        <span className="dim">Geçmiş, kalem kalem gelir-gider ve grafik</span>
        <Btn small busy={busy} onClick={load}>
          📒 Defteri aç
        </Btn>
        {err && <p className="gx-err-text">{err}</p>}
      </div>
    );
  const daily = Array.from({ length: 30 }, (_, i) => {
    const k = addDays(data.today, i - 29);
    const d = data.byDay[k];
    return { dayKey: k, inTotal: Number(d?.inTotal || 0), outTotal: Number(d?.outTotal || 0) };
  });
  const range = (n) => {
    const acc = emptyAcc();
    for (let i = 0; i < n; i++) addInto(acc, data.byDay[addDays(data.today, -i)]);
    return acc;
  };
  const acc = sel ? addInto(emptyAcc(), data.byDay[sel]) : period === 'today' ? range(1) : period === 'yesterday' ? addInto(emptyAcc(), data.byDay[addDays(data.today, -1)]) : period === 'last7' ? range(7) : period === 'last30' ? range(30) : data.allTime;
  const net = acc.inTotal - acc.outTotal;
  return (
    <div className="gx-stack">
      <Chart daily={daily} sel={sel} onSel={setSel} />
      <Chips
        options={PERIODS}
        value={sel ? null : period}
        onChange={(p) => {
          setSel(null);
          setPeriod(p);
        }}
      />
      <div className={`bd-hero ${net >= 0 ? 'pos' : 'neg'}`}>
        <small>{sel ? `${dayLabel(sel)} günü` : PERIODS.find((p) => p.id === period)?.label}</small>
        <b>
          <Signed v={net} unit={false} /> 🪙
        </b>
        <span className="bd-eq">
          +{nf(acc.inTotal)} − {nf(acc.outTotal)}
        </span>
      </div>
      <Breakdown acc={acc} />
      <p className="dim bd-note">
        Bugün en fazla 10 dk gecikmeli
        {data.firstDayKey ? ` · ilk kayıt ${data.firstDayKey.split('-').reverse().join('.')}` : ''}{' '}
        <button className="gx-link" onClick={load} disabled={busy}>
          ↻ Yenile
        </button>
      </p>
    </div>
  );
}
