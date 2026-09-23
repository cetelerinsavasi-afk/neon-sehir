// Çeteler — alt çubuktaki "Çeteler" sekmesinin giriş noktası.
// v32: çeteler oyunculara AÇIK. Admin paneli / test şifresi kaldırıldı.
//  - Canlı dünya henüz kurulmadıysa ilk girişte sunucuya "hello" gider;
//    sunucu dünyayı tek seferlik (transaction ile) kurar ve açar.
//  - Firestore konsolundan gangSystem/config.liveOpen=false yapılırsa
//    "Tadilatta" görünür (bakım modu).
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GangProvider, useDocData, useGang } from './GangContext';
import { callGang } from './gangApi';
import GangShell from './GangShell';
import { Btn } from './ui';
import './Gangs.css';

function Maintenance({ icon = '🚧', title = 'Tadilatta', children }) {
  return (
    <div className="gx-maint">
      <div className="gx-maint-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="gx-maint-title">{title}</p>
      {children}
    </div>
  );
}

export function GangHome() {
  const { path, actorId } = useGang();
  const { data: membership, loading } = useDocData(path(`memberships/${actorId}`));
  if (loading) return <div className="gx-loading">Yükleniyor…</div>;
  return (
    <div className="gx-home">
      <GangShell membership={membership || {}} key={actorId} />
    </div>
  );
}

export default function GangsScreen() {
  const { user } = useAuth();
  const { data: config, loading } = useDocData(user ? 'gangSystem/config' : null);
  const [hello, setHello] = useState(null);
  const [retry, setRetry] = useState(0);
  const needHello = Boolean(user) && !loading && !config?.autoOpened;

  useEffect(() => {
    if (!needHello) return undefined;
    let alive = true;
    callGang({ world: 'live' }, 'hello')
      .then((r) => alive && setHello(r))
      .catch(() => alive && setHello({ error: true }));
    return () => {
      alive = false;
    };
  }, [needHello, retry]);

  const liveWorldId = config?.autoOpened ? (config.liveOpen ? config.liveWorldId : null) : hello?.liveOpen ? hello.liveWorldId : null;
  const liveMode = useMemo(() => ({ world: 'live', worldId: liveWorldId, actorId: user?.uid }), [liveWorldId, user?.uid]);

  if (!user) {
    return (
      <div className="gx-root">
        <Maintenance icon="🔒" title="Giriş yap" />
      </div>
    );
  }
  const closed = config?.autoOpened && !config.liveOpen;
  return (
    <div className="gx-root">
      {liveWorldId ? (
        <GangProvider mode={liveMode}>
          <GangHome />
        </GangProvider>
      ) : closed || hello?.liveOpen === false ? (
        <Maintenance />
      ) : hello?.error ? (
        <Maintenance icon="📡" title="Bağlanılamadı">
          <Btn
            small
            onClick={() => {
              setHello(null);
              setRetry((n) => n + 1);
            }}
          >
            Tekrar dene
          </Btn>
        </Maintenance>
      ) : (
        <div className="gx-loading">Yükleniyor…</div>
      )}
    </div>
  );
}
