// ÇETEM — rütbe ağacı (1 · 2 · 4 · ızgara) futbol kartı tarzı üye kartları;
// bağış, altın dağıt +, Baba'nın kendi hesabına aktarımı, başka çeteye
// gönderim, ittifaklar (not / iptal), devirme / ayaklanma, çeteden ayrıl.
import { useState } from 'react';
import { limit, orderBy } from 'firebase/firestore';
import { fmtDateTime, useGang, useGangAction, useQueryData } from '../GangContext';
import { AmountInput, Btn, Card, Chips, Confirm, Info, Logo, RankBadge, Sheet } from '../ui';
import { EditProfileSheet, KasaLine, MemberCard, RankTree } from '../shared';
import { DIST_GROUPS, GANG_RULES, LEADERS, RANK_ICONS, fmt } from '../gangConstants';

// Üyeye dokununca: saygı / at / çıkarma oylaması (yetkiye göre)
const KICK_VOTE_TARGETS = { baba: ['sagkol', 'kidemli'], sagkol: ['kidemli', 'tetikci'], kidemli: ['tetikci', 'comez'] };
function MemberSheet({ member, myRank, onClose }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const t = member.rank;
  const canRespect = myRank === 'baba' && !member.respected;
  const canKick = (myRank === 'baba' && (t === 'tetikci' || t === 'comez')) || (myRank === 'sagkol' && t === 'comez');
  const canKickVote = (KICK_VOTE_TARGETS[myRank] || []).includes(t);
  const C = {
    respect: { icon: '🎩', title: `${member.name} için saygı göster`, lines: [`✦ +${fmt(GANG_RULES.RESPECT_PRESTIGE)} prestij kazanır.`, 'Her üyeye bir kez verilir (Baba değişse de); üye ayrılıp dönerse tekrar verilebilir.'], label: 'Saygı göster', act: () => run('giveRespect', { targetId: member.id }, { success: '🎩 Saygı gösterildi' }) },
    kick: { icon: '🚫', title: `${member.name} çeteden atılsın mı?`, lines: ['Çete prestiji kalıcı olarak silinir.', "Tekrar katılırsa Çömez olarak 0'dan başlar."], label: 'At', danger: true, act: () => run('kickMember', { targetId: member.id }, { success: '🚫 Üye atıldı' }) },
    kickVote: { icon: '🗳️', title: `${member.name} için çıkarma oylaması`, lines: ["Talep 00:00'a kadar gizli kalır, istersen iptal edersin.", "00:00'da oylama başlar, 24 saat sürer; 7 rütbeli oy verir.", "%51'den fazla evet → üye çıkarılır."], label: 'Talep et', act: () => run('requestVote', { type: 'kick', targetId: member.id }, { success: "🗳️ Talep alındı — 00:00'da başlar" }) },
  };
  const c = ask ? C[ask] : null;
  return (
    <Sheet title={member.name} icon={RANK_ICONS[member.rank]} onClose={onClose}>
      <div className="gx-member-detail">
        <RankBadge rank={member.rank} />
        <span className="gx-prestige">✦ {fmt(member.prestige)}</span>
        {member.respected && <span className="gx-pill">🎩 Saygı gördü</span>}
        {member.inactiveWarn && <span className="gx-pill warn">💤 29 gündür savaşmadı</span>}
      </div>
      <div className="gx-stack">
        {canRespect && <Btn block onClick={() => setAsk('respect')}>🎩 Saygı göster (+{fmt(GANG_RULES.RESPECT_PRESTIGE)})</Btn>}
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
            const r = await c.act();
            setAsk(null);
            if (r) onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function MoneySheet({ kind, d, onClose }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const [amount, setAmount] = useState(0);
  const [group, setGroup] = useState('rutbeli');
  const [slots, setSlots] = useState(GANG_RULES.DIST_MIN_SLOTS);
  const [target, setTarget] = useState(null);
  const { docs: gangs } = useQueryData(kind === 'transfer' ? path('gangs') : null, () => [limit(100)], 'gangs_all');
  const free = d.stateToday ? Number(d.state?.distributableLeft || 0) : 0;
  const n = group === 'rutbeli' ? GANG_RULES.DIST_RANKED_SLOTS : slots;
  const title = { donate: 'Kasaya bağış', dist: 'Altın dağıt', withdraw: 'Kendi hesabına aktar', transfer: 'Başka çeteye gönder' }[kind];
  const icon = { donate: '💸', dist: '💰', withdraw: '🏦', transfer: '📤' }[kind];
  const submit = async () => {
    let r;
    if (kind === 'donate') r = await run('donate', { amount }, { success: `💸 Bağışlandı · +${fmt(amount * GANG_RULES.DONATION_PRESTIGE_PER_GOLD)} prestij`, withRequestId: true });
    if (kind === 'dist') r = await run('createDistribution', { group, perPerson: amount, slots: n }, { success: '💰 Dağıtım açıldı', withRequestId: true });
    if (kind === 'withdraw') r = await run('withdrawToSelf', { amount }, { success: '🏦 Hesabına aktarıldı', withRequestId: true });
    if (kind === 'transfer') r = await run('transferToGang', { targetGangId: target, amount }, { success: '📤 Gönderildi', withRequestId: true });
    if (r) onClose();
  };
  return (
    <Sheet title={title} icon={icon} onClose={onClose}>
      {kind === 'donate' && <p className="dim gx-mini">Bağışın çete kasasına girer. 1 altın = {GANG_RULES.DONATION_PRESTIGE_PER_GOLD} prestij.</p>}
      {kind !== 'donate' && (
        <p className="dim gx-mini">
          🔓 Bugün serbest para: <b>{fmt(free)}</b> (00:00 kasasının %20'si). Dağıtım, Baba'nın kendine aktarımı ve başka çeteye gönderim bu tek hakkı paylaşır.
        </p>
      )}
      {kind === 'withdraw' && <p className="gx-hint-box">⚠️ Her 1 altın için {GANG_RULES.WITHDRAW_PRESTIGE_PER_GOLD} prestij kaybedersin (−{fmt(amount * GANG_RULES.WITHDRAW_PRESTIGE_PER_GOLD)}).</p>}
      {kind === 'dist' && (
        <>
          <Chips options={DIST_GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon }))} value={group} onChange={setGroup} />
          {group === 'rutbeli' ? (
            <p className="dim gx-mini">Rütbeliler: sabit {GANG_RULES.DIST_RANKED_SLOTS} kişi (Mafya Babası dahil).</p>
          ) : (
            <label className="gx-field">
              En fazla kaç kişi alabilir? <span className="dim">(en az {GANG_RULES.DIST_MIN_SLOTS})</span>
              <AmountInput value={slots} onChange={(v) => setSlots(Math.max(0, v))} />
            </label>
          )}
          <span className="dim gx-mini">Kişi başı tutar</span>
        </>
      )}
      {kind === 'transfer' && (
        <div className="gx-pick-list">
          {gangs
            .filter((g) => g.id !== d.gangId && g.status === 'active')
            .map((g) => (
              <button key={g.id} className={`gx-pick${target === g.id ? ' active' : ''}`} onClick={() => setTarget(g.id)}>
                <Logo logo={g.logo} size={22} /> {g.name}
              </button>
            ))}
        </div>
      )}
      <AmountInput value={amount} onChange={setAmount} max={kind === 'dist' ? Math.floor(free / Math.max(1, n)) : kind === 'donate' ? undefined : free} />
      {kind === 'dist' && (
        <p className="dim gx-mini">
          Havuz: {fmt(amount)} × {n} = <b>{fmt(amount * n)}</b> · 24 saat içinde alınmayan kasaya döner.
        </p>
      )}
      <Btn block busy={Boolean(busy)} disabled={!amount || (kind === 'transfer' && !target) || (kind === 'dist' && n < GANG_RULES.DIST_MIN_SLOTS)} onClick={submit}>
        Onayla
      </Btn>
    </Sheet>
  );
}

function Alliances({ d, lead }) {
  const { run, busy } = useGangAction();
  const [note, setNote] = useState(null);
  const [text, setText] = useState('');
  const [end, setEnd] = useState(null);
  const list = d.alliances.filter((a) => a.status !== 'requested' || a.requestedBy === d.gangId);
  return (
    <>
      <div className="gx-section-head">
        <span>🤝 İttifaklar</span>
        <Info text="İttifak 00:00'da başlar ve bitirilince 00:00'da biter. Aktifken aranızda bahis ve sabotaj olmaz; birbirinizin tırını savunabilirsiniz. Yeni teklif Savaş panelinden gönderilir." />
      </div>
      {list.length === 0 && <p className="dim gx-mini">İttifak yok.</p>}
      {list.map((a) => {
        const other = a.gangIds.find((g) => g !== d.gangId);
        const label = { requested: 'Teklif gönderildi', accepted: "00:00'da başlar", active: 'Aktif', ending: "00:00'da bitiyor" }[a.status];
        return (
          <Card key={a.id} className="gx-ally">
            <div className="gx-offer-head">
              <Logo logo={a.logos?.[other]} size={30} />
              <div>
                <b>{a.names?.[other]}</b>
                <div className="dim gx-mini">{label}</div>
              </div>
            </div>
            {a.notes?.[other] && <div className="gx-note-quote">✉️ “{a.notes[other].text}” — {fmtDateTime(a.notes[other].atMs)}</div>}
            {lead && (
              <div className="gx-row-2">
                {['accepted', 'active', 'ending'].includes(a.status) && (
                  <Btn small kind="ghost" onClick={() => { setNote(a); setText(''); }}>
                    ✉️ Not gönder
                  </Btn>
                )}
                {a.status !== 'ending' && (
                  <Btn small kind="danger" onClick={() => setEnd(a)}>
                    💔 İptal
                  </Btn>
                )}
              </div>
            )}
          </Card>
        );
      })}
      {note && (
        <Sheet title={`Not: ${note.names?.[note.gangIds.find((g) => g !== d.gangId)]}`} icon="✉️" onClose={() => setNote(null)}>
          <textarea className="gx-input" rows={3} maxLength={GANG_RULES.NOTE_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Müttefike kısa not…" />
          <Btn
            block
            busy={Boolean(busy)}
            disabled={!text.trim()}
            onClick={async () => {
              const r = await run('sendAllianceNote', { allianceId: note.id, text }, { success: '✉️ Not gönderildi' });
              if (r) setNote(null);
            }}
          >
            Gönder
          </Btn>
        </Sheet>
      )}
      {end && (
        <Confirm
          icon="💔"
          danger
          title="İttifak bitirilsin mi?"
          lines={end.status === 'active' ? ["İttifak 00:00'da sona erer."] : ['Teklif / başlangıç iptal edilir.']}
          confirmLabel="Bitir"
          busy={Boolean(busy)}
          onCancel={() => setEnd(null)}
          onConfirm={async () => {
            await run('endAlliance', { allianceId: end.id }, { success: '💔 İttifak bitiriliyor' });
            setEnd(null);
          }}
        />
      )}
    </>
  );
}

export default function CetemTab({ d }) {
  const { path, actorId } = useGang();
  const { run, busy } = useGangAction();
  const { docs: log } = useQueryData(path(`gangs/${d.gangId}/log`), () => [orderBy('atMs', 'desc'), limit(15)], d.gangId);
  const [sel, setSel] = useState(null);
  const [money, setMoney] = useState(null);
  const [edit, setEdit] = useState(false);
  const [leave, setLeave] = useState(false);
  const [lead, setLead] = useState(null);
  const rank = d.rank;
  const isLead = LEADERS.includes(rank);
  const byRank = (r) => d.members.filter((m) => m.rank === r).sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
  const baba = byRank('baba')[0];
  const grid = [...byRank('tetikci'), ...byRank('comez')];
  const canDevirme = rank === 'sagkol' && (d.me?.prestige || 0) > (baba?.prestige || 0);
  const myLeaderPending = d.pending.filter((p) => p.type !== 'kick');
  const card = (m) => (
    <MemberCard
      key={m.id}
      name={m.name}
      rank={m.rank}
      prestige={m.prestige}
      avatar={m.avatar}
      me={m.id === actorId}
      big={m.rank === 'baba'}
      onClick={() => m.id !== actorId && setSel(m)}
      badges={
        <>
          {m.respected && '🎩'}
          {m.inactiveWarn && '💤'}
        </>
      }
    />
  );

  return (
    <div className="gx-stack">
      <Card>
        <div className="gx-note-row">
          <span className="gx-note-quote">“{d.gang.note || '…'}”</span>
          {isLead && (
            <button className="gx-link" onClick={() => setEdit(true)}>
              ✏️
            </button>
          )}
        </div>
        <KasaLine state={d.state} isToday={d.stateToday} />
        <div className="gx-action-grid">
          <Btn small kind="ghost" onClick={() => setMoney('donate')}>
            💸 Bağış
          </Btn>
          {isLead && (
            <Btn small onClick={() => setMoney('dist')}>
              💰 Altın dağıt +
            </Btn>
          )}
          {rank === 'baba' && (
            <Btn small kind="ghost" onClick={() => setMoney('withdraw')}>
              🏦 Kendime
            </Btn>
          )}
          {isLead && (
            <Btn small kind="ghost" onClick={() => setMoney('transfer')}>
              📤 Çeteye gönder
            </Btn>
          )}
        </div>
      </Card>

      {rank === 'sagkol' && (
        <div className="gx-lead-actions">
          {myLeaderPending.length > 0 ? (
            myLeaderPending.map((p) => (
              <div key={p.id} className="gx-pending">
                <span>🤫 {p.type === 'devirme' ? 'Devirme' : 'Ayaklanma'} talebin gizli — 00:00'da oylama başlar</span>
                <Btn small kind="ghost" busy={busy === `c_${p.id}`} onClick={() => run('cancelVoteRequest', { pendingId: p.id }, { key: `c_${p.id}`, success: 'İptal edildi' })}>
                  İptal
                </Btn>
              </div>
            ))
          ) : (
            <div className="gx-row-2">
              {canDevirme && (
                <Btn kind="primary" onClick={() => setLead('devirme')}>
                  🗡️ Devir
                </Btn>
              )}
              <Btn kind="danger" onClick={() => setLead('ayaklanma')}>
                🔥 Ayaklan
              </Btn>
            </div>
          )}
        </div>
      )}

      <div className="gx-section-head">
        <span>👥 Rütbe ağacı ({d.members.length})</span>
        <Info text="Rütbeler her gece 00:00'da prestije göre hesaplanır: Mafya Babası sabit, en yüksek 2 üye Sağ Kol, sonraki 4 Kıdemli, kalan 1.000.000+ prestijliler Tetikçi, altındakiler Çömez. Prestij: 1 savaş gücü = 1, 1 altın bağış = 5, Baba saygısı = 1.000.000." />
      </div>
      <RankTree rows={[baba ? [baba] : [], byRank('sagkol'), byRank('kidemli')]} grid={grid} gridTitle="Tetikçiler · Çömezler" renderCard={card} />

      <Alliances d={d} lead={isLead} />

      <div className="gx-section-head">
        <span>📜 Son olaylar</span>
      </div>
      <div className="gx-feed">
        {log.map((l) => (
          <div key={l.id} className="gx-feed-item">
            <span className="gx-feed-icon">{l.icon}</span>
            <span className="gx-feed-text">{l.text}</span>
            <span className="gx-feed-time">{fmtDateTime(l.atMs)}</span>
          </div>
        ))}
      </div>

      <Btn block kind="danger" onClick={() => setLeave(true)}>
        🚪 Çeteden ayrıl
      </Btn>

      {sel && <MemberSheet member={sel} myRank={rank} onClose={() => setSel(null)} />}
      {money && <MoneySheet kind={money} d={d} onClose={() => setMoney(null)} />}
      {edit && <EditProfileSheet gang={d.gang} rank={rank} onClose={() => setEdit(false)} />}
      {lead && (
        <Confirm
          icon={lead === 'devirme' ? '🗡️' : '🔥'}
          danger
          title={lead === 'devirme' ? 'Mafya Babasını devir' : 'Ayaklanma başlat'}
          lines={
            lead === 'devirme'
              ? ["🤫 00:00'a kadar gizli, istersen iptal edebilirsin.", "🗳️ 00:00'da 7 rütbeli oylar (24 saat).", '✅ %51 veya fazlası → Mafya Babası SEN olursun, eski Baba çeteden atılır.', '❌ Yeterli destek yoksa sen çeteden atılırsın.']
              : ["🤫 00:00'a kadar gizli, istersen iptal edebilirsin.", "🗳️ 00:00'da 7 rütbeli oylar (24 saat).", "✅ %66'dan FAZLA destek → Baba görevden alınır, Mafya Babası SEN olursun.", '❌ Yeterli destek yoksa çeteden atılırsın.']
          }
          confirmLabel={lead === 'devirme' ? 'Devir' : 'Ayaklan'}
          busy={busy === 'requestVote'}
          onCancel={() => setLead(null)}
          onConfirm={async () => {
            await run('requestVote', { type: lead }, { success: "🤫 Talep gizlice alındı — 00:00'da başlar" });
            setLead(null);
          }}
        />
      )}
      {leave && (
        <Confirm
          icon="🚪"
          danger
          title="Çeteden ayrılmak istediğine emin misin?"
          lines={['✦ Bu çetedeki prestijin KALICI olarak silinir.', "Geri dönersen 0 prestijle Çömez olarak başlarsın.", ...(rank === 'baba' ? ['👑 Babalık en yüksek prestijli üyeye geçer. Kimse kalmazsa çete kapanır.'] : [])]}
          confirmLabel="Ayrıl"
          busy={busy === 'leaveGang'}
          onCancel={() => setLeave(false)}
          onConfirm={async () => {
            await run('leaveGang', {}, { success: '🚪 Çeteden ayrıldın.' });
            setLeave(false);
          }}
        />
      )}
    </div>
  );
}
