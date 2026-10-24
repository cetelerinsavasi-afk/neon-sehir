// v127 — BELEDİYE RAPORU (herkes görür)
//   Başkan → (davetliysen) iş teklifi → Toplu Rapor (dünün sonucu) → bugünün
//   zam / indirimleri → maaş uyarısı → borçlar → bağış + günün bağışçıları
import { useState } from 'react';
import { useDocData } from '../Gangs/GangContext';
import { AmountInput, Btn, Gold, Logo, Sheet } from '../Gangs/ui';
import { MINISTRIES, rateDayKey, fmtRate } from '../../../functions/belediyeRates.js';
import { BELEDIYE, SEATS } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';
import { MIN_ORDER, Person, Signed, Table, dayLabel, hoursLeft, nf, useTick } from './belediyeUi';

function MayorCard() {
  const { main, isAdmin, seat, run, busy } = useBelediye();
  const bsk = main.seats?.bsk;
  return (
    <div className="gx-card bd-mayor">
      {bsk?.uid ? (
        <Person name={bsk.name} avatar={bsk.avatar} sub="Belediye Başkanı" size={56} right={<span className="bd-crown">👑</span>} />
      ) : (
        <div className="bd-mayor-empty">
          <span className="bd-crown">🏛️</span>
          <span className="dim">Belediye başkanı yok</span>
          {isAdmin && !seat && (
            <Btn small busy={busy === 'claimMayor'} onClick={() => run('claimMayor', {}, { success: '👑 Belediye başkanı oldun.' })}>
              Başkanlığı devral
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

function InviteCard() {
  const { player, run, busy } = useBelediye();
  const now = useTick(60_000);
  const inv = player?.belediyeInvite;
  if (!inv || Number(inv.expiresAtMs || 0) <= now) return null;
  return (
    <div className="gx-card bd-invite">
      <div className="bd-card-title">✉️ İş teklifi</div>
      <div className="bd-invite-body">
        <b>{inv.title || SEATS[inv.seat]?.title}</b>
        <span>
          Maaş <Gold value={inv.salary} /> / gün
        </span>
        <small className="dim">
          {inv.byName} davet etti · {hoursLeft(inv.expiresAtMs, now)} saat içinde cevap ver
        </small>
      </div>
      <div className="gx-row-2">
        <Btn kind="ghost" busy={busy === 'red'} onClick={() => run('respondInvite', { accept: false }, { key: 'red', success: 'Davet reddedildi.' })}>
          Reddet
        </Btn>
        <Btn busy={busy === 'kabul'} onClick={() => run('respondInvite', { accept: true }, { key: 'kabul', success: (r) => (r?.accepted ? '✅ Göreve başladın.' : 'Davetin süresi dolmuş.') })}>
          Kabul et
        </Btn>
      </div>
    </div>
  );
}

function TopluRapor() {
  const { pub } = useBelediye();
  const r = pub.report;
  if (!r) return <p className="dim bd-note">İlk rapor bu gece 00:00'da hazırlanır.</p>;
  const ms = r.ministries || {};
  const net = Number(r.net || 0);
  return (
    <>
      <div className={`bd-hero ${net >= 0 ? 'pos' : 'neg'}`}>
        <small>{dayLabel(r.dayKey)} · belediyenin sonucu</small>
        <b>
          <Signed v={net} unit={false} /> 🪙
        </b>
        <span className="bd-eq">
          +{nf(r.inTotal)} − {nf(r.outTotal)}
        </span>
      </div>
      <Table
        cols={[
          { k: 'm', label: 'Bakanlık' },
          { k: 'in', label: 'Gelir', num: true },
          { k: 'out', label: 'Gider', num: true },
          { k: 'net', label: 'Net', num: true },
        ]}
        rows={MIN_ORDER.filter((m) => ms[m] && (ms[m].in || ms[m].out)).map((m) => ({
          key: m,
          m: MINISTRIES[m]?.short || m,
          in: ms[m].in ? `+${nf(ms[m].in)}` : '0',
          out: ms[m].out ? `−${nf(ms[m].out)}` : '0',
          net: <Signed v={ms[m].in - ms[m].out} unit={false} />,
        }))}
        foot={{ m: 'Toplam', in: `+${nf(r.inTotal)}`, out: `−${nf(r.outTotal)}`, net: <Signed v={net} unit={false} /> }}
      />
    </>
  );
}

function Changes() {
  const { pub } = useBelediye();
  const today = rateDayKey();
  if (pub.changesDay !== today) return null;
  const list = pub.changes || [];
  return (
    <>
      <div className="gx-section-head">
        <span>📣 Bugünün zam ve indirimleri</span>
      </div>
      {list.length === 0 ? (
        <p className="dim bd-note">Bugün değişiklik yok.</p>
      ) : (
        <div className="gx-card bd-changes">
          {list.map((c) => (
            <div key={c.id} className="bd-change">
              <span>
                {c.label}
                <small className="dim"> · {MINISTRIES[c.m]?.short || ''}</small>
              </span>
              <b className={c.good ? 'bd-up' : 'bd-dn'}>
                {c.to > c.from ? '▲' : '▼'} {fmtRate(c.from, c.unit)} → {fmtRate(c.to, c.unit)}
              </b>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PayrollAndDebts() {
  const { pub } = useBelediye();
  const today = rateDayKey();
  const pr = pub.payroll;
  const d = pub.report?.debts;
  const unpaid = pr?.dayKey === today && pr.paid === false;
  const paidOld = pr?.dayKey === today && pr.paidOld?.length > 0;
  const hasDebt = d && (d.maasTotal > 0 || d.other > 0);
  if (!unpaid && !paidOld && !hasDebt) return null;
  return (
    <div className="gx-stack">
      {unpaid && <div className="gx-warn">⚠️ Bugün maaşlar ödenemedi — kasada yeterli para yoktu ({nf(pr.total)} 🪙 borç yazıldı).</div>}
      {paidOld && <div className="bd-okbox">✅ {pr.paidOld.length} günlük eski maaş borcu ödendi.</div>}
      {hasDebt && (
        <div className="gx-card">
          <div className="bd-card-title">💳 Borçlar ({dayLabel(pub.report.dayKey)} sonu)</div>
          {d.maasTotal > 0 && (
            <div className="bd-change">
              <span>Maaş borcu · {d.maasCount} gün</span>
              <b className="bd-dn">{nf(d.maasTotal)} 🪙</b>
            </div>
          )}
          {d.other > 0 && (
            <div className="bd-change">
              <span>Diğer borçlar</span>
              <b className="bd-dn">{nf(d.other)} 🪙</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Donations() {
  const { player, run, busy } = useBelediye();
  const today = rateDayKey();
  const { data } = useDocData(`belediyeDonations/${today}`);
  const [open, setOpen] = useState(false);
  const gold = Math.floor(Number(player?.gold || 0));
  const [amt, setAmt] = useState(BELEDIYE.MIN_DONATION);
  const top = data?.top || [];
  const give = async () => {
    const r = await run('donate', { amount: amt }, { success: (x) => `🏛️ ${nf(x.amount)} altın bağışladın. Teşekkürler!` });
    if (r) setOpen(false);
  };
  return (
    <>
      <div className="gx-section-head">
        <span>🎁 Günün bağışçıları</span>
        {data?.total > 0 && <Gold value={data.total} />}
      </div>
      {top.length > 0 ? (
        <div className="gx-card bd-donors">
          {top.map((t, i) => (
            <div key={t.key} className="bd-donor">
              <span className="bd-medal">{['🥇', '🥈', '🥉'][i]}</span>
              {t.kind === 'gang' && <Logo logo={t.logo} size={22} />}
              <span className="bd-donor-name">{t.name}</span>
              <Gold value={t.amount} />
            </div>
          ))}
        </div>
      ) : (
        <p className="dim bd-note">Bugün henüz bağış yok.</p>
      )}
      <Btn block onClick={() => setOpen(true)}>
        🎁 Bağış yap
      </Btn>
      {open && (
        <Sheet title="Belediyeye bağış" icon="🎁" onClose={() => setOpen(false)}>
          <AmountInput value={amt} onChange={setAmt} min={BELEDIYE.MIN_DONATION} max={Math.max(BELEDIYE.MIN_DONATION, gold)} />
          <p className="dim bd-note">
            Altının: {nf(gold)} · en az {nf(BELEDIYE.MIN_DONATION)}
          </p>
          <Btn block busy={busy === 'donate'} disabled={amt < BELEDIYE.MIN_DONATION || amt > gold} onClick={give}>
            {nf(amt)} altın bağışla
          </Btn>
        </Sheet>
      )}
    </>
  );
}

export default function RaporTab() {
  return (
    <div className="gx-page">
      <MayorCard />
      <InviteCard />
      <div className="gx-section-head">
        <span>📋 Toplu Rapor</span>
      </div>
      <TopluRapor />
      <Changes />
      <PayrollAndDebts />
      <Donations />
    </div>
  );
}
