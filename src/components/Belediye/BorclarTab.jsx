// v127 — BORÇLAR: kasa + maaş borçları (gün gün, her biri tek seferde) +
// diğer borçlar (soygun %1 faizli + eski açık; parça parça). Ödeme yetkisi:
// başkan ve başkan yardımcıları (her zaman).
import { useState } from 'react';
import { AmountInput, Btn, Gold } from '../Gangs/ui';
import { canPayDebts } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';
import { dayLabel, nf } from './belediyeUi';

const LOG_LABEL = { soygun: 'Soygun borcu', eski: 'Eski açık', faiz: 'Faiz', odeme: 'Ödeme' };

export default function BorclarTab() {
  const { panel, panelErr, loadPanel, seat, run, busy } = useBelediye();
  const [amt, setAmt] = useState(0);
  if (!panel)
    return (
      <div className="gx-page">
        {panelErr ? (
          <div className="bd-note">
            <span className="gx-err-text">{panelErr}</span>{' '}
            <Btn small kind="ghost" onClick={loadPanel}>
              Tekrar dene
            </Btn>
          </div>
        ) : (
          <div className="gx-loading">Yükleniyor…</div>
        )}
      </div>
    );
  const can = canPayDebts(seat);
  const kasa = Math.max(0, Number(panel.kasa?.spendable || 0));
  const maas = panel.debts?.maas || [];
  const other = panel.debts?.other || { soygun: 0, eski: 0, log: [] };
  const otherTotal = Number(other.soygun || 0) + Number(other.eski || 0);
  const maxPay = Math.min(otherTotal, kasa);
  const pay = Math.min(amt, maxPay);

  const payDay = async (d) => {
    const r = await run('payDebt', { debtId: d.id }, { key: `debt_${d.id}`, success: (x) => (x?.ok ? `✅ ${dayLabel(d.workDay || d.dayKey)} maaşları ödendi.` : 'Ödeme sürüyor…') });
    if (r) loadPanel();
  };
  const payPart = async () => {
    const r = await run('payOther', { amount: pay }, { success: (x) => `✅ ${nf(x.paid)} altın ödendi.` });
    if (r) {
      setAmt(0);
      loadPanel();
    }
  };

  return (
    <div className="gx-page">
      <div className="gx-card bd-kasa">
        <small className="dim">🏛️ Belediye kasası</small>
        <Gold value={kasa} big />
        <button className="gx-link" onClick={loadPanel}>
          ↻ Yenile
        </button>
      </div>

      <div className="gx-section-head">
        <span>💼 Maaş borçları</span>
        {maas.length > 0 && <Gold value={maas.reduce((a, d) => a + Number(d.total || 0), 0)} />}
      </div>
      {maas.length === 0 ? (
        <p className="dim bd-note">Maaş borcu yok.</p>
      ) : (
        <div className="gx-card">
          {maas.map((d) => (
            <div key={d.id} className="bd-debt">
              <span>
                <b>{dayLabel(d.workDay || d.dayKey)}</b> maaşları
                <small className="dim"> · {d.count} kişi</small>
              </span>
              <Gold value={d.total} />
              {can && (
                <Btn small busy={busy === `debt_${d.id}`} disabled={Boolean(busy) || (d.status !== 'paying' && kasa < d.total)} onClick={() => payDay(d)}>
                  {d.status === 'paying' ? 'Devam' : 'Öde'}
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="gx-section-head">
        <span>🧾 Diğer borçlar</span>
        {otherTotal > 0 && <Gold value={otherTotal} />}
      </div>
      {otherTotal === 0 ? (
        <p className="dim bd-note">Borç yok.</p>
      ) : (
        <div className="gx-card">
          {other.soygun > 0 && (
            <div className="bd-change">
              <span>
                Soygun ödemeleri <small className="dim">· %1 / gün faiz</small>
              </span>
              <b className="bd-dn">{nf(other.soygun)}</b>
            </div>
          )}
          {other.eski > 0 && (
            <div className="bd-change">
              <span>Eski kasa açığı</span>
              <b className="bd-dn">{nf(other.eski)}</b>
            </div>
          )}
          {can && (
            <>
              <AmountInput value={pay} onChange={setAmt} min={0} max={maxPay} />
              <Btn block busy={busy === 'payOther'} disabled={pay <= 0} onClick={payPart}>
                {nf(pay)} altın öde
              </Btn>
            </>
          )}
        </div>
      )}
      {other.log?.length > 0 && (
        <div className="gx-card bd-log">
          {other.log.slice(0, 8).map((l, i) => (
            <div key={i} className="bd-change">
              <span className="dim">
                {dayLabel(new Date(l.atMs + 3 * 3600_000).toISOString().slice(0, 10))} · {LOG_LABEL[l.kind] || l.kind}
                {l.note ? ` · ${l.note}` : ''}
              </span>
              <b className={l.kind === 'odeme' ? 'bd-up' : 'bd-dn'}>{nf(l.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
