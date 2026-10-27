// v134 — MİSAFİR (giriş yapmamış) Çeteler: çete listesi + devam eden savaşlar
// (salt izleme). Veriler sunucudan (gangAction 'guestView', 60 sn önbellek);
// çeteye girmek / katılmak giriş ister.
import { useEffect, useMemo, useState } from 'react';
import { GangProvider } from './GangContext';
import { Btn, Empty, Tabs } from './ui';
import { OrgCard, GangKasa } from './tabs/ListTab';
import { WarCard } from './WatchWars';
import { INTEL_LOGO, INTEL_NAME } from './gangConstants';
import { guestGangs } from '../../lib/guestApi';
import GuestSignInSheet from '../Guest/GuestSignInSheet';

const GUEST_MODE = { world: 'live', worldId: null, actorId: null };
const TABS = [
  { id: 'list', icon: '🏴', label: 'Çeteler' },
  { id: 'wars', icon: '⚔️', label: 'Savaşlar' },
];

function GuestGangsInner() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState('list');
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    let alive = true;
    guestGangs()
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);
  const list = useMemo(() => {
    if (!data?.gangs) return [];
    const items = data.gangs.map((g) => ({ kind: 'gang', id: g.id, power: g.lastSundayPower, g }));
    items.push({ kind: 'intel', id: 'intel', power: Number(data.intel?.lastSundayPower || 0) });
    return items.sort((a, b) => b.power - a.power || (a.kind === 'intel' ? -1 : b.kind === 'intel' ? 1 : (b.g.memberCount || 0) - (a.g.memberCount || 0)));
  }, [data]);
  const join = (
    <Btn small kind="ghost" onClick={() => setAsk(true)}>
      🔒 Katıl
    </Btn>
  );
  return (
    <div className="gx-page">
      <Tabs tabs={TABS.map((t) => (t.id === 'wars' ? { ...t, count: data?.wars?.length || 0 } : t))} value={tab} onChange={setTab} />
      {err && <Empty icon="📡" text="Bağlanılamadı." />}
      {!data && !err && <div className="gx-loading">Yükleniyor…</div>}
      {data?.closed && <Empty icon="🚧" text="Çeteler şu an tadilatta." />}
      {data && !data.closed && tab === 'list' &&
        list.map((x, i) =>
          x.kind === 'intel' ? (
            <OrgCard key="intel" rankNo={i + 1} logo={INTEL_LOGO} name={INTEL_NAME} note={data.intel?.note} kasa={null} power={x.power} members={data.intel?.memberCount || 0} leader={data.intel?.baskanCode} leaderIcon="⭐" action={join} />
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
              action={join}
            />
          )
        )}
      {data && !data.closed && tab === 'wars' && (
        <div className="gx-stack">
          {data.wars.length === 0 && <Empty icon="🕊️" text="Şu an devam eden savaş yok." />}
          {data.wars.map((w) => (
            <WarCard key={w.id} w={w} />
          ))}
        </div>
      )}
      {ask && <GuestSignInSheet onClose={() => setAsk(false)} />}
    </div>
  );
}

export default function GuestGangs() {
  return (
    <GangProvider mode={GUEST_MODE}>
      <GuestGangsInner />
    </GangProvider>
  );
}
