// POLİS TEŞKİLATI (v109; kodda "intel" — eski İstihbarat) — kod adları + "?"
// avatarlarla rütbe ağacı (Emniyet Genel Müdürü · 2 Emniyet Amiri · 4 Başkomiser ·
// Komiserler / Polis Memurları), kod adı ✏️, not, atma (anında) / çıkarma
// oylaması, istifa. Kasa yok — maaşı devlet öder (her gece 00:00). Sicil
// süresiz; başvuru formu sicilde durur ve düzenlenebilir.
import { useEffect, useState } from 'react';
import { istDateKey, istHour, useGangAction, useNow } from '../GangContext';
import { Btn, Card, Confirm, Gold, RankBadge, Sheet, Stat } from '../ui';
import { MemberCard, MidnightLegend, RankTree } from '../shared';
import { GANG_RULES, INTEL_LEADERS, RANK_ICONS, SALARIES, appRankLabel, fmt } from '../gangConstants';
import { IntelFormFields, formPayload, formValid } from '../PoliceApplySheet';

const DIRECT = { baskan: ['ajan', 'muhbir'], sef: ['muhbir'] };
// v61 — istismar önlemi (sunucuyla aynı: functions/gang/config.js INTEL)
const KICK_MIN_MEMBERS = 8;
const fmtDay = (ms) => (ms ? new Date(ms + 3 * 3600_000).toISOString().slice(0, 10).split('-').reverse().join('.') : '—');
function voteAllowed(my, t) {
  if (my === 'baskan' || my === 'sef') return !(DIRECT[my] || []).includes(t);
  if (my === 'uzman') return t !== 'baskan';
  return false;
}

// v108/v109 — polis SİCİLİ (süresiz): teşkilata girdiği günden bu yana tüm
// icraatı (istihbarat + polislik), maaşı ve başvuru formundaki beyanı.
// Rütbeliler herkesinkini, herkes kendisininkini görür.
function MemberReport({ member, self, onEditForm }) {
  const { run } = useGangAction();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    run('intelMemberReport', { rosterId: member.id }, { key: `rep_${member.id}` }).then((res) => {
      if (!alive) return;
      if (res) setR(res);
      else setErr(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);
  if (err) return <p className="dim gx-mini">Sicil alınamadı.</p>;
  if (!r) return <p className="dim gx-mini">Sicil yükleniyor…</p>;
  return (
    <div className="gx-stack">
      <div className="gx-section-head">
        <span>📋 Sicil</span>
        <span className="dim gx-mini">Teşkilata girdiğinden beri</span>
      </div>
      <Stat icon="📅" label="Teşkilata girişi">
        {fmtDay(r.joinedAtMs)} {r.joinedDaysAgo == null ? '' : r.joinedDaysAgo === 0 ? '(bugün)' : `(${r.joinedDaysAgo} gün önce)`}
      </Stat>
      <Stat icon="🚨" label="Durdurduğu soygun">
        {fmt(r.heistsStopped)}
      </Stat>
      <Stat icon="💰" label="Kurtardığı altın · soygun payı">
        {fmt(r.goldRecovered)} · <Gold value={r.goldEarned} />
      </Stat>
      <Stat icon="⚔️" label="Katıldığı savaş">
        {fmt(r.wars)}
      </Stat>
      <Stat icon="💪" label="Savaşlarda kullandığı güç">
        {fmt(r.power)}
      </Stat>
      <Stat icon="📡" label="İhbar (tır · bahisli savaş)">
        {fmt(r.truckReports)} · {fmt(r.betReports)}
      </Stat>
      <Stat icon="📦" label="İçerik açma (tır · bahisli savaş)">
        {fmt(r.truckLeaks)} · {fmt(r.betLeaks)}
      </Stat>
      <div className="gx-section-head">
        <span>📝 Başvuru formu</span>
        {self && (
          <button className="gx-link" onClick={() => onEditForm?.(r.form)}>
            ✏️ {r.form ? 'Düzenle' : 'Doldur'}
          </button>
        )}
      </div>
      {r.form ? (
        <div className="gx-app-form-view">
          <Stat icon="🏴" label="Bulunduğu çete">
            {r.form.gangName}
          </Stat>
          <Stat icon="🎖️" label="Çetedeki rütbesi">
            {appRankLabel(r.form.gangRank)}
          </Stat>
          <div className="gx-note-quote">“{r.form.reason}”</div>
        </div>
      ) : (
        <p className="dim gx-mini">{self ? 'Formu henüz doldurmadın — istediğin zaman doldurabilirsin.' : 'Form doldurulmamış.'}</p>
      )}
    </div>
  );
}

function MemberSheet({ member, myRank, rosterSize, onClose, self = false, onEditForm }) {
  const { run, busy } = useGangAction();
  const [ask, setAsk] = useState(null);
  const now = useNow(30_000);
  const canKick = !self && (DIRECT[myRank] || []).includes(member.rank);
  const canVote = !self && voteAllowed(myRank, member.rank);
  const voteOpen = istHour(now) < 12;
  const tooFew = rosterSize < KICK_MIN_MEMBERS;
  const isNew = Number(member.joinedAtMs || 0) > 0 && istDateKey(member.joinedAtMs) === istDateKey(now);
  const lockReason = tooFew ? `🔒 ${KICK_MIN_MEMBERS - 1} ya da daha az polis varken kimse çıkarılamaz` : isNew ? "🔒 Yeni katılan polis 00:00'a kadar çıkarılamaz" : null;
  return (
    <Sheet title={member.codeName} icon={RANK_ICONS[member.rank]} onClose={onClose}>
      <div className="gx-member-detail">
        <RankBadge rank={member.rank} />
        <span className="gx-prestige">✦ {fmt(member.prestige)}</span>
      </div>
      <div className="gx-stack">
        {canKick && (
          <Btn block kind="danger" disabled={Boolean(lockReason)} onClick={() => setAsk('kick')}>
            🚫 Teşkilattan at
          </Btn>
        )}
        {canVote && (
          <Btn block kind="ghost" disabled={!voteOpen || Boolean(lockReason)} onClick={() => setAsk('vote')}>
            {voteOpen ? '🗳️ Çıkarma oylaması başlat' : '🔒 🗳️ 00:00–12:00'}
          </Btn>
        )}
        {(canKick || canVote) && lockReason && <div className="dim gx-mini">{lockReason}</div>}
        {(self || ['baskan', 'sef', 'uzman'].includes(myRank)) && <MemberReport member={member} self={self} onEditForm={onEditForm} />}
      </div>
      {ask && (
        <Confirm
          icon={ask === 'kick' ? '🚫' : '🗳️'}
          danger={ask === 'kick'}
          title={ask === 'kick' ? `${member.codeName} atılsın mı?` : `${member.codeName} için çıkarma oylaması`}
          lines={
            ask === 'kick'
              ? ['Teşkilattan ve polislikten çıkar.', `${GANG_RULES.REJOIN_COOLDOWN_HOURS} saat yeniden başvuramaz.`]
              : [member.rank === 'baskan' ? '✅ %66+ evet → teşkilattan ve polislikten çıkar' : '✅ %51 evet → teşkilattan ve polislikten çıkar', '❌ geçmezse kimse atılmaz']
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
  const [form, setForm] = useState(null);
  const [leave, setLeave] = useState(false);
  const lead = INTEL_LEADERS.includes(d.rank);
  const byRank = (r) => d.roster.filter((m) => m.rank === r).sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
  const card = (m) => <MemberCard key={m.id} secret name={m.codeName} rank={m.rank} prestige={m.prestige} me={m.id === d.rid} big={m.rank === 'baskan'} onClick={() => setSel(m)} />;
  const salary = SALARIES[d.realRank || 'muhbir'] || 0;

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
        <div className="gx-kasa-line">
          <span>
            💼 Maaşın <b>{fmt(salary)}</b> · her gece 00:00
          </span>
        </div>
        <div className="gx-codename-row">
          🪪 Kod adın: <b>{d.me?.codeName}</b>
          <button className="gx-link" onClick={() => setCode(d.me?.codeName || '')} aria-label="Kod adını değiştir">
            ✏️
          </button>
        </div>
      </Card>

      <div className="gx-section-head">
        <span>🚓 Teşkilat ({d.roster.length})</span>
        <MidnightLegend />
      </div>
      <RankTree rows={[byRank('baskan'), byRank('sef'), byRank('uzman')]} rows2={[{ title: 'Komiserler', items: byRank('ajan') }, { title: 'Polis Memurları', items: byRank('muhbir') }]} renderCard={card} />

      <Btn block kind="danger" onClick={() => setLeave(true)}>
        🚪 Polislikten istifa et
      </Btn>

      {sel && (
        <MemberSheet
          member={sel}
          self={sel.id === d.rid}
          myRank={d.rank}
          rosterSize={d.roster.length}
          onClose={() => setSel(null)}
          onEditForm={(f) => {
            setSel(null);
            setForm({ gangName: f?.gangName === 'Çetem yok' ? GANG_RULES.APP_NO_GANG : f?.gangName || '', gangRank: f?.gangRank || '', reason: f?.reason || '' });
          }}
        />
      )}
      {form && (
        <Sheet title="Başvuru formun" icon="📝" onClose={() => setForm(null)}>
          <IntelFormFields form={form} setForm={setForm} />
          <Btn
            block
            busy={busy === 'updateIntelForm'}
            disabled={!formValid(form)}
            onClick={async () => {
              const r = await run('updateIntelForm', formPayload(form), { success: '📝 Formun güncellendi' });
              if (r) setForm(null);
            }}
          >
            Kaydet
          </Btn>
        </Sheet>
      )}
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
        <Sheet title="Teşkilat notu" icon="✏️" onClose={() => setNote(null)}>
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
      {leave && (
        <Confirm
          icon="🚪"
          danger
          title="Polislikten istifa etmek istediğine emin misin?"
          lines={['Prestijin ve sicilin kalıcı silinir.', 'Maaşın kesilir.', `${GANG_RULES.REJOIN_COOLDOWN_HOURS} saat yeniden başvuramazsın.`]}
          confirmLabel="İstifa et"
          busy={busy === 'leaveIntel'}
          onCancel={() => setLeave(false)}
          onConfirm={async () => {
            await run('leaveIntel', {}, { success: '🚪 Polislikten istifa ettin.' });
            setLeave(false);
          }}
        />
      )}
    </div>
  );
}
