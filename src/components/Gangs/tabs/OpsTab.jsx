// OPERASYON (İstihbarat)
//  - İhbar edilen tırlar (sahibi çete ile); içeriği sızdırılanlarda sadece
//    ÖDÜL DEĞERİ görünür (ürün adetleri görünmez).
//  - O çetede rütbeli (Kıdemli+) olan İstihbarat üyesine "İçeriği sızdır".
//  - Başkan ve Şef 12:00'ye kadar tek tıra ya da tüm ihbarlı tırlara
//    operasyon başlatır ve RÜŞVET tutarını belirler.
//  - Bir çetede Tetikçi+ olan üye, çetesinin yoldaki tırını ihbar edebilir.
import { useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { istDateKey, istHour, useDocData, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Btn, Card, Confirm, Empty, Info, Logo } from '../ui';
import { INTEL_LEADERS, atLeast, fmt } from '../gangConstants';

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
        <Info text="Operasyon 00:00–12:00 arası Başkan ve Şefler tarafından başlatılır; ücret oyun genelindeki sabotaj ücretidir. Rüşvet tutarını operasyonu başlatan belirler; tır sahibi 18:00'e kadar öderse operasyon durur ve para İstihbarat kasasına girer. Başarılı operasyonda yük imha edilir, kasaya anlık satış değeri kadar ödül girer." />
      </div>
      {lead && open && freeReports.length > 1 && (
        <Btn block kind="danger" onClick={() => { setOp({ all: true }); setBribe(0); }}>
          🎯 Tüm ihbarlı tırlara operasyon ({freeReports.length}) · tır başı {fmt(price)}+
        </Btn>
      )}
      {reports.length === 0 && <Empty icon="📡" text="Bugün ihbar edilen tır yok." />}
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
            {r.leaked ? <div className="gx-reward">💰 Ödül değeri: {fmt(r.estReward)}</div> : <div className="dim gx-mini">İçerik sızdırılmadı</div>}
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

      {canReport && (
        <>
          <div className="gx-section-head">
            <span>📡 Çetemin yoldaki tırları</span>
            <Info text="Çetende en az Tetikçi isen, çetenin yoldaki tırını İstihbarata ihbar edebilirsin (+1.000.000 prestij). Bir tır bir kez ihbar edilir. Çetede Kıdemli+ isen ihbar edilen tırın içeriğini sızdırabilirsin (+1.000.000)." />
          </div>
          {road.length === 0 && <p className="dim gx-mini">Çetenin bugün yolda tırı yok.</p>}
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
          lines={[`💸 Ücret: ${fmt(price)} altın${op.all ? ' (her operasyonda +10.000)' : ''} — İstihbarat kasasından.`, "⚔️ Saldırı 12:00'de başlar; tır sahibi 12:00'de öğrenir.", '💼 Rüşvet (0 = kabul yok): tır sahibi öderse operasyon durur, para kasaya.']}
          confirmLabel="Başlat"
          busy={busy === 'startOperation'}
          onCancel={() => setOp(null)}
          onConfirm={async () => {
            const r = await run('startOperation', op.all ? { all: true, bribe } : { reportId: op.r.id, bribe }, { success: (res) => `🎯 ${res?.started?.length || 0} operasyon başladı` });
            if (r) setOp(null);
          }}
        >
          <AmountInput value={bribe} onChange={setBribe} placeholder="Rüşvet tutarı (0 = yok)" />
        </Confirm>
      )}
      {ask && (
        <Confirm
          icon={ask.type === 'report' ? '📡' : '📦'}
          title={ask.type === 'report' ? `TIR #${ask.t.code} ihbar edilsin mi?` : `TIR #${ask.r.truckCode} içeriği sızdırılsın mı?`}
          lines={ask.type === 'report' ? ['Tır İstihbaratın operasyon listesine düşer.', '+1.000.000 İstihbarat prestiji.'] : ['İstihbarat yükün ödül değerini görür.', '+1.000.000 İstihbarat prestiji.']}
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
