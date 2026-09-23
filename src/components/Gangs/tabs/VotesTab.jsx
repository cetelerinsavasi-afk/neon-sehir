// OYLAMALAR — toplamlar canlı, kimin ne oy verdiği gizli. Oy hakkı oylama
// başladığı andaki (00:00) 7 rütbeliye aittir. Tetikçi görür, oy veremez.
import { useState } from 'react';
import { fmtCountdown, useDocData, useGang, useGangAction, useNow } from '../GangContext';
import { Bar, Btn, Card, Confirm, Empty, Info } from '../ui';

const RULE = {
  devirme: { icon: '🗡️', label: 'Devirme', need: '%51 evet', yes: 'Aday Baba olur, eski Baba çeteden çıkar', no: 'Aday çeteden atılır' },
  ayaklanma: { icon: '🔥', label: 'Ayaklanma', need: '%66\'dan fazla evet', yes: 'Baba görevden alınır, aday Baba olur', no: 'Aday çeteden atılır' },
  kick: { icon: '🚫', label: 'Çıkarma', need: '%50\'den fazla evet', yes: 'Üye çeteden çıkarılır', no: 'Üye kalır' },
};

function VoteCard({ vote, gangId }) {
  const { path, actorId } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow();
  const { data: ballot } = useDocData(path(`gangs/${gangId}/votes/${vote.id}/ballots/${actorId}`));
  const [ask, setAsk] = useState(null);
  const r = RULE[vote.type];
  const total = (vote.yes || 0) + (vote.no || 0);
  const canVote = (vote.voterIds || []).includes(actorId);
  return (
    <Card className="gx-vote">
      <div className="gx-war-top">
        <span className="gx-war-type">
          {r.icon} {r.label.toLocaleUpperCase('tr-TR')}
        </span>
        <span className="gx-timer">⏱ {fmtCountdown(vote.endsAtMs - now)}</span>
      </div>
      <div className="gx-vote-who">
        {vote.type === 'kick' ? (
          <>
            Hedef: <b>{vote.targetName}</b>
          </>
        ) : (
          <>
            <b>{vote.initiatorName}</b> ⟶ 👑 <b>{vote.targetName}</b>
          </>
        )}
      </div>
      <div className="gx-vote-bars">
        <Bar value={vote.yes || 0} max={Math.max(1, total)} label={`✅ Evet ${vote.yes || 0}`} color="#7cff6b" />
        <Bar value={vote.no || 0} max={Math.max(1, total)} label={`❌ Hayır ${vote.no || 0}`} color="var(--neon-pink)" />
      </div>
      <div className="dim gx-mini">
        🗳️ {vote.votedCount || 0}/{(vote.voterIds || []).length} oy · Gerekli: {r.need}
      </div>
      {canVote ? (
        ballot ? (
          <div className="gx-pill">✓ Oyunu kullandın ({ballot.choice === 'yes' ? 'Evet' : 'Hayır'})</div>
        ) : (
          <div className="gx-row-2">
            <Btn kind="ghost" onClick={() => setAsk('no')}>
              ❌ Hayır
            </Btn>
            <Btn onClick={() => setAsk('yes')}>✅ Evet</Btn>
          </div>
        )
      ) : (
        <div className="dim gx-mini">👁️ İzliyorsun — bu oylamada oy hakkın yok.</div>
      )}
      {ask && (
        <Confirm
          icon={ask === 'yes' ? '✅' : '❌'}
          title={`"${ask === 'yes' ? 'Evet' : 'Hayır'}" oyu verilsin mi?`}
          lines={[`Evet kazanırsa: ${r.yes}.`, `Kazanmazsa: ${r.no}.`, 'Oy değiştirilemez; kimin ne verdiği görünmez.']}
          confirmLabel="Oy ver"
          busy={busy === 'castVote'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('castVote', { voteId: vote.id, choice: ask }, { success: '🗳️ Oyun kaydedildi' });
            setAsk(null);
          }}
        />
      )}
    </Card>
  );
}

export default function VotesTab({ gang, votes, pendingVotes }) {
  const { run, busy } = useGangAction();
  return (
    <div className="gx-stack">
      <div className="gx-section-head">
        <span>🗳️ Oylamalar</span>
        <Info text="Oylamalar 00:00'da başlar ve 24 saat sürer. Oy hakkı başladığı andaki 7 rütbelinindir (Baba, 2 Sağ Kol, 4 Kıdemli). Toplamlar canlı görünür, kimin ne oy verdiği görünmez." />
      </div>
      {pendingVotes.map((p) => (
        <Card key={p.id} className="gx-pending">
          <span>
            🤫 {RULE[p.type].label} talebin gizli · 00:00'da başlar{p.type === 'kick' ? ` (${p.targetName})` : ''}
          </span>
          <Btn small kind="ghost" busy={busy === `c_${p.id}`} onClick={() => run('cancelVoteRequest', { pendingId: p.id }, { key: `c_${p.id}`, success: 'İptal edildi' })}>
            İptal
          </Btn>
        </Card>
      ))}
      {votes.length === 0 && pendingVotes.length === 0 && <Empty icon="🗳️" text="Aktif oylama yok." />}
      {votes.map((v) => (
        <VoteCard key={v.id} vote={v} gangId={gang.id} />
      ))}
    </div>
  );
}
