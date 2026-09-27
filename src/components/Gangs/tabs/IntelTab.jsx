// İSTİHBARAT — kod adları + "?" avatarlarla rütbe ağacı (Başkan · 2 Şef ·
// 4 Uzman · Ajanlar/Muhbirler), kod adı ✏️, not, altın dağıt (Başkan/Şef),
// atma (anında) / çıkarma oylaması, ayrılma. İstihbarata bağış yoktur,
// maaş yoktur; Başkan kasadan kendine para alamaz.
import { useState } from 'react';
import { istDateKey, istHour, useGangAction, useNow } from '../GangContext';
import { AmountInput, Btn, Card, Chips, Confirm, RankBadge, Sheet } from '../ui';
import { KasaLine, MemberCard, MidnightLegend, RankTree } from '../shared';
import { DIST_GROUPS, GANG_RULES, INTEL_LEADERS, RANK_ICONS, fmt } from '../gangConstants';

const DIRECT = { baskan: ['ajan', 'muhbir'], sef: ['muhbir'] };
// v61 — istismar önlemi (sunucuyla aynı: functions/gang/config.js INTEL)
const KICK_MIN_MEMBERS = 8;
const DIST_MIN_GROUP_MEMBERS = 5;
const GROUP_OF = { baskan: 'rutbeli', sef: 'rutbeli', uzman: 'rutbeli', ajan: 'tetikci', muhbir: 'comez' };
const GROUP_NOUN = { rutbeli: 'rütbeli', tetikci: 'ajan', comez: 'muhbir', hepsi: 'üye' };
function voteAllowed(my, t) {
  if (my === 'baskan' || my === 'sef') return !(DIRECT[my] || []).includes(t);
  if (my === 'uzman') return t !== 'baskan';
  return false;
}

function MemberSheet({ member, myRank, rosterSize, onClose }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const now = useNow(30_000);
  const canKick = (DIRECT[myRank] || []).includes(member.rank);
  const canVote = voteAllowed(myRank, member.rank);
  const voteOpen = istHour(now) < 12;
  const tooFew = rosterSize < KICK_MIN_MEMBERS;
  const isNew = Number(member.joinedAtMs || 0) > 0 && istDateKey(member.joinedAtMs) === istDateKey(now);
  const lockReason = tooFew ? `🔒 ${KICK_MIN_MEMBERS - 1} ya da daha az üye varken kimse çıkarılamaz` : isNew ? "🔒 Yeni üye 00:00'a kadar çıkarılamaz" : null;
  return (
    <Sheet title={member.codeName} icon={RANK_ICONS[member.rank]} onClose={onClose}>
      <div className="gx-member-detail">
        <RankBadge rank={member.rank} />
        <span className="gx-prestige">✦ {fmt(member.prestige)}</span>
      </div>
      <div className="gx-stack">
        {canKick && (
          <Btn block kind="danger" disabled={Boolean(lockReason)} onClick={() => setAsk('kick')}>
            🚫 İstihbarattan at
          </Btn>
        )}
        {canVote && (
          <Btn block kind="ghost" disabled={!voteOpen || Boolean(lockReason)} onClick={() => setAsk('vote')}>
            {voteOpen ? '🗳️ Çıkarma oylaması başlat' : '🔒 🗳️ 00:00–12:00'}
          </Btn>
        )}
        {(canKick || canVote) && lockReason && <div className="dim gx-mini">{lockReason}</div>}
      </div>
      {ask && (
        <Confirm
          icon={ask === 'kick' ? '🚫' : '🗳️'}
          danger={ask === 'kick'}
          title={ask === 'kick' ? `${member.codeName} atılsın mı?` : `${member.codeName} için çıkarma oylaması`}
          lines={
            ask === 'kick'
              ? []
              : [member.rank === 'baskan' ? '✅ %66+ evet → İstihbarattan çıkar' : '✅ %51 evet → İstihbarattan çıkar', '❌ geçmezse kimse atılmaz']
          }
          confirmLabel={ask === 'kick' ? 'At' : 'Başlat'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = ask === 'kick' ? await run('kickIntelMember', { targetRosterId: member.id }, { success: '🚫 Atıldı' }) : await run('requestIntelKickVote', { targetRosterId: member.id }, { success: '🗳️ Oylama başladı' });
            setAsk(null);
            if (r) onClose();
          }}
        />
      )}
    </Sheet>
  );
}

export default function IntelTab({ d }) {
  const { run, busy } = useGangAction();
  const [sel, setSel] = useState(null);
  const [code, setCode] = useState(null);
  const [note, setNote] = useState(null);
  const [dist, setDist] = useState(false);
  const [amount, setAmount] = useState(0);
  const [group, setGroup] = useState('hepsi');
  const [slots, setSlots] = useState(GANG_RULES.DIST_MIN_SLOTS);
  const [leave, setLeave] = useState(false);
  const lead = INTEL_LEADERS.includes(d.rank);
  const byRank = (r) => d.roster.filter((m) => m.rank === r).sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
  const free = d.stateToday ? Number(d.state?.distributableLeft || 0) : 0;
  const n = group === 'rutbeli' ? GANG_RULES.DIST_RANKED_SLOTS : slots;
  // v61: her grup için en az 5 üye şartı (Tüm üyeler = İstihbaratın tamamı)
  const groupCount = (g) => (g === 'hepsi' ? d.roster.length : d.roster.filter((m) => GROUP_OF[m.rank] === g).length);
  const groupOk = groupCount(group) >= DIST_MIN_GROUP_MEMBERS;
  const card = (m) => <MemberCard key={m.id} secret name={m.codeName} rank={m.rank} prestige={m.prestige} me={m.id === d.rid} big={m.rank === 'baskan'} onClick={() => m.id !== d.rid && setSel(m)} />;

  return (
    <div className="gx-stack">
      <Card>
        <div className="gx-note-row">
          <span className="gx-note-quote">“{d.intel?.note || '…'}”</span>
          {lead && (
            <button className="gx-link" onClick={() => setNote(d.intel?.note || '')}>
              ✏️
            </button>
          )}
        </div>
        <KasaLine state={d.state} isToday={d.stateToday} />
        <div className="gx-codename-row">
          🕶️ Kod adın: <b>{d.me?.codeName}</b>
          <button className="gx-link" onClick={() => setCode(d.me?.codeName || '')} aria-label="Kod adını değiştir">
            ✏️
          </button>
        </div>
        {lead && (
          <Btn small onClick={() => { setDist(true); setAmount(0); }}>
            💰 Altın dağıt +
          </Btn>
        )}
      </Card>

      <div className="gx-section-head">
        <span>🕵️ Teşkilat ({d.roster.length})</span>
        <MidnightLegend />
      </div>
      <RankTree rows={[byRank('baskan'), byRank('sef'), byRank('uzman')]} rows2={[{ title: 'Ajanlar', items: byRank('ajan') }, { title: 'Muhbirler', items: byRank('muhbir') }]} renderCard={card} />

      <Btn block kind="danger" onClick={() => setLeave(true)}>
        🚪 İstihbarattan ayrıl
      </Btn>

      {sel && <MemberSheet member={sel} myRank={d.rank} rosterSize={d.roster.length} onClose={() => setSel(null)} />}
      {code != null && (
        <Sheet title="Kod adını değiştir" icon="✏️" onClose={() => setCode(null)}>
          <input className="gx-input" maxLength={GANG_RULES.CODENAME_MAX} value={code} onChange={(e) => setCode(e.target.value)} />
          <div className="gx-hide-warn">🤫 İyi gizlendiğinden emin ol</div>
          <Btn
            block
            busy={busy === 'changeCodeName'}
            disabled={code.trim().length < GANG_RULES.CODENAME_MIN}
            onClick={async () => {
              const r = await run('changeCodeName', { codeName: code }, { success: '🕶️ Kod adın güncellendi' });
              if (r) setCode(null);
            }}
          >
            Kaydet
          </Btn>
        </Sheet>
      )}
      {note != null && (
        <Sheet title="İstihbarat notu" icon="✏️" onClose={() => setNote(null)}>
          <textarea className="gx-input" rows={3} maxLength={GANG_RULES.NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn
            block
            busy={busy === 'updateIntelNote'}
            onClick={async () => {
              const r = await run('updateIntelNote', { note }, { success: '✏️ Güncellendi' });
              if (r) setNote(null);
            }}
          >
            Kaydet
          </Btn>
        </Sheet>
      )}
      {dist && (
        <Sheet title="Altın dağıt" icon="💰" onClose={() => setDist(false)}>
          <div className="gx-free-line">🔓 <b>{fmt(free)}</b></div>
          <Chips options={DIST_GROUPS.map((g) => ({ id: g.id, label: `${g.intelLabel} (${groupCount(g.id)})`, icon: g.icon, disabled: groupCount(g.id) < DIST_MIN_GROUP_MEMBERS }))} value={group} onChange={setGroup} />
          {!groupOk && (
            <div className="dim gx-mini">
              🔒 Dağıtım için bu grupta en az {DIST_MIN_GROUP_MEMBERS} {GROUP_NOUN[group]} olmalı (şu an {groupCount(group)}).
            </div>
          )}
          {group === 'rutbeli' ? (
            <div className="gx-free-line">👥 {GANG_RULES.DIST_RANKED_SLOTS}</div>
          ) : (
            <label className="gx-field">
              👥 Kişi sayısı
              <AmountInput value={slots} onChange={setSlots} quick={[1, 5, 10, 50]} min={GANG_RULES.DIST_MIN_SLOTS} />
            </label>
          )}
          <span className="dim gx-mini">💰 Kişi başı</span>
          <AmountInput value={amount} onChange={setAmount} max={Math.floor(free / Math.max(1, n))} />
          <div className="gx-free-line">= <b>{fmt(amount * n)}</b></div>
          <Btn
            block
            busy={busy === 'createDistribution'}
            disabled={!amount || n < GANG_RULES.DIST_MIN_SLOTS || !groupOk}
            onClick={async () => {
              const r = await run('createDistribution', { org: 'intel', group, perPerson: amount, slots: n }, { success: '💰 Dağıtım açıldı', withRequestId: true });
              if (r) setDist(false);
            }}
          >
            Dağıt
          </Btn>
        </Sheet>
      )}
      {leave && (
        <Confirm
          icon="🚪"
          danger
          title="İstihbarattan ayrılmak istediğine emin misin?"
          lines={['Prestijin kalıcı silinir.']}
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
