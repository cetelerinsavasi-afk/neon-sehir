// Üyeler: rütbe sırası, prestij, saygı, atma, çıkarma oylaması; Sağ Kol için
// devirme / ayaklanma (00:00'a kadar gizli, iptal edilebilir).
import { useMemo, useState } from 'react';
import { limit } from 'firebase/firestore';
import { useGang, useGangAction, useQueryData } from '../GangContext';
import { Bar, Btn, Card, Confirm, Info, RankBadge, Sheet } from '../ui';
import { GANG_RANK_ORDER, GANG_RULES, RANK_ICONS, fmt } from '../gangConstants';

const TYPE_LABEL = { devirme: 'Devirme', ayaklanma: 'Ayaklanma', kick: 'Çıkarma oylaması' };

function MemberActions({ member, myRank, gang, onClose }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const t = member.rank;
  const canRespect = myRank === 'baba' && !member.respected;
  const canKick = (myRank === 'baba' && (t === 'tetikci' || t === 'comez')) || (myRank === 'sagkol' && t === 'comez');
  const canKickVote = (myRank === 'baba' && (t === 'sagkol' || t === 'kidemli')) || (myRank === 'sagkol' && t === 'kidemli');
  const confirms = {
    respect: {
      icon: '🎩',
      title: `${member.name} için saygı göster`,
      lines: [`✦ +${fmt(GANG_RULES.RESPECT_PRESTIGE)} prestij kazanır.`, 'Bu üyeliği boyunca sadece BİR kez verilebilir.'],
      label: 'Saygı göster',
      action: () => run('giveRespect', { targetId: member.id }, { success: '🎩 Saygı gösterildi' }),
    },
    kick: {
      icon: '🚫',
      title: `${member.name} çeteden atılsın mı?`,
      lines: ['Çete prestiji kalıcı olarak silinir.', 'Tekrar katılırsa Çömez olarak 0\'dan başlar.'],
      label: 'At',
      danger: true,
      action: () => run('kickMember', { targetId: member.id }, { success: '🚫 Üye atıldı' }),
    },
    kickVote: {
      icon: '🗳️',
      title: `${member.name} için çıkarma oylaması`,
      lines: ['Talep 00:00\'a kadar gizli kalır, istersen iptal edersin.', '00:00\'da oylama başlar, 24 saat sürer.', 'Oy hakkı: 00:00\'daki 7 rütbeli. Çoğunluk (%50+) → üye çıkarılır.'],
      label: 'Talep et',
      action: () => run('requestVote', { type: 'kick', targetId: member.id }, { success: '🗳️ Talep alındı — 00:00\'da başlar' }),
    },
  };
  const c = ask ? confirms[ask] : null;
  return (
    <Sheet title={member.name} icon={RANK_ICONS[member.rank]} onClose={onClose}>
      <div className="gx-member-detail">
        <RankBadge rank={member.rank} />
        <span className="gx-prestige">✦ {fmt(member.prestige)}</span>
        {member.respected && <span className="gx-pill">🎩 Saygı gördü</span>}
        {member.inactiveWarn && <span className="gx-pill warn">💤 Pasif</span>}
      </div>
      <div className="gx-stack">
        {canRespect && (
          <Btn block onClick={() => setAsk('respect')}>
            🎩 Saygı göster (+{fmt(GANG_RULES.RESPECT_PRESTIGE)})
          </Btn>
        )}
        {canKickVote && (
          <Btn block kind="ghost" onClick={() => setAsk('kickVote')}>
            🗳️ Çıkarma oylaması başlat
          </Btn>
        )}
        {canKick && (
          <Btn block kind="danger" onClick={() => setAsk('kick')}>
            🚫 Çeteden at
          </Btn>
        )}
        {!canRespect && !canKick && !canKickVote && <p className="dim">Bu üye için yapabileceğin bir işlem yok.</p>}
      </div>
      {c && (
        <Confirm
          icon={c.icon}
          title={c.title}
          lines={c.lines}
          danger={c.danger}
          confirmLabel={c.label}
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            const r = await c.action();
            setAsk(null);
            if (r) onClose();
          }}
        />
      )}
      <p className="dim gx-mini">{gang.name}</p>
    </Sheet>
  );
}

function LeadershipCard({ me, baba, pending }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const canDevirme = me.prestige > (baba?.prestige || 0);
  const mine = pending.filter((p) => p.type !== 'kick');
  return (
    <Card className="gx-leader-card">
      <div className="gx-section-head">
        <span>🗡️ Liderlik</span>
        <Info text="Devirme: prestijin Babayı geçince açılır, %51 destek yeter. Ayaklanma: her zaman açılabilir, %66'dan fazla destek gerekir. İkisi de 00:00'a kadar gizlidir; başarısız olursan çeteden atılırsın." />
      </div>
      {mine.length > 0 ? (
        mine.map((p) => (
          <div key={p.id} className="gx-pending">
            <span>
              🤫 {TYPE_LABEL[p.type]} talebin gizli — <b>00:00</b>'da oylama başlar
            </span>
            <Btn small kind="ghost" busy={busy === `c_${p.id}`} onClick={() => run('cancelVoteRequest', { pendingId: p.id }, { key: `c_${p.id}`, success: 'İptal edildi' })}>
              İptal
            </Btn>
          </div>
        ))
      ) : (
        <div className="gx-row-2">
          <Btn kind={canDevirme ? 'primary' : 'ghost'} disabled={!canDevirme} onClick={() => setAsk('devirme')} title={canDevirme ? '' : 'Prestijin Babayı geçmeli'}>
            🗡️ Devir {canDevirme ? '' : '🔒'}
          </Btn>
          <Btn kind="danger" onClick={() => setAsk('ayaklanma')}>
            🔥 Ayaklan
          </Btn>
        </div>
      )}
      {!canDevirme && mine.length === 0 && (
        <Bar value={me.prestige} max={baba?.prestige || 1} label={`Devirme için prestij: ${fmt(me.prestige)} / ${fmt(baba?.prestige)}`} color="var(--neon-pink)" />
      )}
      {ask && (
        <Confirm
          icon={ask === 'devirme' ? '🗡️' : '🔥'}
          danger
          title={ask === 'devirme' ? 'Mafya Babasını devir' : 'Ayaklanma başlat'}
          lines={
            ask === 'devirme'
              ? ['🤫 00:00\'a kadar gizli, istersen iptal edebilirsin.', '🗳️ 00:00\'da 7 rütbeli oylar (24 saat).', '✅ %51 veya fazlası → Mafya Babası SEN olursun, eski Baba çeteden çıkar.', '❌ Yeterli destek yoksa ÇETEDEN ATILIRSIN.']
              : ['🤫 00:00\'a kadar gizli, istersen iptal edebilirsin.', '🗳️ 00:00\'da 7 rütbeli oylar (24 saat).', '✅ %66\'dan FAZLA destek → Baba görevden alınır, Mafya Babası SEN olursun.', '❌ Yeterli destek yoksa ÇETEDEN ATILIRSIN.']
          }
          confirmLabel={ask === 'devirme' ? 'Devir' : 'Ayaklan'}
          busy={busy === 'requestVote'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('requestVote', { type: ask }, { success: '🤫 Talep gizlice alındı — 00:00\'da başlar' });
            setAsk(null);
          }}
        />
      )}
    </Card>
  );
}

export default function MembersTab({ gang, me, rank, pendingVotes }) {
  const { path, actorId } = useGang();
  const { docs: members } = useQueryData(path(`gangs/${gang.id}/members`), () => [limit(300)], gang.id);
  const [sel, setSel] = useState(null);
  const sorted = useMemo(
    () => [...members].sort((a, b) => GANG_RANK_ORDER.indexOf(a.rank) - GANG_RANK_ORDER.indexOf(b.rank) || (b.prestige || 0) - (a.prestige || 0)),
    [members]
  );
  const baba = members.find((m) => m.rank === 'baba');
  const counts = GANG_RANK_ORDER.map((r) => ({ r, n: members.filter((m) => m.rank === r).length }));
  return (
    <div className="gx-stack">
      <div className="gx-rank-summary">
        {counts.map(({ r, n }) => (
          <span key={r} className={`gx-rank-count gx-rank-${r}`}>
            {RANK_ICONS[r]} {n}
            {r === 'sagkol' ? '/2' : r === 'kidemli' ? '/4' : ''}
          </span>
        ))}
        <Info text="Rütbeler her gece 00:00'da prestije göre yeniden hesaplanır: en yüksek 2 üye Sağ Kol, sonraki 4 Kıdemli, kalan 1.000.000+ prestijliler Tetikçi, altındakiler Çömez. Mafya Babası sabittir." />
      </div>
      {me && rank === 'comez' && (
        <Bar value={me.prestige || 0} max={GANG_RULES.RANK_THRESHOLD} label={`Tetikçiliğe: ${fmt(me.prestige)} / ${fmt(GANG_RULES.RANK_THRESHOLD)} ✦`} color="var(--neon-yellow)" />
      )}
      {me && rank === 'sagkol' && <LeadershipCard me={me} baba={baba} pending={pendingVotes} />}
      <div className="gx-members">
        {sorted.map((m) => (
          <button key={m.id} className={`gx-member${m.id === actorId ? ' me' : ''}`} onClick={() => m.id !== actorId && setSel(m)}>
            <span className="gx-member-icon">{RANK_ICONS[m.rank]}</span>
            <span className="gx-member-name">
              {m.name}
              {m.id === actorId && <span className="dim"> (sen)</span>}
              {m.respected && <span title="Saygı gördü"> 🎩</span>}
              {m.inactiveWarn && <span title="Pasif"> 💤</span>}
            </span>
            <span className="gx-member-prestige">✦ {fmt(m.prestige)}</span>
          </button>
        ))}
      </div>
      {sel && <MemberActions member={sel} myRank={rank} gang={gang} onClose={() => setSel(null)} />}
    </div>
  );
}
