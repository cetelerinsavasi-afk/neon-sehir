// İSTİHBARAT — kod adları + "?" avatarlarla rütbe ağacı (Başkan · 2 Şef ·
// 4 Uzman · Ajanlar/Muhbirler), kod adı ✏️, not, altın dağıt (Başkan/Şef),
// atma (anında) / çıkarma oylaması, ayrılma. İstihbarata bağış yoktur,
// maaş yoktur; Başkan kasadan kendine para alamaz.
import { useState } from 'react';
import { useGangAction } from '../GangContext';
import { AmountInput, Btn, Card, Chips, Confirm, Info, RankBadge, Sheet } from '../ui';
import { KasaLine, MemberCard, RankTree } from '../shared';
import { DIST_GROUPS, GANG_RULES, INTEL_LEADERS, RANK_ICONS, fmt } from '../gangConstants';

const DIRECT = { baskan: ['ajan', 'muhbir'], sef: ['muhbir'] };
function voteAllowed(my, t) {
  if (my === 'baskan' || my === 'sef') return !(DIRECT[my] || []).includes(t);
  if (my === 'uzman') return t !== 'baskan';
  return false;
}

function MemberSheet({ member, myRank, onClose }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const canKick = (DIRECT[myRank] || []).includes(member.rank);
  const canVote = voteAllowed(myRank, member.rank);
  return (
    <Sheet title={member.codeName} icon={RANK_ICONS[member.rank]} onClose={onClose}>
      <div className="gx-member-detail">
        <RankBadge rank={member.rank} />
        <span className="gx-prestige">✦ {fmt(member.prestige)}</span>
      </div>
      <div className="gx-stack">
        {canKick && (
          <Btn block kind="danger" onClick={() => setAsk('kick')}>
            🚫 İstihbarattan at
          </Btn>
        )}
        {canVote && (
          <Btn block kind="ghost" onClick={() => setAsk('vote')}>
            🗳️ Çıkarma oylaması başlat
          </Btn>
        )}
        {!canKick && !canVote && <p className="dim">Bu üye için yapabileceğin bir işlem yok.</p>}
      </div>
      {ask && (
        <Confirm
          icon={ask === 'kick' ? '🚫' : '🗳️'}
          danger={ask === 'kick'}
          title={ask === 'kick' ? `${member.codeName} atılsın mı?` : `${member.codeName} için çıkarma oylaması`}
          lines={
            ask === 'kick'
              ? ['İstihbarat prestiji silinir. Yeri 00:00\'da dolar.']
              : ["Talep 00:00'a kadar gizli, iptal edilebilir.", "00:00'da Başkan, Şef ve Uzmanlar 24 saat oylar.", member.rank === 'baskan' ? "Başkan için %66'dan fazla evet gerekir." : '%51 evet gerekir.', 'Başarısız oylamada hiçbir şey değişmez.']
          }
          confirmLabel={ask === 'kick' ? 'At' : 'Talep et'}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = ask === 'kick' ? await run('kickIntelMember', { targetRosterId: member.id }, { success: '🚫 Atıldı' }) : await run('requestIntelKickVote', { targetRosterId: member.id }, { success: "🗳️ Talep alındı — 00:00'da başlar" });
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
        <Info text="Rütbeler her gece 00:00'da prestije göre: en yüksek Başkan, sonraki 2 Şef, sonraki 4 Uzman, kalan 1.000.000+ Ajan, altı Muhbir. Prestij: ihbar 1M, içerik sızdırma 1M, çete teslimi 10M, savaş gücü 1:1, suçlu yakalama ödülü 1:1. Başkan Ajan/Muhbiri, Şef Muhbiri anında atar; diğerleri için oylama." />
      </div>
      <RankTree rows={[byRank('baskan'), byRank('sef'), byRank('uzman')]} grid={[...byRank('ajan'), ...byRank('muhbir')]} gridTitle="Ajanlar · Muhbirler" renderCard={card} />

      <Btn block kind="danger" onClick={() => setLeave(true)}>
        🚪 İstihbarattan ayrıl
      </Btn>

      {sel && <MemberSheet member={sel} myRank={d.rank} onClose={() => setSel(null)} />}
      {code != null && (
        <Sheet title="Kod adını değiştir" icon="✏️" onClose={() => setCode(null)}>
          <input className="gx-input" maxLength={GANG_RULES.CODENAME_MAX} value={code} onChange={(e) => setCode(e.target.value)} />
          <p className="gx-hint-box">🤫 Kendini iyi gizle. Kod adı benzersiz olmalı; eski mesajlarda eski ad kalır.</p>
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
          <p className="dim gx-mini">
            🔓 Bugün serbest para: <b>{fmt(free)}</b> (00:00 kasasının %20'si). Başkan dağıtımlardan pay alamaz; dağıtımı yapan kendi dağıtımından alamaz.
          </p>
          <Chips options={DIST_GROUPS.map((g) => ({ id: g.id, label: g.intelLabel, icon: g.icon }))} value={group} onChange={setGroup} />
          {group === 'rutbeli' ? (
            <p className="dim gx-mini">Rütbeliler: sabit {GANG_RULES.DIST_RANKED_SLOTS} kişi.</p>
          ) : (
            <label className="gx-field">
              En fazla kaç kişi alabilir? <span className="dim">(en az {GANG_RULES.DIST_MIN_SLOTS})</span>
              <AmountInput value={slots} onChange={(v) => setSlots(Math.max(0, v))} />
            </label>
          )}
          <span className="dim gx-mini">Kişi başı tutar</span>
          <AmountInput value={amount} onChange={setAmount} max={Math.floor(free / Math.max(1, n))} />
          <p className="dim gx-mini">
            Havuz: {fmt(amount)} × {n} = <b>{fmt(amount * n)}</b>
          </p>
          <Btn
            block
            busy={busy === 'createDistribution'}
            disabled={!amount || n < GANG_RULES.DIST_MIN_SLOTS}
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
          lines={['İstihbarat prestijin kalıcı olarak silinir.', 'Kod adın serbest kalır. Kimseye bildirim gitmez.']}
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
