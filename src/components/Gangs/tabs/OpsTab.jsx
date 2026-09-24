// OPERASYON (İstihbarat)
//  - İhbar edilen tırlar (sahibi çete ile); içeriği sızdırılanlarda sadece
//    ÖDÜL DEĞERİ görünür (ürün adetleri görünmez).
//  - O çetede rütbeli (Kıdemli+) olan İstihbarat üyesine "İçeriği sızdır".
//  - Başkan ve Şef 12:00'ye kadar tek tıra ya da tüm ihbarlı tırlara
//    operasyon başlatır ve RÜŞVET tutarını belirler.
//  - Bir çetede Tetikçi+ olan üye, çetesinin yoldaki tırını ihbar edebilir.
import { useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { fmtCountdown, istDateKey, istHour, nextMidnight, useDocData, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Btn, Card, Confirm, Empty, Logo } from '../ui';
import { INTEL_LEADERS, atLeast, fmt } from '../gangConstants';

// v33 — Bahisli savaşa müdahale: kabul edilmiş bahis 00:00'da başlamadan önce
// ihbar (çetesinde Tetikçi+), içerik açma (Kıdemli+, toplam bahis görünür),
// operasyon (Başkan/Şef, 100.000). Savaş 00:00'da 3 taraflı başlar.
const BET_OP_PRICE = 100_000;
function BetOps({ d }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow();
  const ms = d.membership;
  const lead = INTEL_LEADERS.includes(d.rank);
  const tomorrow = istDateKey(nextMidnight(now) + 3600_000);
  const { docs: reports } = useQueryData(path('betReports'), () => [where('dateKey', '==', tomorrow), limit(50)], `betrep_${tomorrow}`);
  const canReport = Boolean(ms.gangId) && atLeast(ms.gangRank, 'tetikci');
  const canLeak = Boolean(ms.gangId) && atLeast(ms.gangRank, 'kidemli');
  const { docs: myWars } = useQueryData(canReport ? path('wars') : null, () => [where('activeGangIds', 'array-contains', ms.gangId), limit(60)], `mybets_${ms.gangId}_${canReport}`);
  const myBets = myWars.filter((w) => w.type === 'bet' && w.status === 'accepted' && w.dateKey === tomorrow);
  const reported = new Set(reports.map((r) => r.id));
  const [ask, setAsk] = useState(null);
  const left = fmtCountdown(nextMidnight(now) - now);
  if (reports.length === 0 && myBets.length === 0) return null;
  const nameOf = (r, g) => r.names?.[g] || r.sides?.[g]?.name;
  const logoOf = (r, g) => r.logos?.[g] || r.sides?.[g]?.logo;
  const Pair = ({ r }) => (
    <div className="gx-bet-pair">
      <Logo logo={logoOf(r, r.gangIds[0])} size={24} />
      <b>{nameOf(r, r.gangIds[0])}</b>
      <span className="dim">⚔️</span>
      <b>{nameOf(r, r.gangIds[1])}</b>
      <Logo logo={logoOf(r, r.gangIds[1])} size={24} />
    </div>
  );
  return (
    <>
      {reports.length > 0 && (
        <div className="gx-section-head">
          <span>🎲 İhbarlı bahisler</span>
          <span className="gx-timer">⏱ {left}</span>
        </div>
      )}
      {reports.map((r) => (
        <Card key={r.id} className="gx-report">
          <Pair r={r} />
          <div className="dim gx-mini">📡 {r.reportedByCode}</div>
          {r.leaked ? <div className="gx-reward">💰 {fmt(r.pot)}</div> : <div className="dim gx-mini">💰 ?</div>}
          <div className="gx-row-2">
            {!r.leaked && canLeak && r.gangIds.includes(ms.gangId) && (
              <Btn small kind="ghost" onClick={() => setAsk({ type: 'leakBet', r })}>
                📦 İçeriği aç
              </Btn>
            )}
            {r.opStarted ? (
              <span className="gx-pill intel">🎯 Operasyon başladı</span>
            ) : lead ? (
              <Btn small kind="danger" onClick={() => setAsk({ type: 'startBetOperation', r })}>
                🎯 Operasyon · {fmt(BET_OP_PRICE)}
              </Btn>
            ) : null}
          </div>
        </Card>
      ))}
      {myBets.length > 0 && (
        <div className="gx-section-head">
          <span>📡 Çetemin bahisleri</span>
        </div>
      )}
      {myBets.map((w) => (
        <div key={w.id} className="gx-truck-line">
          <span className="gx-truck-code">🎲 {w.sides?.[w.gangIds.find((g) => g !== ms.gangId)]?.name}</span>
          {reported.has(w.id) ? (
            <span className="gx-pill intel">📡 İhbar edildi</span>
          ) : (
            <Btn small kind="ghost" onClick={() => setAsk({ type: 'reportBet', r: { id: w.id, gangIds: w.gangIds, sides: w.sides } })}>
              📡 İhbar et
            </Btn>
          )}
        </div>
      ))}
      {ask && (
        <Confirm
          icon={ask.type === 'startBetOperation' ? '🎯' : ask.type === 'leakBet' ? '📦' : '📡'}
          danger={ask.type === 'startBetOperation'}
          title={`${nameOf(ask.r, ask.r.gangIds[0])} ⚔️ ${nameOf(ask.r, ask.r.gangIds[1])}`}
          lines={ask.type === 'startBetOperation' ? [`💸 ${fmt(BET_OP_PRICE)}`, '⚔️ 3 taraf · 🏆 en güçlü alır'] : ['✦ +1.000.000']}
          confirmLabel={ask.type === 'startBetOperation' ? 'Başlat' : ask.type === 'leakBet' ? 'Aç' : 'İhbar et'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(ask.type, { warId: ask.r.id }, { success: ask.type === 'startBetOperation' ? '🎯 Operasyon başladı' : '🕵️ İstihbarata iletildi', withRequestId: ask.type === 'startBetOperation' });
            setAsk(null);
          }}
        />
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
              {!r.leaked && inThatGang && (
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
          </div>
          {road.length === 0 && <p className="dim gx-mini">🛣️ Yol boş</p>}
          {road.map((t) => (
            <div key={t.id} className="gx-truck-line">
              <span className="gx-truck-code">🚛 #{t.code}</span>
              {reported.has(t.id) ? (
                <span className="gx-pill intel">📡 İhbar edildi</span>
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
          lines={[`💸 ${fmt(price)}${op.all ? '+' : ''}`]}
          confirmLabel="Başlat"
          busy={busy === 'startOperation'}
          onCancel={() => setOp(null)}
          onConfirm={async () => {
            const r = await run('startOperation', op.all ? { all: true, bribe } : { reportId: op.r.id, bribe }, { success: (res) => `🎯 ${res?.started?.length || 0} operasyon başladı` });
            if (r) setOp(null);
          }}
        >
          <span className="dim gx-mini">💼 Rüşvet</span>
          <AmountInput value={bribe} onChange={setBribe} placeholder="0" />
        </Confirm>
      )}
      {ask && (
        <Confirm
          icon={ask.type === 'report' ? '📡' : '📦'}
          title={ask.type === 'report' ? `TIR #${ask.t.code} ihbar edilsin mi?` : `TIR #${ask.r.truckCode} içeriği sızdırılsın mı?`}
          lines={['✦ +1.000.000']}
          confirmLabel={ask.type === 'report' ? 'İhbar et' : 'Sızdır'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(ask.type === 'report' ? 'reportTruck' : 'leakTruck', ask.type === 'report' ? { truckId: ask.t.id } : { reportId: ask.r.id }, { success: '🕵️ İstihbarata iletildi' });
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}
