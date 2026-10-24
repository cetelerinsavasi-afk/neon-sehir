// v127 — BAKANLIKLAR: dünün analizi (gece 00:00'da 1 kez hazırlanan belge —
// belediye/public.report) + gelir-gider defteri + fiyat / vergi belirleme.
// Bakan sadece kendi panelinde, yardımcı izinli panellerde, başkan her yerde
// işlem yapar; diğerleri görür.
import { useState } from 'react';
import { Btn, Chips, Sheet } from '../Gangs/ui';
import { useImamState } from '../../hooks/useImamState';
import { useBelediyeRatesDoc } from '../../hooks/useBelediyeRates';
import { MINISTRIES, MINISTRY_IDS, RATE_BY_ID, BIZ_RATE_KEY, MACHINE_RATE_KEY, POLICE_RATE_KEY, resolveRates, fmtRate } from '../../../functions/belediyeRates.js';
import { BELEDIYE, canMinistry } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';
import { Kpis, Ledger, Person, RateEditor, Table, dayLabel, hoursLeft, nf, useTick } from './belediyeUi';

const RANK_LABEL = { baskan: 'Emniyet Genel Müdürü', sef: 'Emniyet Amiri', uzman: 'Başkomiser', ajan: 'Komiser', muhbir: 'Polis Memuru' };
const MACHINE_LABEL = { mining: 'Kripto', tamirMalzemesi: 'Tamir Malz.', arabaGelistirme: 'Araba Gel.', silahUpgrade: 'Silah Gel.' };
const IE_LABEL = { araba: '2. el araba', silah: '2. el silah', malzeme: 'Malzeme / makine' };

// Raporun gelir/gider kalemleri: { in: {cat: n}, out: {cat: n} }
function catsOf(report) {
  const out = { in: {}, out: {} };
  for (const m of Object.values(report?.ministries || {})) for (const l of m.lines || []) out[l.kind][l.cat] = (out[l.kind][l.cat] || 0) + Number(l.amount || 0);
  return out;
}
const pctOf = (rates, id) => fmtRate(rates[id], RATE_BY_ID[id].unit);

function Sanayi({ r, c, rates }) {
  const st = r.stat || {};
  const f = r.analysis?.factories;
  const fRows = (f?.top || []).map((x, i) => ({ key: i, name: x.name, gross: nf(x.gross), rate: `%${x.ratePct}`, tax: nf(x.tax) }));
  if (f?.others?.count) fRows.push({ key: 'o', name: `Diğer (${f.others.count})`, gross: nf(f.others.gross), rate: '', tax: nf(f.others.tax) });
  const fGross = (f?.top || []).reduce((a, x) => a + x.gross, 0) + Number(f?.others?.gross || 0);
  const fTax = (f?.top || []).reduce((a, x) => a + x.tax, 0) + Number(f?.others?.tax || 0);
  const mk = Object.keys(MACHINE_RATE_KEY).map((t) => ({ key: t, name: MACHINE_LABEL[t], n: nf(st[`mk_${t}_n`]), ciro: nf(st[`mk_${t}_ciro`]), rate: pctOf(rates, MACHINE_RATE_KEY[t]), tax: nf(st[`mk_${t}_vergi`]) }));
  return (
    <>
      <Kpis
        items={[
          { label: 'Fabrika vergisi', value: nf(c.in.vergi_fabrika), sub: f?.count ? `${f.count} fabrika` : null },
          { label: 'Makine vergisi', value: nf(c.in.vergi_makine) },
          { label: 'İşçi maaş vergisi', value: nf(c.in.vergi_maasIsci), sub: st.isci_n ? `${nf(st.isci_n)} maaş · brüt ${nf(st.isci_brut)}` : null },
        ]}
      />
      {fRows.length > 0 && (
        <>
          <h4 className="bd-h">En çok vergi ödeyen fabrikalar</h4>
          <Table
            cols={[
              { k: 'name', label: 'Fabrika' },
              { k: 'gross', label: 'Brüt', num: true },
              { k: 'rate', label: 'Dilim', num: true },
              { k: 'tax', label: 'Vergi', num: true },
            ]}
            rows={fRows}
            foot={{ name: 'Toplam', gross: nf(fGross), rate: '', tax: nf(fTax) }}
          />
        </>
      )}
      <h4 className="bd-h">Makine alımları</h4>
      <Table
        cols={[
          { k: 'name', label: 'Makine' },
          { k: 'n', label: 'Adet', num: true },
          { k: 'ciro', label: 'Ciro', num: true },
          { k: 'rate', label: 'Oran', num: true },
          { k: 'tax', label: 'Vergi', num: true },
        ]}
        rows={mk}
      />
    </>
  );
}

function Ticaret({ r, c, rates }) {
  const st = r.stat || {};
  const counts = r.analysis?.bizCounts || {};
  const taxOfType = (t) => (c.in[`vergi_isl_${t}`] || 0) + (t === 'ofis' ? c.in.vergi_ofis || 0 : 0) + (t === 'gazino' ? (c.in.vergi_gazino || 0) + (c.in.vergi_gazinoCekim || 0) : 0);
  const types = Object.keys(BIZ_RATE_KEY);
  // v127: aynı orana bağlı türler (ör. sinema / stüdyo / mescit → Ofis) tek satırda
  const byKey = {};
  for (const t of types) {
    const k = BIZ_RATE_KEY[t];
    const row = (byKey[k] ||= { k, n: null, ciro: 0, tax: 0 });
    if (counts[t] != null) row.n = (row.n || 0) + counts[t];
    row.ciro += st[`isl_${t}_ciro`] || 0;
    row.tax += taxOfType(t);
  }
  const rows = Object.values(byKey)
    .filter((x) => x.n || x.ciro || x.tax)
    .map((x) => ({ key: x.k, name: RATE_BY_ID[x.k].label.replace(' (gazino)', '').replace(' Kazançları', ''), n: x.n != null ? nf(x.n) : '—', ciro: nf(x.ciro), rate: pctOf(rates, x.k), tax: nf(x.tax) }));
  const bizTax = types.reduce((a, t) => a + taxOfType(t), 0);
  const ie = ['araba', 'silah'].map((k) => ({ key: k, name: IE_LABEL[k], n: nf(st[`ie_${k}_n`]), ciro: nf(st[`ie_${k}_ciro`]), rate: pctOf(rates, k === 'araba' ? 'ikAraba' : 'ikSilah') }));
  return (
    <>
      <Kpis
        items={[
          { label: 'İşletme vergisi', value: nf(bizTax) },
          { label: '2. el vergisi', value: nf(c.in.vergi_ikinciEl) },
          { label: 'Piyango vergisi', value: nf(c.in.vergi_piyango), sub: st.pi_bilet ? `${nf(st.pi_bilet)} bilet · ödül ${nf(st.pi_odul)}` : null },
        ]}
      />
      {rows.length > 0 && (
        <>
          <h4 className="bd-h">İşletmeler</h4>
          <Table
            cols={[
              { k: 'name', label: 'Tür' },
              { k: 'n', label: 'Adet', num: true },
              { k: 'ciro', label: 'Ciro', num: true },
              { k: 'rate', label: 'Oran', num: true },
              { k: 'tax', label: 'Vergi', num: true },
            ]}
            rows={rows}
          />
        </>
      )}
      <h4 className="bd-h">2. el satışlar</h4>
      <Table
        cols={[
          { k: 'name', label: 'Kalem' },
          { k: 'n', label: 'Satış', num: true },
          { k: 'ciro', label: 'Tutar', num: true },
          { k: 'rate', label: 'Oran', num: true },
        ]}
        rows={ie}
      />
    </>
  );
}

function Guvenlik({ r, c, rates }) {
  const ranks = r.analysis?.police?.ranks || {};
  const order = Object.keys(POLICE_RATE_KEY);
  const rows = order.map((k) => ({ key: k, name: RANK_LABEL[k], n: nf(ranks[k]), maas: nf(rates[POLICE_RATE_KEY[k]]), top: nf((ranks[k] || 0) * rates[POLICE_RATE_KEY[k]]) }));
  const total = order.reduce((a, k) => a + (ranks[k] || 0), 0);
  const soygun = (c.in.soygun_ceza || 0) - (c.out.soygun_odeme || 0) - (c.out.soygun_polis_payi || 0);
  const ops = (c.in.ist_operasyon || 0) + (c.in.ist_rusvet || 0) - (c.out.ist_operasyon || 0);
  return (
    <>
      <Kpis
        items={[
          { label: 'Polis maaşları', value: nf(c.out.maas_polis), sub: `${nf(total)} polis` },
          { label: 'Soygun neti', value: nf(soygun), sub: 'ceza − ödeme − pay' },
          { label: 'Operasyon neti', value: nf(ops) },
        ]}
      />
      <h4 className="bd-h">Rütbeler</h4>
      <Table
        cols={[
          { k: 'name', label: 'Rütbe' },
          { k: 'n', label: 'Kişi', num: true },
          { k: 'maas', label: 'Maaş', num: true },
          { k: 'top', label: 'Toplam', num: true },
        ]}
        rows={rows}
      />
    </>
  );
}

function ImamBox() {
  const { main, seat, run, busy } = useBelediye();
  const { imam } = useImamState();
  const now = useTick(60_000);
  const [ask, setAsk] = useState(false);
  const [why, setWhy] = useState('');
  const can = canMinistry(main, seat, 'kultur');
  if (!imam?.uid)
    return (
      <div className="gx-card">
        <div className="bd-card-title">🕌 İmamlık</div>
        <p className="dim bd-note">Şu an imam yok.</p>
      </div>
    );
  const became = imam.becameImamAt?.toMillis?.() || 0;
  const guardUntil = became + BELEDIYE.IMAM_GUARD_MS;
  const guarded = became > 0 && guardUntil > now;
  const nAt = imam.lastNasihatAt?.toMillis?.() || 0;
  const ago = nAt ? Math.floor((now - nAt) / 3_600_000) : null;
  const fire = async () => {
    const r = await run('fireImam', { reason: why.trim() }, { success: 'İmam görevden alındı.' });
    if (r) {
      setAsk(false);
      setWhy('');
    }
  };
  return (
    <div className="gx-card">
      <div className="bd-card-title">🕌 İmamlık</div>
      <Person name={imam.displayName || 'İmam'} avatar={imam.avatar} sub={guarded ? `🛡️ ${hoursLeft(guardUntil, now)} saat görevden alınamaz` : 'Görevde'} />
      {imam.lastNasihat ? (
        <blockquote className="bd-quote">
          “{imam.lastNasihat}”<small className="dim">{ago === 0 ? 'az önce' : `${ago} saat önce`}</small>
        </blockquote>
      ) : (
        <p className="dim bd-note">Henüz nasihat yazmadı.</p>
      )}
      {can && (
        <Btn kind="danger" small disabled={guarded} onClick={() => setAsk(true)}>
          İmamı görevden al
        </Btn>
      )}
      {ask && (
        <Sheet title="İmamı görevden al" icon="🕌" onClose={() => setAsk(false)}>
          <textarea className="gx-input" rows={3} maxLength={BELEDIYE.REASON_MAX} placeholder="Neden?" value={why} onChange={(e) => setWhy(e.target.value)} />
          <Btn kind="danger" block busy={busy === 'fireImam'} disabled={why.trim().length < BELEDIYE.REASON_MIN} onClick={fire}>
            Görevden al
          </Btn>
        </Sheet>
      )}
    </div>
  );
}

function Kultur({ r, c, rates }) {
  const st = r.stat || {};
  const cr = r.analysis?.creators || [];
  return (
    <>
      <Kpis
        items={[
          { label: 'Yayın', value: nf(st.sosyal_yayin), sub: `vergi ${nf(c.in.vergi_yayin)}` },
          { label: 'Şarkı', value: nf(st.sosyal_sarki), sub: `vergi ${nf(c.in.vergi_sanatci)}` },
          { label: 'Futbolcu maaşı', value: nf(st.fut_brut), sub: `vergi ${nf(c.in.vergi_maasFutbolcu)} · ${pctOf(rates, 'futbolcu')}` },
          { label: 'Menajer maaşı', value: nf(st.men_brut), sub: `vergi ${nf(c.in.vergi_maasMenajer)} · ${pctOf(rates, 'menajer')}` },
        ]}
      />
      {cr.length > 0 && (
        <>
          <h4 className="bd-h">En çok kazananlar</h4>
          <Table
            cols={[
              { k: 'name', label: 'İçerik üreticisi' },
              { k: 'kind', label: 'Tür' },
              { k: 'earned', label: 'Kazanç', num: true },
            ]}
            rows={cr.map((x, i) => ({ key: i, name: x.name, kind: x.kind, earned: nf(x.earned) }))}
          />
        </>
      )}
      <ImamBox />
    </>
  );
}

const VIEWS = { sanayi: Sanayi, ticaret: Ticaret, guvenlik: Guvenlik, kultur: Kultur };

export default function BakanliklarTab() {
  const { pub, main } = useBelediye();
  const { doc } = useBelediyeRatesDoc();
  const [m, setM] = useState('sanayi');
  const r = pub.report;
  const rates = resolveRates(doc, r?.dayKey || '0000-00-00');
  const c = catsOf(r);
  const View = VIEWS[m];
  const holder = main.seats?.[MINISTRIES[m].seat];
  return (
    <div className="gx-page">
      <Chips options={MINISTRY_IDS.map((id) => ({ id, label: MINISTRIES[id].short, icon: MINISTRIES[id].icon }))} value={m} onChange={setM} />
      <div className="gx-card bd-min-head">
        <Person name={MINISTRIES[m].label} avatar={holder?.avatar} sub={holder?.uid ? `Bakan · ${holder.name}` : 'Bakan yok'} />
      </div>
      <div className="gx-section-head">
        <span>📊 Analiz{r ? ` · ${dayLabel(r.dayKey)}` : ''}</span>
      </div>
      {r ? (
        <>
          <View r={r} c={c} rates={rates} />
          <h4 className="bd-h">Gelir – gider</h4>
          <Ledger m={r.ministries?.[m]} />
        </>
      ) : (
        <>
          <p className="dim bd-note">İlk analiz bu gece 00:00'da hazırlanır.</p>
          {m === 'kultur' && <ImamBox />}
        </>
      )}
      <div className="gx-section-head">
        <span>⚙️ Fiyat ve vergi belirleme</span>
      </div>
      <RateEditor m={m} />
    </div>
  );
}
