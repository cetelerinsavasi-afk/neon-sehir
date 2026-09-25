// OPERASYON (İstihbarat)
//  - İhbar edilen tırlar (sahibi çete ile); içeriği sızdırılanlarda sadece
//    ÖDÜL DEĞERİ görünür (ürün adetleri görünmez).
//  - O çetede rütbeli (Kıdemli+) olan İstihbarat üyesine "İçeriği sızdır".
//  - Başkan ve Şef 12:00'ye kadar tek tıra ya da tüm ihbarlı tırlara
//    operasyon başlatır ve RÜŞVET tutarını belirler.
//  - Bir çetede Tetikçi+ olan üye, çetesinin yoldaki tırını ihbar edebilir.
import { useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { istDateKey, istHour, istMidnight, useDocData, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Btn, Card, Confirm, Deadline, BetPair, Empty, Logo } from '../ui';
import { INTEL_LEADERS, atLeast, fmt } from '../gangConstants';

// v33 — Bahisli savaşa müdahale: kabul edilmiş bahis 00:00'da başlamadan önce
// ihbar (çetesinde Tetikçi+), içerik açma (Kıdemli+, toplam bahis görünür),
// operasyon (Başkan/Şef, 100.000). Savaş 00:00'da 3 taraflı başlar.
const BET_OP_PRICE = 100_000;
const INTEL_WINDOW_MS = 6 * 3600_000;

function BetOps({ d }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow(30_000);
  const ms = d.membership;
  const lead = INTEL_LEADERS.includes(d.rank);
  // v35: ilk saldırı diliminin sonuna kadar müdahale edilebilen ihbarlar
  const hourKey = Math.floor(now / 3600_000) * 3600_000;
  const { docs: repsAll } = useQueryData(path('betReports'), () => [where('intelDeadlineMs', '>', hourKey), limit(50)], `betrep_${hourKey}`);
  const reports = repsAll.filter((r) => now < r.intelDeadlineMs);
  const inGang = Boolean(ms.gangId);
  const canReport = inGang && atLeast(ms.gangRank, 'tetikci');
  const canLeak = inGang && atLeast(ms.gangRank, 'kidemli');
  // Çetemin bahisleri: hem teklif eden hem kabul eden çetenin İstihbaratçısı görür
  const { docs: myWars } = useQueryData(inGang ? path('wars') : null, () => [where('activeGangIds', 'array-contains', ms.gangId), limit(60)], `mybets_${ms.gangId}`);
  const reported = new Set(reports.map((r) => r.id));
  const myBets = myWars.filter((w) => w.type === 'bet' && ['accepted', 'active'].includes(w.status) && w.startsAtMs && now < w.startsAtMs + INTEL_WINDOW_MS && !reported.has(w.id));
  const [ask, setAsk] = useState(null);
  if (reports.length === 0 && myBets.length === 0) return null;
  const pairOf = (w) => ({ gangIds: w.gangIds, names: Object.fromEntries(w.gangIds.map((g) => [g, w.names?.[g] || w.sides?.[g]?.name])), logos: Object.fromEntries(w.gangIds.map((g) => [g, w.logos?.[g] || w.sides?.[g]?.logo])) });

  const CONFIRM = {
    reportBet: { icon: '📡', title: 'Bahsi ihbar et', label: 'İhbar et', lines: ['✦ +1.000.000 İstihbarat prestiji', '🕵️ İstihbarat bu bahsi görür, tutarı göremez'] },
    leakBet: { icon: '📦', title: 'Bahsin içeriğini aç', label: 'Aç', lines: ['✦ +1.000.000 İstihbarat prestiji', '💰 İstihbarat toplam bahsi görür'] },
    startBetOperation: { icon: '🎯', title: 'Bahse operasyon', label: 'Başlat', danger: true, lines: [`💸 ${fmt(BET_OP_PRICE)} İstihbarat kasasından`, '⚔️ Savaş 3 taraflı olur', '🏆 En güçlü taraf tüm bahsi alır'] },
  };
  const c = ask ? CONFIRM[ask.type] : null;

  return (
    <>
      {myBets.length > 0 && (
        <div className="gx-section-head">
          <span>📡 Çetemin bahisleri</span>
        </div>
      )}
      {myBets.map((w) => {
        const p = pairOf(w);
        return (
          <Card key={w.id} className="gx-report gx-betrep">
            <BetPair {...p} />
            <div className="gx-betrep-meta">
              <span>
                💰 Bahis: <span className="gx-betrep-stake hidden">gizli</span>
              </span>
              <Deadline untilMs={w.startsAtMs + INTEL_WINDOW_MS} />
            </div>
            <div className="gx-betrep-actions">
              {canReport ? (
                <Btn small onClick={() => setAsk({ type: 'reportBet', id: w.id, p, until: w.startsAtMs + INTEL_WINDOW_MS })}>
                  📡 İhbar et · ✦ +1M
                </Btn>
              ) : (
                <Btn small kind="ghost" disabled>
                  🔒 📡 Tetikçi+
                </Btn>
              )}
            </div>
          </Card>
        );
      })}

      {reports.length > 0 && (
        <div className="gx-section-head">
          <span>🎲 İhbarlı bahisler</span>
        </div>
      )}
      {reports.map((r) => {
        const p = pairOf(r);
        const mine = r.gangIds.includes(ms.gangId);
        return (
          <Card key={r.id} className="gx-report gx-betrep">
            <div className="gx-betrep-top">
              <BetPair {...p} />
            </div>
            <div className="gx-betrep-meta">
              <span>
                💰 Bahis: {r.leaked ? <span className="gx-betrep-stake">{fmt(r.pot)}</span> : <span className="gx-betrep-stake hidden">gizli</span>}
              </span>
              <Deadline untilMs={r.intelDeadlineMs} />
            </div>
            <div className="dim gx-mini">📡 {r.reportedByCode}</div>
            <div className="gx-betrep-actions">
              {!r.leaked && mine && canLeak && (
                <Btn small kind="ghost" onClick={() => setAsk({ type: 'leakBet', id: r.id, p, until: r.intelDeadlineMs })}>
                  📦 İçeriği aç · ✦ +1M
                </Btn>
              )}
              {r.opStarted ? (
                <span className="gx-pill intel">🎯 Operasyon başladı</span>
              ) : lead ? (
                <Btn small kind="danger" onClick={() => setAsk({ type: 'startBetOperation', id: r.id, p, until: r.intelDeadlineMs })}>
                  🎯 Operasyon · {fmt(BET_OP_PRICE)}
                </Btn>
              ) : null}
            </div>
          </Card>
        );
      })}
      {c && (
        <Confirm
          icon={c.icon}
          danger={c.danger}
          title={c.title}
          lines={c.lines}
          confirmLabel={c.label}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(ask.type, { warId: ask.id }, { success: ask.type === 'startBetOperation' ? '🎯 Operasyon başladı' : '🕵️ İstihbarata iletildi', withRequestId: ask.type === 'startBetOperation' });
            setAsk(null);
          }}
        >
          <BetPair {...ask.p} />
          <div className="gx-confirm-deadline">
            <Deadline untilMs={ask.until} />
          </div>
        </Confirm>
      )}
    </>
  );
}

export default function OpsTab({ d }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow();
  const today = istDateKey(now);
  const ms = d.membership;
  const lead = INTEL_LEADERS.includes(d.rank);
  const open = istHour(now) < 12;
  const noonMs = istMidnight(today) + 12 * 3600_000; // v38: ihbar / sızdırma / operasyon 12:00'ye kadar
  const { docs: reports } = useQueryData(path('intelReports'), () => [where('departDateKey', '==', today), limit(100)], `rep_${today}`);
  const { data: day } = useDocData(path(`sabotageDays/${today}`));
  const canReport = Boolean(ms.gangId) && atLeast(ms.gangRank, 'tetikci');
  const { docs: myTrucks } = useQueryData(canReport ? path('trucks') : null, () => [where('gangId', '==', ms.gangId), limit(50)], `mytrucks_${ms.gangId}_${canReport}`);
  const [op, setOp] = useState(null);
  const [bribe, setBribe] = useState(0);
  const [ask, setAsk] = useState(null);
  const price = 10_000 + 10_000 * Number(day?.count || 0);
  const reported = new Set(reports.map((r) => r.truckId));
  const road = myTrucks.filter((t) => t.status === 'in_transit' && t.departDateKey === today);
  const freeReports = reports.filter((r) => !r.opWarId);

  return (
    <div className="gx-stack">
      <div className="gx-section-head">
        <span>🎯 İhbarlı tırlar ({reports.length})</span>
        {open && reports.length > 0 && <Deadline untilMs={noonMs} label="🎯" />}
      </div>
      {lead && open && freeReports.length > 1 && (
        <Btn block kind="danger" onClick={() => { setOp({ all: true }); setBribe(0); }}>
          🎯 Hepsine operasyon ({freeReports.length})
        </Btn>
      )}
      {reports.length === 0 && <Empty icon="📡" text="İhbar yok." />}
      {reports.map((r) => {
        const inThatGang = ms.gangId === r.gangId && atLeast(ms.gangRank, 'kidemli');
        return (
          <Card key={r.id} className="gx-report">
            <div className="gx-report-gang">
              <Logo logo={r.gangLogo} size={28} />
              <div>
                <b>🚛 TIR #{r.truckCode}</b> · {r.gangName}
                <div className="dim gx-mini">📡 {r.reportedByCode}</div>
              </div>
            </div>
            {r.leaked ? <div className="gx-reward">💰 {fmt(r.estReward)}</div> : <div className="dim gx-mini">💰 ?</div>}
            <div className="gx-row-2">
              {!r.leaked && inThatGang && open && (
                <Btn small kind="ghost" onClick={() => setAsk({ type: 'leak', r })}>
                  📦 İçeriği sızdır
                </Btn>
              )}
              {r.opWarId ? (
                <span className="gx-pill intel">🎯 Operasyon başladı</span>
              ) : lead && open ? (
                <Btn small kind="danger" onClick={() => { setOp({ r }); setBribe(0); }}>
                  🎯 Operasyon
                </Btn>
              ) : null}
            </div>
          </Card>
        );
      })}

      <BetOps d={d} />

      {canReport && (
        <>
          <div className="gx-section-head">
            <span>📡 Çetemin yoldaki tırları</span>
            {open && road.some((t) => !reported.has(t.id)) && <Deadline untilMs={noonMs} label="📡" />}
          </div>
          {road.length === 0 && <p className="dim gx-mini">🛣️ Yol boş</p>}
          {road.map((t) => (
            <div key={t.id} className="gx-truck-line">
              <span className="gx-truck-code">🚛 #{t.code}</span>
              {reported.has(t.id) ? (
                <span className="gx-pill intel">📡 İhbar edildi</span>
              ) : !open ? (
                <span className="gx-pill">🔒 12:00</span>
              ) : (
                <Btn small kind="ghost" onClick={() => setAsk({ type: 'report', t })}>
                  📡 İhbar et
                </Btn>
              )}
            </div>
          ))}
        </>
      )}

      {op && (
        <Confirm
          icon="🎯"
          danger
          title={op.all ? `${freeReports.length} tıra operasyon` : `TIR #${op.r.truckCode} (${op.r.gangName}) operasyonu`}
          lines={[`💸 ${fmt(price)}${op.all ? '+' : ''} İstihbarat kasasından`, '⚔️ Saldırı 12:00–24:00 · 4 dilim', '💼 Tır sahibi rüşveti 21:00\'e kadar ödeyebilir']}
          confirmLabel="Başlat"
          busy={busy === 'startOperation'}
          onCancel={() => setOp(null)}
          onConfirm={async () => {
            const r = await run('startOperation', op.all ? { all: true, bribe } : { reportId: op.r.id, bribe }, { success: (res) => `🎯 ${res?.started?.length || 0} operasyon başladı` });
            if (r) setOp(null);
          }}
        >
          <div className="gx-confirm-deadline">
            <Deadline untilMs={noonMs} label="içinde başlat" />
          </div>
          <span className="dim gx-mini">💼 Rüşvet</span>
          <AmountInput value={bribe} onChange={setBribe} placeholder="0" />
        </Confirm>
      )}
      {ask && (
        <Confirm
          icon={ask.type === 'report' ? '📡' : '📦'}
          title={ask.type === 'report' ? `TIR #${ask.t.code} ihbar edilsin mi?` : `TIR #${ask.r.truckCode} içeriği sızdırılsın mı?`}
          lines={ask.type === 'report' ? ['✦ +1.000.000 İstihbarat prestiji', '🕵️ İstihbarat bu tırı görür, yükünü göremez'] : ['✦ +1.000.000 İstihbarat prestiji', '💰 İstihbarat yükün değerini görür']}
          confirmLabel={ask.type === 'report' ? 'İhbar et' : 'Sızdır'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(ask.type === 'report' ? 'reportTruck' : 'leakTruck', ask.type === 'report' ? { truckId: ask.t.id } : { reportId: ask.r.id }, { success: '🕵️ İstihbarata iletildi' });
            setAsk(null);
          }}
        >
          <div className="gx-confirm-deadline">
            <Deadline untilMs={noonMs} label="içinde" />
          </div>
        </Confirm>
      )}
    </div>
  );
}
