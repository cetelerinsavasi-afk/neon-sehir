// Çetesi olmayan oyuncu: çeteleri gez, katıl ya da kendi çeteni kur.
import { useMemo, useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { useDocData, useGang, useGangAction, useQueryData } from './GangContext';
import { Btn, Card, Confirm, Empty, Logo, Sheet } from './ui';
import { GANG_RULES, LOGO_BGS, LOGO_COLORS, LOGO_EMOJIS, fmt, productOf } from './gangConstants';
import { usePlayer } from '../../hooks/usePlayer';

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

function useMyWallet() {
  const { isTest, actorId, path } = useGang();
  const { player } = usePlayer();
  const { data: persona } = useDocData(isTest ? path(`players/${actorId}`) : null);
  return isTest ? { gold: persona?.gold, reputation: persona?.reputation, power: persona?.power } : { gold: player?.gold, reputation: player?.reputation, power: null };
}

function CreateGangSheet({ onClose, membership }) {
  const { run, busy } = useGangAction();
  const wallet = useMyWallet();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [logo, setLogo] = useState({ emoji: '💀', color: '#ff2e8c', bg: '#1a0610' });
  const [confirm, setConfirm] = useState(false);
  const req = [
    { icon: '🪙', label: `${fmt(GANG_RULES.CREATE_MIN_GOLD)} altın`, ok: wallet.gold == null ? null : wallet.gold >= GANG_RULES.CREATE_MIN_GOLD },
    { icon: '⭐', label: `${GANG_RULES.CREATE_MIN_REPUTATION} saygınlık`, ok: wallet.reputation == null ? null : wallet.reputation >= GANG_RULES.CREATE_MIN_REPUTATION },
    { icon: '💪', label: `${fmt(GANG_RULES.CREATE_MIN_POWER)} güç`, ok: wallet.power == null ? null : wallet.power >= GANG_RULES.CREATE_MIN_POWER },
  ];
  const valid = name.trim().length >= GANG_RULES.NAME_MIN;
  const submit = async () => {
    const r = await run('createGang', { name, note, logo, confirmLeave: true }, { success: '🏴 Çete kuruldu! Artık Mafya Babasısın.', withRequestId: true });
    if (r) onClose();
    else setConfirm(false);
  };
  return (
    <Sheet title="Çete Kur" icon="🏴" onClose={onClose}>
      <div className="gx-req">
        {req.map((r) => (
          <span key={r.label} className={`gx-req-item ${r.ok === false ? 'no' : r.ok ? 'yes' : ''}`}>
            {r.ok === false ? '✗' : r.ok ? '✓' : '•'} {r.icon} {r.label}
          </span>
        ))}
      </div>
      <LogoPicker value={logo} onChange={setLogo} />
      <label className="gx-field">
        Çete adı
        <input className="gx-input" maxLength={GANG_RULES.NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Gece Kartalları" />
      </label>
      <label className="gx-field">
        Not <span className="dim">(herkes görür)</span>
        <input className="gx-input" maxLength={GANG_RULES.NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Slogan, tehdit, davet…" />
      </label>
      <Btn block disabled={!valid} onClick={() => setConfirm(true)}>
        Kur — {fmt(GANG_RULES.CREATE_FEE)} altın
      </Btn>
      {confirm && (
        <Confirm
          icon="🏴"
          title={`"${name}" kurulsun mu?`}
          lines={[
            `🪙 ${fmt(GANG_RULES.CREATE_FEE)} altın hesabından düşer.`,
            '👑 Mafya Babası olursun, 10.000.000 çete prestijiyle başlarsın.',
            ...(membership?.intelRosterId ? ['🕵️ İstihbarattan ÇIKARSIN, İstihbarat prestijin silinir.'] : []),
          ]}
          confirmLabel="Kur"
          busy={busy === 'createGang'}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </Sheet>
  );
}

function GangListCard({ gang, onJoin }) {
  return (
    <Card className="gx-gang-card">
      <Logo logo={gang.logo} size={48} />
      <div className="gx-gang-card-main">
        <div className="gx-gang-card-name">{gang.name}</div>
        {gang.note && <div className="gx-note-quote">“{gang.note}”</div>}
        <div className="gx-gang-card-meta">
          <span>👥 {gang.memberCount}</span>
          <span>👑 {gang.babaName}</span>
          {(gang.routeProducts || []).map((p) => (
            <span key={p} title={productOf(p).label}>
              🛣️{productOf(p).emoji}
            </span>
          ))}
        </div>
      </div>
      <Btn small onClick={() => onJoin(gang)}>
        Katıl
      </Btn>
    </Card>
  );
}

export default function NoGangView({ membership }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const { docs: gangs, loading } = useQueryData(path('gangs'), () => [where('status', '==', 'active'), limit(60)], 'active');
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(null);
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      gangs
        .filter((g) => !q || g.name.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')))
        .sort((a, b) => (b.routeProducts?.length || 0) - (a.routeProducts?.length || 0) || b.memberCount - a.memberCount),
    [gangs, q]
  );
  return (
    <div className="gx-page">
      <div className="gx-hero">
        <div className="gx-hero-icon">🏴</div>
        <div>
          <div className="gx-hero-title">Bir çeten yok</div>
          <div className="dim">Bir çeteye katıl ya da kendi çeteni kur.</div>
        </div>
      </div>
      <Btn block onClick={() => setCreate(true)}>
        ➕ Çete Kur
      </Btn>
      <div className="gx-section-head">
        <span>Çeteler ({gangs.length})</span>
        {gangs.length > 6 && <input className="gx-input gx-search" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {loading && <div className="gx-loading">Yükleniyor…</div>}
      {!loading && list.length === 0 && <Empty icon="🌃" text="Henüz çete yok. İlk çeteyi sen kur!" />}
      {list.map((g) => (
        <GangListCard key={g.id} gang={g} onJoin={setJoin} />
      ))}
      {create && <CreateGangSheet onClose={() => setCreate(false)} membership={membership} />}
      {join && (
        <Confirm
          icon={join.logo?.emoji || '🏴'}
          title={`${join.name} çetesine katıl`}
          lines={['🐣 Çömez olarak başlarsın (prestij 0).', '⬆️ Rütben her gece 00:00\'da prestijine göre güncellenir.']}
          confirmLabel="Katıl"
          busy={busy === 'joinGang'}
          onCancel={() => setJoin(null)}
          onConfirm={async () => {
            await run('joinGang', { gangId: join.id }, { success: `➕ ${join.name} çetesine katıldın.` });
            setJoin(null);
          }}
        />
      )}
    </div>
  );
}
