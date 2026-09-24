// ÇETELER — tüm çeteler + İstihbarat, son Pazar savaşı gücüne göre sıralı.
// Kart: logo, ad, kasa, son savaş gücü, üye sayısı, Mafya Babası, kısa not.
// Sağ üstte "Çete kur +". Kendi çetende/İstihbaratta isen kartta "Aç".
import { useMemo, useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { istDateKey, useDocData, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { Btn, Card, Confirm, Empty, Gold, Logo, Sheet } from '../ui';
import { LogoPicker, useMyWallet } from '../shared';
import { GANG_RULES, INTEL_LOGO, fmt, productOf } from '../gangConstants';

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
        Kısa not
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
            `🪙 −${fmt(GANG_RULES.CREATE_FEE)}`,
            ...(membership?.gangId ? ['🚪 Şu anki çetenden çıkarsın, prestijin silinir.'] : []),
            ...(membership?.intelRosterId ? ['🕵️ İstihbarattan çıkarsın, prestijin silinir.'] : []),
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

function JoinIntelSheet({ onClose }) {
  const { run, busy } = useGangAction();
  const wallet = useMyWallet();
  const [code, setCode] = useState('');
  const ok = wallet.reputation == null || wallet.reputation >= GANG_RULES.INTEL_MIN_REPUTATION;
  return (
    <Sheet title="İstihbarata katıl" icon="🕵️" onClose={onClose}>
      <div className="gx-req">
        <span className={`gx-req-item ${wallet.reputation == null ? '' : ok ? 'yes' : 'no'}`}>
          {wallet.reputation == null ? '•' : ok ? '✓' : '✗'} ⭐ {GANG_RULES.INTEL_MIN_REPUTATION} saygınlık gerekir
        </span>
      </div>
      <label className="gx-field">
        Kod adın
        <input className="gx-input" maxLength={GANG_RULES.CODENAME_MAX} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ör. Baykuş" />
      </label>
      <div className="gx-hide-warn">🤫 İyi gizlendiğinden emin ol</div>
      <Btn
        block
        disabled={!ok || code.trim().length < GANG_RULES.CODENAME_MIN}
        busy={busy === 'joinIntel'}
        onClick={async () => {
          const r = await run('joinIntel', { codeName: code }, { success: '🕵️ İstihbarata hoş geldin.' });
          if (r) onClose();
        }}
      >
        {ok ? 'Katıl' : '🔒'}
      </Btn>
    </Sheet>
  );
}

function GangKasa({ gangId }) {
  const { path } = useGang();
  const { data } = useDocData(path(`gangs/${gangId}/private/state`));
  return <Gold value={data?.kasa} />;
}

function OrgCard({ logo, name, note, kasa, power, members, leader, leaderIcon, routes = [], action, mine, rankNo }) {
  return (
    <Card className={`gx-gang-card${mine ? ' mine' : ''}`}>
      <div className="gx-gang-card-rank">#{rankNo}</div>
      <Logo logo={logo} size={48} />
      <div className="gx-gang-card-main">
        <div className="gx-gang-card-name">{name}</div>
        <div className="gx-gang-card-meta">
          <span>{kasa}</span>
          <span title="Son Pazar savaşı gücü">⚔️ {fmt(power)}</span>
          <span>👥 {fmt(members)}</span>
        </div>
        <div className="gx-gang-card-meta">
          <span>
            {leaderIcon} {leader || '—'}
          </span>
          {routes.map((p) => (
            <span key={p} title={productOf(p).label}>
              🛣️{productOf(p).emoji}
            </span>
          ))}
        </div>
        {note && <div className="gx-note-quote">“{note}”</div>}
      </div>
      <div className="gx-gang-card-act">{action}</div>
    </Card>
  );
}

export default function ListTab({ membership, onOpen }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const ms = membership || {};
  const today = istDateKey(useNow(60_000));
  const { docs: gangs, loading } = useQueryData(path('gangs'), () => [where('status', '==', 'active'), limit(100)], 'active');
  const { data: intel } = useDocData(path('intel/main'));
  const { data: intelState } = useDocData(path('intel/main/private/state'));
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(null);
  const [joinIntel, setJoinIntel] = useState(false);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const items = gangs.map((g) => ({ kind: 'gang', id: g.id, power: Number(g.lastSundayPower || 0), g }));
    items.push({ kind: 'intel', id: 'intel', power: Number(intel?.lastSundayPower || 0) });
    return items
      .filter((x) => !q || x.kind === 'intel' || x.g.name.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')))
      .sort((a, b) => b.power - a.power || (a.kind === 'intel' ? -1 : b.kind === 'intel' ? 1 : (b.g.memberCount || 0) - (a.g.memberCount || 0)));
  }, [gangs, intel, q]);

  return (
    <div className="gx-page">
      <div className="gx-list-head">
        <span className="gx-list-title">
          🏴 Çeteler        </span>
        <Btn small onClick={() => setCreate(true)}>
          Çete kur +
        </Btn>
      </div>
      {gangs.length > 6 && <input className="gx-input gx-search" placeholder="Çete ara…" value={q} onChange={(e) => setQ(e.target.value)} />}
      {loading && <div className="gx-loading">Yükleniyor…</div>}
      {!loading && gangs.length === 0 && <Empty icon="🌃" text="Henüz çete yok. İlk çeteyi sen kur!" />}
      {list.map((x, i) =>
        x.kind === 'intel' ? (
          <OrgCard
            key="intel"
            rankNo={i + 1}
            logo={INTEL_LOGO}
            name="İstihbarat Teşkilatı"
            note={intel?.note}
            kasa={<Gold value={intelState?.kasa} />}
            power={x.power}
            members={intel?.memberCount || 0}
            leader={intel?.baskanCode}
            leaderIcon="🦅"
            mine={Boolean(ms.intelRosterId)}
            action={
              ms.intelRosterId ? (
                <Btn small onClick={() => onOpen('intel')}>
                  Aç
                </Btn>
              ) : (
                <Btn small kind="ghost" onClick={() => setJoinIntel(true)}>
                  Katıl
                </Btn>
              )
            }
          />
        ) : (
          <OrgCard
            key={x.id}
            rankNo={i + 1}
            logo={x.g.logo}
            name={x.g.name}
            note={x.g.note}
            kasa={<GangKasa gangId={x.id} />}
            power={x.power}
            members={x.g.memberCount}
            leader={x.g.babaName}
            leaderIcon="👑"
            routes={x.g.routeProducts || []}
            mine={ms.gangId === x.id}
            action={
              ms.gangId === x.id ? (
                <Btn small onClick={() => onOpen('gang')}>
                  Aç
                </Btn>
              ) : (
                <Btn small kind="ghost" disabled={ms.gangExitDay?.[x.id] === today} onClick={() => setJoin(x.g)}>
                  {ms.gangExitDay?.[x.id] === today ? '🔒 00:00' : 'Çeteye gir'}
                </Btn>
              )
            }
          />
        )
      )}
      {create && <CreateGangSheet onClose={() => setCreate(false)} membership={ms} />}
      {joinIntel && <JoinIntelSheet onClose={() => setJoinIntel(false)} />}
      {join && (
        <Confirm
          icon={join.logo?.emoji || '🏴'}
          title={`${join.name} çetesine gir`}
          lines={[
            ...(ms.gangId ? ['🚪 Şu anki çetenden çıkarsın, prestijin kalıcı silinir.'] : []),
          ]}
          danger={Boolean(ms.gangId)}
          confirmLabel="Gir"
          busy={busy === 'joinGang'}
          onCancel={() => setJoin(null)}
          onConfirm={async () => {
            const r = await run('joinGang', { gangId: join.id, confirmLeave: true }, { success: `➕ ${join.name} çetesine katıldın.` });
            setJoin(null);
            if (r) onOpen('gang');
          }}
        />
      )}
    </div>
  );
}
