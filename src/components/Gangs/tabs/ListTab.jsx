// ÇETELER — tüm çeteler + Polis Teşkilatı (v109; eski İstihbarat), son Pazar
// savaşı gücüne göre sıralı. Kart: logo, ad, kasa (Polis Teşkilatında maaş
// aralığı), son savaş gücü, üye sayısı, lider, kısa not.
// Sağ üstte "Çete kur +". Kendi çetende/teşkilatta isen kartta "Aç";
// teşkilatta değilsen "Katıl" (v123: sadece kod adı — Karakol'dakiyle aynı).
import { useMemo, useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { istDateKey, useDocData, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { Btn, Card, Confirm, Empty, Gold, Logo, Sheet } from '../ui';
import { LogoPicker, useMyWallet } from '../shared';
import { BiatTag } from '../Biat';
import { GANG_RULES, INTEL_LOGO, INTEL_NAME, fmt, productOf, gangRejoinHoursLeft } from '../gangConstants';
import PoliceApplySheet from '../PoliceApplySheet';

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
            ...(membership?.intelRosterId ? [`🚓 Polislikten ayrılırsın, prestijin silinir (${GANG_RULES.REJOIN_COOLDOWN_HOURS} saat yeniden başvuramazsın).`] : []),
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

// v38: çetelerin kasası listede 00:00'daki haliyle görünür (anlık kasa sadece o çetenin Tetikçi+ rütbelerine)
export function GangKasa({ gang }) {
  return (
    <span className="gx-kasa-midnight">
      <Gold value={gang?.kasaAtMidnight} />
      <span className="gx-midnight-chip">🕛 00:00</span>
    </span>
  );
}

export function OrgCard({ logo, name, note, kasa, power, powerNote, members, leader, leaderIcon, routes = [], action, mine, rankNo, biat = null }) {
  return (
    <Card className={`gx-gang-card${mine ? ' mine' : ''}`}>
      <div className="gx-gang-card-rank">#{rankNo}</div>
      <Logo logo={logo} size={48} />
      <div className="gx-gang-card-main">
        <div className="gx-gang-card-name">{name}</div>
        <div className="gx-gang-card-meta">
          {kasa != null && <span>{kasa}</span>}
          <span title={powerNote || 'Son Pazar savaşı gücü'}>
            ⚔️ {fmt(power)}
            {powerNote ? ' ⛓️' : ''}
          </span>
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
        {/* v84: kimin kime biat ettiği herkese görünür */}
        {biat?.name && (
          <div className="gx-gang-card-meta">
            <BiatTag name={biat.name} logo={biat.logo} />
          </div>
        )}
        {/* v111: bu çeteye biat edenler listede gösterilmez (sadece kimin kime biat ettiği) */}
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
  const nowMs = useNow(60_000);
  const today = istDateKey(nowMs);
  const { docs: gangs, loading } = useQueryData(path('gangs'), () => [where('status', '==', 'active'), limit(100)], 'active');
  const { data: intel } = useDocData(path('intel/main'));
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(null);
  const [joinIntel, setJoinIntel] = useState(false);
  const [cancelApp, setCancelApp] = useState(false);
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
            name={INTEL_NAME}
            note={intel?.note}
            kasa={null}
            power={x.power}
            members={intel?.memberCount || 0}
            leader={intel?.baskanCode}
            leaderIcon="⭐"
            mine={Boolean(ms.intelRosterId)}
            action={
              ms.intelRosterId ? (
                <Btn small onClick={() => onOpen('intel')}>
                  Aç
                </Btn>
              ) : ms.intelAppId ? (
                <Btn small kind="ghost" onClick={() => setCancelApp(true)}>
                  ⏳ İnceleniyor
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
            kasa={<GangKasa gang={x.g} />}
            power={x.power}
            powerNote={x.g.lastSundayBiat ? 'Son Pazar savaşında biat ettiği çete adına verdiği hasar' : null}
            biat={x.g.biat}
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
                (() => {
                  // v127: sadece ayrıldığı / atıldığı çeteye 24 saat giremez
                  const h = gangRejoinHoursLeft(ms, x.id, nowMs);
                  const dayLock = ms.gangExitDay?.[x.id] === today;
                  return (
                    <Btn small kind="ghost" disabled={h > 0 || dayLock} onClick={() => setJoin(x.g)}>
                      {h > 0 ? `🔒 ${h} sa` : dayLock ? '🔒 00:00' : 'Çeteye gir'}
                    </Btn>
                  );
                })()
              )
            }
          />
        )
      )}
      {create && <CreateGangSheet onClose={() => setCreate(false)} membership={ms} />}
      {joinIntel && <PoliceApplySheet membership={ms} onClose={() => setJoinIntel(false)} />}
      {cancelApp && (
        <Confirm
          icon="🚓"
          title={`Polislik başvurun (${ms.intelAppCode || ''}) sonuçlanıyor`}
          lines={['Eski başvurun birkaç dakika içinde otomatik sonuçlanır.', 'Başvurunu geri çekmek ister misin?']}
          danger
          confirmLabel="Geri çek"
          busy={busy === 'cancelIntelApplication'}
          onCancel={() => setCancelApp(false)}
          onConfirm={async () => {
            await run('cancelIntelApplication', {}, { success: 'Başvuru geri çekildi' });
            setCancelApp(false);
          }}
        />
      )}
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
