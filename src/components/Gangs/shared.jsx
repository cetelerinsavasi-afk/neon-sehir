/* eslint-disable react-refresh/only-export-components */
// Çete ekranlarında ortak parçalar: logo seçici, cüzdan, oylama kartı,
// İstihbaratçı-Baba karar paneli, profil düzenleme, üye (futbol) kartı.
import { useState } from 'react';
import { fmtCountdown, nextMidnight, useDocData, useGang, useGangAction, useNow } from './GangContext';
import { Bar, Btn, Card, Confirm, Logo, Sheet } from './ui';
import { GANG_RULES, LOGO_BGS, LOGO_COLORS, LOGO_EMOJIS, RANK_ICONS, RANK_LABELS, fmt } from './gangConstants';
import { usePlayer } from '../../hooks/usePlayer';
import AvatarSvg from '../AvatarSvg/AvatarSvg';

export function LogoPicker({ value, onChange }) {
  return (
    <div className="gx-logo-picker">
      <div className="gx-logo-preview">
        <Logo logo={value} size={64} />
      </div>
      <div className="gx-logo-grid">
        {LOGO_EMOJIS.map((e) => (
          <button key={e} className={value.emoji === e ? 'active' : ''} onClick={() => onChange({ ...value, emoji: e })} type="button">
            {e}
          </button>
        ))}
      </div>
      <div className="gx-swatches">
        {LOGO_COLORS.map((c) => (
          <button key={c} className={`gx-swatch${value.color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => onChange({ ...value, color: c })} aria-label={`Renk ${c}`} type="button" />
        ))}
      </div>
      <div className="gx-swatches">
        {LOGO_BGS.map((c) => (
          <button key={c} className={`gx-swatch${value.bg === c ? ' active' : ''}`} style={{ background: c, borderColor: '#444' }} onClick={() => onChange({ ...value, bg: c })} aria-label={`Zemin ${c}`} type="button" />
        ))}
      </div>
    </div>
  );
}

// Oyuncunun kendi altını/saygınlığı/gücü (test: persona)
export function useMyWallet() {
  const { isTest, actorId, path } = useGang();
  const { player } = usePlayer();
  const { data: persona } = useDocData(isTest ? path(`players/${actorId}`) : null);
  return isTest
    ? { gold: persona?.gold, reputation: persona?.reputation, power: persona?.power, avatar: null }
    : { gold: player?.gold, reputation: player?.reputation, power: null, avatar: player?.avatar || null };
}

// Futbol kartı tarzı üye kartı. İstihbaratta avatar yerine "?" + kod adı.
export function MemberCard({ name, rank, prestige, avatar, secret = false, me = false, big = false, onClick, badges }) {
  return (
    <button type="button" className={`gx-fcard gx-fcard-${rank}${me ? ' me' : ''}${big ? ' big' : ''}`} onClick={onClick}>
      <span className="gx-fcard-rank" title={RANK_LABELS[rank]}>
        {RANK_ICONS[rank]}
      </span>
      <span className="gx-fcard-avatar">{secret ? <span className="gx-fcard-q">?</span> : <AvatarSvg avatar={avatar} size={big ? 58 : 46} rounded />}</span>
      <span className="gx-fcard-name">{name}</span>
      <span className="gx-fcard-prestige">✦ {fmtShort(prestige)}</span>
      {badges && <span className="gx-fcard-badges">{badges}</span>}
    </button>
  );
}

export function fmtShort(n) {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`;
  if (a >= 10_000) return `${Math.round(v / 1000).toLocaleString('tr-TR')}K`;
  return v.toLocaleString('tr-TR');
}

// 1 · 2 · 4 · ızgara rütbe ağacı
export function RankTree({ rows, renderCard, rows2 = [] }) {
  return (
    <div className="gx-tree">
      {rows
        .filter((row) => row.length > 0)
        .map((row, i) => (
          <div key={i} className={`gx-tree-row n${row.length}`}>
            {row.map(renderCard)}
          </div>
        ))}
      {rows2
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.title} className="gx-tree-group">
            <div className="gx-tree-title">
              {g.title} <span className="gx-tree-count">{g.items.length}</span>
            </div>
            <div className="gx-tree-grid">{g.items.map(renderCard)}</div>
          </div>
        ))}
    </div>
  );
}

// İstihbarat üyesi Mafya Babası olduysa: gizli karar (sonraki 00:00'a kadar)
export function IntelDecisionPanel() {
  const { run, busy } = useGangAction();
  const now = useNow();
  const [ask, setAsk] = useState(null);
  return (
    <div className="gx-decision">
      <div className="gx-decision-title">🕵️ İstihbarat mı, Mafya Babalığı mı?</div>
      <div className="gx-decision-timer">⏱ {fmtCountdown(nextMidnight(now) - now)}</div>
      <div className="gx-decision-actions">
        <button className="gx-decision-btn intel" onClick={() => setAsk('disband')}>
          <span className="big">💥</span>
          <b>Çeteyi İstihbarata teslim et</b>
          <span className="dim">💥 · +10M ✦</span>
        </button>
        <button className="gx-decision-btn baba" onClick={() => setAsk('stay')}>
          <span className="big">👑</span>
          <b>İstihbarattan ayrıl</b>
        </button>
      </div>
      {ask && (
        <Confirm
          icon={ask === 'disband' ? '💥' : '👑'}
          danger={ask === 'disband'}
          title={ask === 'disband' ? 'Çete İstihbarata teslim edilsin mi?' : 'İstihbarattan ayrıl?'}
          lines={
            ask === 'disband'
              ? ['Çete kapanır, kasa İstihbarata geçer.']
              : ['İstihbarat prestijin kalıcı silinir.']
          }
          confirmLabel={ask === 'disband' ? 'Teslim et' : 'Ayrıl, Baba kal'}
          busy={busy === 'intelDecision'}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run('intelDecision', { choice: ask }, { success: ask === 'disband' ? '💥 Çete İstihbarata teslim edildi.' : '👑 Artık sadece Mafya Babasısın.' });
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}

export function EditProfileSheet({ gang, rank, onClose }) {
  const { run, busy } = useGangAction();
  const [name, setName] = useState(gang.name);
  const [logo, setLogo] = useState(gang.logo);
  const [note, setNote] = useState(gang.note || '');
  const isBaba = rank === 'baba';
  const save = async () => {
    const payload = { note };
    if (isBaba) Object.assign(payload, { name, logo });
    const r = await run('updateGangProfile', payload, { success: '✏️ Güncellendi' });
    if (r) onClose();
  };
  return (
    <Sheet title={isBaba ? 'Çete kimliği' : 'Çete notu'} icon="✏️" onClose={onClose}>
      {isBaba && <LogoPicker value={logo} onChange={setLogo} />}
      {isBaba && (
        <label className="gx-field">
          Çete adı
          <input className="gx-input" maxLength={GANG_RULES.NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label className="gx-field">
        Kısa not <span className="dim">(herkes görür · {note.length}/{GANG_RULES.NOTE_MAX})</span>
        <textarea className="gx-input" rows={3} maxLength={GANG_RULES.NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Btn block onClick={save} busy={busy === 'updateGangProfile'}>
        Kaydet
      </Btn>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Oylama kartı (Çete + İstihbarat)
// ---------------------------------------------------------------------------
const VOTE_RULE = {
  devirme: { icon: '🗡️', label: 'Devirme', need: '%51 evet', yes: 'Aday Mafya Babası olur, eski Baba çeteden çıkar', no: 'Aday çeteden atılır' },
  ayaklanma: { icon: '🔥', label: 'Ayaklanma', need: "%66'dan fazla evet", yes: 'Baba görevden alınır, başlatan Baba olur', no: 'Başlatan çeteden atılır' },
  kick: { icon: '🚫', label: 'Çıkarma', need: "%51'den fazla evet", yes: 'Üye çeteden çıkarılır', no: 'Üye kalır' },
  intelKick: { icon: '🚫', label: 'Çıkarma', need: '%51 evet', yes: 'Üye İstihbarattan çıkarılır', no: 'Hiçbir şey değişmez' },
  intelKickBaskan: { icon: '🦅', label: 'Başkanı çıkarma', need: "%66'dan fazla evet", yes: 'Başkan İstihbarattan çıkarılır', no: 'Hiçbir şey değişmez' },
};

export function VoteCard({ vote, ballotPath, voterKey, action }) {
  const { run, busy } = useGangAction();
  const now = useNow();
  const { data: ballot } = useDocData(ballotPath);
  const [ask, setAsk] = useState(null);
  const intel = action === 'castIntelVote';
  const r = intel ? VOTE_RULE[vote.targetWasBaskan ? 'intelKickBaskan' : 'intelKick'] : VOTE_RULE[vote.type];
  const total = (vote.yes || 0) + (vote.no || 0);
  const canVote = (vote.voterIds || []).includes(voterKey);
  const target = intel ? vote.targetCode : vote.targetName;
  return (
    <Card className="gx-vote">
      <div className="gx-war-top">
        <span className="gx-war-type">
          {r.icon} {r.label.toLocaleUpperCase('tr-TR')}
        </span>
        <span className="gx-timer">⏱ {fmtCountdown(vote.endsAtMs - now)}</span>
      </div>
      <div className="gx-vote-who">
        {vote.type === 'kick' || intel ? (
          <>
            Hedef: <b>{target}</b>
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
        🗳️ {vote.votedCount || 0}/{(vote.voterIds || []).length} · {r.need}
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
        <div className="dim gx-mini">👁️ İzliyorsun</div>
      )}
      {ask && (
        <Confirm
          icon={ask === 'yes' ? '✅' : '❌'}
          title={`"${ask === 'yes' ? 'Evet' : 'Hayır'}" oyu verilsin mi?`}
          lines={['Oy değiştirilemez.']}
          confirmLabel="Oy ver"
          busy={busy === action}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(action, { voteId: vote.id, choice: ask }, { success: '🗳️ Oyun kaydedildi' });
            setAsk(null);
          }}
        />
      )}
    </Card>
  );
}

// Kısa "kasa + serbest para" satırı
export function KasaLine({ state, isToday }) {
  const free = isToday ? Number(state?.distributableLeft || 0) : 0;
  return (
    <div className="gx-kasa-line">
      <span>
        💰 Kasa <b>{fmt(state?.kasa)}</b>
      </span>
      <span className="dim">
        🔓 <b>{fmt(free)}</b>
      </span>
    </div>
  );
}
