// İSTİHBARAT paneli. Sabit ad + sabit logo; üyeler birbirini sadece KOD
// ADIYLA görür. Katılım şartı: 50+ saygınlık (polislik şartı YOK).
import { useMemo, useState } from 'react';
import { limit, orderBy, where } from 'firebase/firestore';
import { fmtDateTime, istDateKey, istHour, useDocData, useGang, useGangAction, useNow, useQueryData } from './GangContext';
import { Btn, Card, Confirm, Empty, Gold, Info, Logo, RankBadge, Sheet, Stat, Tabs } from './ui';
import { GANG_RULES, INTEL_LOGO, INTEL_RANK_ORDER, RANK_ICONS, atLeast, fmt } from './gangConstants';
import ChatTab from './tabs/ChatTab';
import WarsTab, { useWarLists } from './tabs/WarsTab';
import TreasuryTab from './tabs/TreasuryTab';
import { itemInfo } from './itemInfo';

function JoinIntel({ intel, membership }) {
  const { run, busy } = useGangAction();
  const [code, setCode] = useState('');
  const [ask, setAsk] = useState(false);
  const isBaba = membership.gangRank === 'baba';
  return (
    <div className="gx-page">
      <div className="gx-header intel">
        <Logo logo={INTEL_LOGO} size={58} />
        <div className="gx-header-main">
          <div className="gx-header-name">İstihbarat</div>
          <div className="dim">👥 {intel?.memberCount || 0} ajan</div>
        </div>
      </div>
      {intel?.note && <div className="gx-note-quote">“{intel.note}”</div>}
      <Card>
        <div className="gx-req">
          <span className="gx-req-item">⭐ En az {GANG_RULES.INTEL_MIN_REPUTATION} saygınlık</span>
          <span className="gx-req-item">👮 Polis olmak zorunlu değil</span>
          <span className="gx-req-item">🏴 Bir çetede olabilirsin</span>
        </div>
        {isBaba ? (
          <p className="dim">👑 Mafya Babası İstihbarata katılamaz.</p>
        ) : (
          <>
            <label className="gx-field">
              🎭 Kod adı
              <input className="gx-input" maxLength={GANG_RULES.CODENAME_MAX} value={code} placeholder="ör. Baykuş" onChange={(e) => setCode(e.target.value)} />
            </label>
            <p className="dim gx-mini">🤫 Kod adın kimliğinin gizli kalmasında önemli. Seni ele vermeyecek bir isim seç.</p>
            <Btn block disabled={code.trim().length < GANG_RULES.CODENAME_MIN} onClick={() => setAsk(true)}>
              🕵️ Katıl
            </Btn>
          </>
        )}
      </Card>
      {ask && (
        <Confirm
          icon="🕵️"
          title={`"${code.trim()}" kod adıyla katıl`}
          lines={['Diğer ajanlar seni sadece kod adınla görür.', 'Eski mesajları göremezsin.', 'Ayrılırsan İstihbarat prestijin silinir.']}
          confirmLabel="Katıl"
          busy={busy === 'joinIntel'}
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            await run('joinIntel', { codeName: code.trim() }, { success: '🕵️ Hoş geldin, ajan.' });
            setAsk(false);
          }}
        />
      )}
    </div>
  );
}

function Operations({ roster, state, reports, wars }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const lead = ['baskan', 'sef'].includes(roster?.rank);
  const open = istHour(now) < 12;
  const today = istDateKey(now);
  const count = state?.sabotage?.dateKey === today ? state.sabotage.count || 0 : 0;
  const price = 10_000 + 10_000 * count;
  const [ask, setAsk] = useState(null);
  const todays = reports.filter((r) => r.departDateKey === today);
  const free = todays.filter((r) => !r.opWarId);
  return (
    <div className="gx-stack">
      <div className="gx-section-head">
        <span>🎯 İhbar edilen tırlar</span>
        <Info text="Çetelere sızmış ajanlar (Tetikçi+) seferdeki tırları ihbar eder, Kıdemli+ olanlar içeriği sızdırır. Başkan ve Şefler 12:00'ye kadar operasyon başlatır (ücret = sabotaj ücreti, her yenisi +10.000, 00:00'da sıfırlanır). Başarılı operasyonda yük imha edilir, kasaya anlık satış değeri kadar ödül gelir." />
      </div>
      {lead && free.length > 1 && open && (
        <Btn block kind="danger" onClick={() => setAsk({ all: true })}>
          🎯 Tümüne operasyon ({free.length})
        </Btn>
      )}
      {todays.length === 0 && <Empty icon="📡" text="Bugün ihbar edilmiş tır yok." />}
      {todays.map((r) => {
        const war = wars.find((w) => w.id === r.opWarId);
        return (
          <Card key={r.id} className={`gx-report${r.leaked ? ' leaked' : ''}`}>
            <div className="gx-truck-head">
              <span className="gx-truck-code">🚛 TIR #{r.truckCode}</span>
              <span className="gx-report-gang">
                <Logo logo={r.gangLogo} size={18} /> {r.gangName}
              </span>
            </div>
            {r.leaked ? (
              <div className="gx-cargo">
                {Object.entries(r.cargo || {}).map(([k, q]) => (
                  <span key={k}>
                    {itemInfo(k).emoji} {fmt(q)} × {itemInfo(k).label}
                  </span>
                ))}
                <span className="gx-reward">💰 Ödül ≈ {fmt(r.estReward)}</span>
              </div>
            ) : (
              <div className="dim">❓ İçerik bilinmiyor · 📡 {r.reportedByCode}</div>
            )}
            {war ? (
              <span className="gx-pill intel">⚔️ Operasyon {war.status === 'active' ? 'aktif' : war.status === 'cancelled_bribe' ? 'rüşvetle durdu' : 'bitti'}</span>
            ) : lead && open ? (
              <Btn small kind="danger" onClick={() => setAsk({ report: r })}>
                🎯 Operasyon · {fmt(price)}
              </Btn>
            ) : !open ? (
              <span className="dim gx-mini">🔒 Operasyon saati (12:00) geçti</span>
            ) : null}
          </Card>
        );
      })}
      {ask && (
        <Confirm
          icon="🎯"
          danger
          title={ask.all ? `${free.length} tıra operasyon` : `TIR #${ask.report.truckCode} operasyonu`}
          lines={[ask.all ? `💸 ${fmt(price)}'dan başlayıp her biri +10.000` : `💸 ${fmt(price)} (İstihbarat kasasından)`, '⚔️ Saldırı 12:00–24:00 arası, iki pencere.', '🔥 Başarılıysa yük imha, kasaya anlık satış değeri.']}
          confirmLabel="Başlat"
          busy={busy === 'startOperation'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('startOperation', ask.all ? { all: true } : { reportId: ask.report.id }, { success: (x) => `🎯 ${x.started?.length || 0} operasyon başladı` });
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}

function Roster({ myRosterId }) {
  const { path } = useGang();
  const { docs } = useQueryData(path('intelRoster'), () => [limit(300)], 'roster');
  const sorted = useMemo(() => [...docs].sort((a, b) => INTEL_RANK_ORDER.indexOf(a.rank) - INTEL_RANK_ORDER.indexOf(b.rank) || (b.prestige || 0) - (a.prestige || 0)), [docs]);
  return (
    <div className="gx-stack">
      <div className="gx-section-head">
        <span>🕶️ Ajanlar ({docs.length})</span>
        <Info text="Rütbeler her gece 00:00'da prestije göre belirlenir: 1 Başkan, 2 Şef, 4 Uzman, kalan 1.000.000+ prestijliler Ajan, altındakiler Çaylak. Gerçek kimlikler gizlidir." />
      </div>
      <div className="gx-members">
        {sorted.map((m) => (
          <div key={m.id} className={`gx-member${m.id === myRosterId ? ' me' : ''}`}>
            <span className="gx-member-icon">{RANK_ICONS[m.rank]}</span>
            <span className="gx-member-name">
              {m.codeName}
              {m.id === myRosterId && <span className="dim"> (sen)</span>}
            </span>
            <span className="gx-member-prestige">✦ {fmt(m.prestige)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntelOverview({ intel, roster }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const { docs: log } = useQueryData(path('intel/main/log'), () => [orderBy('atMs', 'desc'), limit(25)], 'intellog');
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(intel?.note || '');
  const [leave, setLeave] = useState(false);
  const lead = ['baskan', 'sef'].includes(roster?.rank);
  return (
    <div className="gx-stack">
      <Card>
        <div className="gx-note-row">
          <span className="gx-note-quote">“{intel?.note || '…'}”</span>
          {lead && (
            <button className="gx-link" onClick={() => setEdit(true)}>
              ✏️
            </button>
          )}
        </div>
        <div className="gx-stats">
          <Stat icon="👥" label="Ajan">
            {intel?.memberCount || 0}
          </Stat>
        </div>
      </Card>
      <div className="gx-section-head">
        <span>📜 Son olaylar</span>
      </div>
      <div className="gx-feed">
        {log.length === 0 && <p className="dim">Henüz olay yok.</p>}
        {log.map((l) => (
          <div key={l.id} className="gx-feed-item">
            <span className="gx-feed-icon">{l.icon}</span>
            <span className="gx-feed-text">{l.text}</span>
            <span className="gx-feed-time">{fmtDateTime(l.atMs)}</span>
          </div>
        ))}
      </div>
      <div className="gx-row-end">
        <Btn small kind="danger" onClick={() => setLeave(true)}>
          🚪 İstihbarattan ayrıl
        </Btn>
      </div>
      {edit && (
        <Sheet title="İstihbarat notu" icon="✏️" onClose={() => setEdit(false)}>
          <textarea className="gx-input" rows={3} maxLength={GANG_RULES.NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn
            block
            busy={busy === 'updateIntelNote'}
            onClick={async () => {
              const r = await run('updateIntelNote', { note }, { success: '✏️ Güncellendi' });
              if (r) setEdit(false);
            }}
          >
            Kaydet
          </Btn>
        </Sheet>
      )}
      {leave && (
        <Confirm
          icon="🚪"
          danger
          title="İstihbarattan ayrıl?"
          lines={['İstihbarat prestijin KALICI olarak silinir.', 'Kod adın serbest kalır.', 'Kimseye bildirim gitmez.']}
          confirmLabel="Ayrıl"
          busy={busy === 'leaveIntel'}
          onCancel={() => setLeave(false)}
          onConfirm={async () => {
            await run('leaveIntel', {}, { success: '🚪 İstihbarattan ayrıldın.' });
            setLeave(false);
          }}
        />
      )}
    </div>
  );
}

export default function IntelPanel({ membership }) {
  const { path } = useGang();
  const rid = membership.intelRosterId;
  const { data: intel } = useDocData(path('intel/main'));
  const { data: roster } = useDocData(rid ? path(`intelRoster/${rid}`) : null);
  const { data: state } = useDocData(rid ? path('intel/main/private/state') : null);
  const now = useNow(60_000);
  const { docs: reports } = useQueryData(rid ? path('intelReports') : null, () => [where('departDateKey', '==', istDateKey(now)), limit(50)], `${rid}_${istDateKey(now)}`);
  const wars = useWarLists({ intel: Boolean(rid) });
  const [tab, setTab] = useState('genel');
  if (!rid) return <JoinIntel intel={intel} membership={membership} />;
  const rank = roster?.rank || membership.intelRank;
  const ranked = atLeast(rank, 'kidemli');
  const opsCount = reports.filter((r) => !r.opWarId).length;
  const tabs = [
    { id: 'genel', icon: '🏠', label: 'Merkez' },
    { id: 'ajanlar', icon: '🕶️', label: 'Ajanlar' },
    { id: 'sohbet', icon: '💬', label: 'Sohbet' },
    { id: 'operasyon', icon: '🎯', label: 'Operasyon', count: opsCount },
    { id: 'savas', icon: '⚔️', label: 'Savaş', count: wars.actionable.length },
    { id: 'kasa', icon: '💰', label: 'Kasa' },
  ];
  return (
    <div className="gx-page intel">
      <div className="gx-header intel">
        <Logo logo={INTEL_LOGO} size={58} />
        <div className="gx-header-main">
          <div className="gx-header-name">
            İstihbarat <span className="gx-codename">· {roster?.codeName || membership.intelCodeName}</span>
          </div>
          <div className="gx-header-row">
            <RankBadge rank={rank} />
            <span className="gx-prestige">✦ {fmt(roster?.prestige)}</span>
          </div>
        </div>
        <div className="gx-header-kasa">
          <span className="dim">Kasa</span>
          <Gold value={state?.kasa} />
        </div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="gx-tab-body">
        {tab === 'genel' && <IntelOverview intel={intel} roster={roster} />}
        {tab === 'ajanlar' && <Roster myRosterId={rid} />}
        {tab === 'sohbet' && <ChatTab org="intel" ranked={ranked} joinedAtMs={membership.intelJoinedAtMs} myRosterId={rid} />}
        {tab === 'operasyon' && <Operations roster={roster} state={state} reports={reports} wars={wars.all} />}
        {tab === 'savas' && <WarsTab org="intel" wars={wars} rosterRank={rank} />}
        {tab === 'kasa' && <TreasuryTab org="intel" state={state} membership={membership} rosterRank={rank} />}
      </div>
    </div>
  );
}
