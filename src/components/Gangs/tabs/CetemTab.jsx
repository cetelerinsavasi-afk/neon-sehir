// ÇETEM — rütbe ağacı (1 · 2 · 4 · ızgara) futbol kartı tarzı üye kartları;
// bağış, altın dağıt +, Baba'nın kendi hesabına aktarımı, başka çeteye
// gönderim, ittifaklar (not / iptal), devirme / ayaklanma, çeteden ayrıl.
import { useState } from 'react';
import { limit, orderBy } from 'firebase/firestore';
import { fmtDateTime, istHour, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Btn, Card, Chips, Confirm, Logo, RankBadge, Sheet } from '../ui';
import { EditProfileSheet, KasaLine, MemberCard, MidnightLegend, RankTree, useMyWallet } from '../shared';
import { DIST_GROUPS, GANG_RULES, LEADERS, RANK_ICONS, fmt } from '../gangConstants';

// Üyeye dokununca: saygı / at / çıkarma oylaması (yetkiye göre)
const KICK_VOTE_TARGETS = { baba: ['sagkol', 'kidemli'], sagkol: ['kidemli', 'tetikci'], kidemli: ['tetikci', 'comez'] };
function MemberSheet({ member, myRank, handover, onClose }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const t = member.rank;
  const canRespect = myRank === 'baba' && !member.respected;
  const canKick = (myRank === 'baba' && (t === 'tetikci' || t === 'comez')) || (myRank === 'sagkol' && t === 'comez');
  const canKickVote = (KICK_VOTE_TARGETS[myRank] || []).includes(t);
  // v41: Baba → Sağ Kol başkanlık devri (günde bir açık talep)
  const canHandover = myRank === 'baba' && t === 'sagkol' && !handover;
  const voteOpen = istHour(useNow(30_000)) < 12;
  const C = {
    respect: { icon: '🎩', title: `${member.name} için saygı göster`, lines: [`✦ +${fmt(GANG_RULES.RESPECT_PRESTIGE)}`], label: 'Saygı göster', act: () => run('giveRespect', { targetId: member.id }, { success: '🎩 Saygı gösterildi' }) },
    kick: { icon: '🚫', title: `${member.name} çeteden atılsın mı?`, lines: ['Prestiji kalıcı silinir.', '🚪 İsterse hemen geri girebilir, prestiji 0\'dan başlar.'], label: 'At', danger: true, act: () => run('kickMember', { targetId: member.id }, { success: '🚫 Üye atıldı' }) },
    handover: {
      icon: '👑',
      title: `Başkanlığı ${member.name} adlı Sağ Kola devret?`,
      lines: [`✅ ${member.name} kabul ederse 00:00'da yeni Mafya Babası o olur`, '❌ Reddederse Mafya Babası olarak devam edersin', "⏱ 00:00'a kadar cevap gelmezse talep iptal olur", '🚪 Çeteden ayrılmazsın; rütben 00:00\'da prestijine göre belirlenir'],
      label: 'Devret',
      act: () => run('offerHandover', { targetId: member.id }, { success: '👑 Devir talebi gönderildi' }),
    },
    kickVote: { icon: '🗳️', title: `${member.name} için çıkarma oylaması`, lines: ['✅ %51\'den fazla → çeteden çıkar', '❌ geçmezse kimse atılmaz'], label: 'Başlat', act: () => run('requestVote', { type: 'kick', targetId: member.id }, { success: '🗳️ Oylama başladı' }) },
  };
  const c = ask ? C[ask] : null;
  return (
    <Sheet title={member.name} icon={RANK_ICONS[member.rank]} onClose={onClose}>
      <div className="gx-member-detail">
        <RankBadge rank={member.rank} />
        <span className="gx-prestige">✦ {fmt(member.prestige)}</span>
        {member.respected && <span className="gx-pill">🎩 Saygı gördü</span>}
        {member.inactiveWarn && <span className="gx-pill warn">💤 29 gündür aktif değil</span>}
      </div>
      <div className="gx-stack">
        {canHandover && (
          <Btn block kind="ghost" onClick={() => setAsk('handover')}>
            👑 Başkanlığı devret
          </Btn>
        )}
        {canRespect && <Btn block onClick={() => setAsk('respect')}>🎩 Saygı göster (+{fmt(GANG_RULES.RESPECT_PRESTIGE)})</Btn>}
        {canKickVote && (
          <Btn block kind="ghost" disabled={!voteOpen} onClick={() => setAsk('kickVote')}>
            {voteOpen ? '🗳️ Çıkarma oylaması başlat' : '🔒 🗳️ 00:00–12:00'}
          </Btn>
        )}
        {canKick && (
          <Btn block kind="danger" onClick={() => setAsk('kick')}>
            🚫 Çeteden at
          </Btn>
        )}
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

// v41: Baba'nın gönderdiği devir talebinin durumu
function HandoverStatus({ h }) {
  const { run, busy } = useGangAction();
  return (
    <div className={`gx-handover ${h.status}`}>
      <span className="gx-handover-main">
        👑 <b>{h.toName}</b> · {h.status === 'accepted' ? "✅ kabul etti — 00:00'da Mafya Babası" : '⏳ cevap bekleniyor'}
      </span>
      <Btn small kind="ghost" busy={busy === 'ho_cancel'} onClick={() => run('cancelHandover', {}, { key: 'ho_cancel', success: '👑 Devir iptal edildi' })}>
        İptal
      </Btn>
    </div>
  );
}

function MoneySheet({ kind, d, onClose }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const wallet = useMyWallet();
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
      {kind === 'donate' && amount > 0 && <div className="gx-free-line good">✦ +{fmt(amount * GANG_RULES.DONATION_PRESTIGE_PER_GOLD)}</div>}
      {kind !== 'donate' && (
        <div className="gx-free-line">
          🔓 <b>{fmt(free)}</b>
        </div>
      )}
      {kind === 'withdraw' && amount > 0 && <div className="gx-free-line bad">✦ −{fmt(amount * GANG_RULES.WITHDRAW_PRESTIGE_PER_GOLD)}</div>}
      {kind === 'dist' && (
        <>
          <Chips options={DIST_GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon }))} value={group} onChange={setGroup} />
          {group === 'rutbeli' ? (
            <div className="gx-free-line">👥 {GANG_RULES.DIST_RANKED_SLOTS}</div>
          ) : (
            <label className="gx-field">
              👥 Kişi sayısı
              <AmountInput value={slots} onChange={setSlots} quick={[1, 5, 10, 50]} min={GANG_RULES.DIST_MIN_SLOTS} />
            </label>
          )}
          <span className="dim gx-mini">💰 Kişi başı</span>
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
      <AmountInput value={amount} onChange={setAmount} max={kind === 'dist' ? Math.floor(free / Math.max(1, n)) : kind === 'donate' ? (wallet.gold ?? undefined) : free} />
      {kind === 'dist' && (
        <div className="gx-free-line">
          = <b>{fmt(amount * n)}</b>
        </div>
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
  const canDevirme = rank === 'sagkol' && (d.me?.prestige || 0) > (baba?.prestige || 0);
  const myLeaderPending = d.pending.filter((p) => p.type !== 'kick');
  const voteOpen = istHour(useNow(30_000)) < 12;
  const leadershipVote = d.votes.some((v) => v.type !== 'kick' && v.status === 'active');
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
        <KasaLine state={d.state} isToday={d.stateToday} kasa={d.kasaShown} live={d.kasaLive} />
        {!d.gang.babaId && <div className="gx-baba-vacant">👑 Mafya Babası koltuğu boş · 00:00'da en yüksek prestijli üye geçer</div>}
        {d.handover && d.handover.fromId === actorId && <HandoverStatus h={d.handover} />}
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
                <span>🤫 {p.type === 'devirme' ? '🗡️ Devirme' : '🔥 Ayaklanma'} · ⏱ 00:00</span>
                <Btn small kind="ghost" busy={busy === `c_${p.id}`} onClick={() => run('cancelVoteRequest', { pendingId: p.id }, { key: `c_${p.id}`, success: 'İptal edildi' })}>
                  İptal
                </Btn>
              </div>
            ))
          ) : (
            leadershipVote ? null : (
              <div className="gx-row-2">
                {canDevirme && (
                  <Btn kind="primary" disabled={!voteOpen} onClick={() => setLead('devirme')}>
                    {voteOpen ? '🗡️ Devir' : '🔒 🗡️ 00:00–12:00'}
                  </Btn>
                )}
                <Btn kind="danger" disabled={!voteOpen} onClick={() => setLead('ayaklanma')}>
                  {voteOpen ? '🔥 Ayaklan' : '🔒 🔥 00:00–12:00'}
                </Btn>
              </div>
            )
          )}
        </div>
      )}

      <div className="gx-section-head">
        <span>👥 Üyeler · {d.members.length}</span>
        <MidnightLegend />
      </div>
      <RankTree rows={[baba ? [baba] : [], byRank('sagkol'), byRank('kidemli')]} rows2={[{ title: 'Tetikçiler', items: byRank('tetikci') }, { title: 'Çömezler', items: byRank('comez') }]} renderCard={card} />

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

      {sel && <MemberSheet member={sel} myRank={rank} handover={d.handover} onClose={() => setSel(null)} />}
      {money && <MoneySheet kind={money} d={d} onClose={() => setMoney(null)} />}
      {edit && <EditProfileSheet gang={d.gang} rank={rank} onClose={() => setEdit(false)} />}
      {lead && (
        <Confirm
          icon={lead === 'devirme' ? '🗡️' : '🔥'}
          danger
          title={lead === 'devirme' ? 'Mafya Babasını devir' : 'Ayaklanma başlat'}
          lines={
            lead === 'devirme'
              ? ['✅ %51 → 👑 sen', '❌ çeteden atılırsın']
              : ['✅ %66+ → 👑 sen', '❌ çeteden atılırsın']
          }
          confirmLabel={lead === 'devirme' ? 'Devir' : 'Ayaklan'}
          busy={busy === 'requestVote'}
          onCancel={() => setLead(null)}
          onConfirm={async () => {
            await run('requestVote', { type: lead }, { success: '🗳️ Oylama başladı' });
            setLead(null);
          }}
        />
      )}
      {leave && (
        <Confirm
          icon="🚪"
          danger
          title="Çeteden ayrılmak istediğine emin misin?"
          lines={['Prestijin kalıcı silinir.']}
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
