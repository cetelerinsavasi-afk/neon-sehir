// KASA (Çete + İstihbarat): tek kavram "Kasa". Teknik limitler (00:00
// kasasının %20'si dağıtılabilir) oyuncuya sadece "bugün en fazla" olarak
// görünür. Dağıtım 24 saatlik havuzdur: üye gelip teslim alır, alınmayan
// para 24 saat sonra kasaya döner.
import { useMemo, useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { fmtCountdown, istDateKey, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Bar, Btn, Card, Chips, Confirm, Empty, Gold, Info } from '../ui';
import { DIST_GROUPS, GANG_RULES, fmt } from '../gangConstants';

const GROUP_MATCH = {
  rutbeli: (r) => ['baba', 'sagkol', 'kidemli', 'baskan', 'sef', 'uzman'].includes(r),
  tetikci: (r) => r === 'tetikci' || r === 'ajan',
  comez: (r) => r === 'comez' || r === 'caylak',
  hepsi: () => true,
};

function DistributeCard({ org, members, myKey, allowance, kasa }) {
  const { run, busy } = useGangAction();
  const [group, setGroup] = useState('rutbeli');
  const [amount, setAmount] = useState(0);
  const [ask, setAsk] = useState(false);
  const isIntel = org === 'intel';
  const pool = members.filter((m) => GROUP_MATCH[group](m.rank) && !(isIntel && m.id === myKey));
  const per = pool.length ? Math.floor(amount / pool.length) : 0;
  const max = Math.min(allowance, kasa);
  return (
    <Card>
      <div className="gx-section-head">
        <span>💸 Dağıt</span>
        <Info text="Bugün en fazla 00:00'daki kasanın %20'si dağıtılabilir. Para önce havuza alınır; üyeler 24 saat içinde teslim alır, alınmayan kısım kasaya döner. Tek bir kişiye özel dağıtım yoktur — gruba eşit bölünür." />
      </div>
      <Chips
        options={DIST_GROUPS.map((g) => ({ id: g.id, label: isIntel ? g.intelLabel : g.label, icon: g.icon, count: members.filter((m) => GROUP_MATCH[g.id](m.rank) && !(isIntel && m.id === myKey)).length }))}
        value={group}
        onChange={setGroup}
      />
      <AmountInput value={amount} onChange={setAmount} max={max} />
      <div className="gx-dist-preview">
        👥 {pool.length} kişi × <b>{fmt(per)}</b> = {fmt(per * pool.length)}
      </div>
      <Bar value={amount} max={Math.max(1, max)} label={`Bugün en fazla: ${fmt(max)}`} color="var(--neon-yellow)" height={5} />
      <Btn block disabled={!per} onClick={() => setAsk(true)}>
        Havuz oluştur
      </Btn>
      {ask && (
        <Confirm
          icon="💰"
          title="Dağıtım havuzu oluşturulsun mu?"
          lines={[`${pool.length} kişiye ${fmt(per)} altın (toplam ${fmt(per * pool.length)}).`, '⏱ 24 saat içinde teslim alınmayan pay kasaya döner.', ...(isIntel ? ['Kendine pay ayıramazsın.'] : [])]}
          confirmLabel="Oluştur"
          busy={busy === 'createDistribution'}
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            const r = await run('createDistribution', { org, group, amount }, { success: (x) => `💰 ${x.recipientCount} kişiye ${fmt(x.perPerson)} havuzu açıldı`, withRequestId: true });
            if (r) setAmount(0);
            setAsk(false);
          }}
        />
      )}
    </Card>
  );
}

function DonateCard() {
  const { run, busy } = useGangAction();
  const [amount, setAmount] = useState(0);
  return (
    <Card>
      <div className="gx-section-head">
        <span>🤲 Bağış yap</span>
        <Info text="Kasaya yaptığın her 1 altın bağış sana 1 çete prestiji kazandırır." />
      </div>
      <AmountInput value={amount} onChange={setAmount} quick={[1000, 10_000, 100_000, 1_000_000]} />
      <Btn
        block
        disabled={amount < 100}
        busy={busy === 'donate'}
        onClick={async () => {
          const r = await run('donate', { amount }, { success: (x) => `🤲 Bağış yapıldı · +${fmt(x.prestige)} prestij`, withRequestId: true });
          if (r) setAmount(0);
        }}
      >
        Bağışla {amount >= 100 ? `· +${fmt(amount)} ✦` : ''}
      </Btn>
    </Card>
  );
}

export default function TreasuryTab({ org = 'gang', gang, rank, state, membership, rosterRank }) {
  const { path, actorId } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow();
  const isIntel = org === 'intel';
  const lead = isIntel ? ['baskan', 'sef'].includes(rosterRank) : ['baba', 'sagkol'].includes(rank);
  const myKey = isIntel ? membership.intelRosterId : actorId;
  const { docs: dists } = useQueryData(
    path('distributions'),
    () => (isIntel ? [where('orgType', '==', 'intel'), where('status', '==', 'open'), limit(30)] : [where('orgType', '==', 'gang'), where('orgId', '==', gang.id), where('status', '==', 'open'), limit(30)]),
    isIntel ? 'intel' : gang.id
  );
  const { docs: members } = useQueryData(lead ? (isIntel ? path('intelRoster') : path(`gangs/${gang.id}/members`)) : null, () => [limit(300)], `${org}_${lead}`);
  const allowance = state?.midnightDateKey === istDateKey(now) ? Number(state?.distributableLeft || 0) : 0;
  const sorted = useMemo(() => [...dists].sort((a, b) => a.expiresAtMs - b.expiresAtMs), [dists]);
  const myStint = isIntel ? membership.intelRosterId : membership.gangStint;
  return (
    <div className="gx-stack">
      <Card className="gx-kasa-card">
        <span className="dim">{isIntel ? '🕵️ İstihbarat Kasası' : '💰 Çete Kasası'}</span>
        <Gold value={state?.kasa} big />
      </Card>
      {sorted.map((d) => {
        const rec = d.recipients?.[myKey];
        const mine = rec && (isIntel || rec.stint === myStint);
        const left = d.expiresAtMs - now;
        return (
          <Card key={d.id} className={`gx-dist${mine && !rec.claimed ? ' claimable' : ''}`}>
            <div className="gx-war-top">
              <span className="gx-war-type">💰 {d.groupLabel}</span>
              <span className="gx-timer">⏱ {fmtCountdown(left)}</span>
            </div>
            <div className="gx-dist-line">
              <span>
                Kişi başı <b>{fmt(d.perPerson)}</b>
              </span>
              <span className="dim">
                {d.claimedCount}/{d.recipientCount} aldı
              </span>
            </div>
            <Bar value={d.claimedCount} max={d.recipientCount} height={5} />
            {mine &&
              (rec.claimed ? (
                <div className="gx-pill">✓ Payını aldın</div>
              ) : (
                <Btn block busy={busy === `cl_${d.id}`} disabled={left <= 0} onClick={() => run('claimDistribution', { distributionId: d.id }, { key: `cl_${d.id}`, success: `💰 +${fmt(d.perPerson)} altın hesabına geçti` })}>
                  💰 {fmt(d.perPerson)} teslim al
                </Btn>
              ))}
          </Card>
        );
      })}
      {sorted.length === 0 && !lead && <Empty icon="💰" text="Şu an açık dağıtım yok." />}
      {!isIntel && <DonateCard />}
      {lead && <DistributeCard org={org} members={members} myKey={isIntel ? membership.intelRosterId : actorId} allowance={allowance} kasa={Number(state?.kasa || 0)} />}
      <p className="dim gx-mini">⏱ Dağıtımlar {GANG_RULES.DISTRIBUTION_HOURS} saat geçerlidir.</p>
    </div>
  );
}
