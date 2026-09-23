// Çeteler — alt çubuktaki "Çeteler" sekmesinin giriş noktası.
//  - Sistem oyunculara kapalıyken: "🚧 Tadilatta". Yazıya 5 kez dokununca
//    şifre ekranı açılır (sadece ADMIN_UIDS + doğru şifre → test modu;
//    yetki sunucuda doğrulanır, bu ekran sadece görünürlüktür).
//  - Test modu: tamamen ayrı "test" dünyası, sahte personalar, sanal saat.
//  - Canlı açıkken: gerçek oyuncu kendi kimliğiyle canlı dünyada.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminUid } from '../../config/admin';
import { GangProvider, useDocData, useGang } from './GangContext';
import { callGangAdmin, friendlyError } from './gangApi';
import TestBar from './TestBar';
import GangShell from './GangShell';
import { Btn } from './ui';
import './Gangs.css';

function PasswordModal({ onClose, onUnlocked }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (!pw || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await callGangAdmin('unlock', { password: pw });
      onUnlocked();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gx-sheet-backdrop gx-center" onClick={onClose}>
      <div className="gx-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="gx-confirm-icon">🔐</div>
        <p className="gx-confirm-title">Test girişi</p>
        <input
          className="gx-input"
          type="password"
          autoFocus
          value={pw}
          placeholder="Şifre"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {err && <p className="gx-err-text">{err}</p>}
        <div className="gx-confirm-actions">
          <Btn kind="ghost" onClick={onClose}>
            Vazgeç
          </Btn>
          <Btn onClick={submit} busy={busy} disabled={!pw}>
            Gir
          </Btn>
        </div>
      </div>
    </div>
  );
}

function useFiveTaps(onFive) {
  const taps = useRef([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      onFive();
    }
  };
}

function Maintenance({ onSecret }) {
  const tap = useFiveTaps(onSecret);
  return (
    <div className="gx-maint">
      <div className="gx-maint-icon" aria-hidden="true">
        🚧
      </div>
      <p className="gx-maint-title" onClick={tap}>
        Tadilatta
      </p>
      <p className="gx-maint-sub">Çeteler çok yakında açılıyor.</p>
    </div>
  );
}

function GangHome() {
  const { path, actorId, isTest } = useGang();
  const { data: membership, loading } = useDocData(path(`memberships/${actorId}`));
  if (loading) return <div className="gx-loading">Yükleniyor…</div>;
  return (
    <div className="gx-home">
      <GangShell membership={membership || {}} key={actorId} />
      {isTest && <div className="gx-test-foot">🧪 Test dünyası — gerçek oyuncu verisi etkilenmez</div>}
    </div>
  );
}

export default function GangsScreen() {
  const { user } = useAuth();
  const { data: config, loading: cfgLoading } = useDocData(user ? 'gangSystem/config' : null);
  const [testActive, setTestActive] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [persona, setPersona] = useState(null);
  const admin = isAdminUid(user?.uid);
  const liveWorldId = config?.liveWorldId || null;
  const liveMode = useMemo(() => ({ world: 'live', worldId: liveWorldId, actorId: user?.uid }), [liveWorldId, user?.uid]);

  // Admin daha önce şifre girdiyse (12 saatlik oturum) doğrudan test moduna
  useEffect(() => {
    if (!admin) return;
    callGangAdmin('status')
      .then(() => setTestActive(true))
      .catch(() => {});
  }, [admin]);

  const onSecret = useCallback(() => setAskPw(true), []);
  const tapHeader = useFiveTaps(onSecret);

  if (!user) {
    return (
      <div className="gx-root">
        <div className="gx-maint">
          <div className="gx-maint-icon">🔒</div>
          <p className="gx-maint-sub">Çeteler için giriş yapmalısın.</p>
        </div>
      </div>
    );
  }

  if (testActive) {
    return (
      <div className="gx-root">
        <TestBar persona={persona} onPersona={setPersona} onExit={() => setTestActive(false)} config={config} />
        <TestWorld persona={persona} />
      </div>
    );
  }

  const liveOpen = Boolean(config?.liveOpen && config?.liveWorldId);
  return (
    <div className="gx-root">
      {cfgLoading ? (
        <div className="gx-loading">Yükleniyor…</div>
      ) : liveOpen ? (
        <>
          {admin && <div className="gx-secret-strip" onClick={tapHeader} aria-hidden="true" />}
          <GangProvider mode={liveMode}>
            <GangHome />
          </GangProvider>
        </>
      ) : (
        <Maintenance onSecret={onSecret} />
      )}
      {askPw && (
        <PasswordModal
          onClose={() => setAskPw(false)}
          onUnlocked={() => {
            setAskPw(false);
            setTestActive(true);
          }}
        />
      )}
    </div>
  );
}

function TestWorld({ persona }) {
  const { data: world } = useDocData('gangWorlds/test');
  const offset = world?.clockOffsetMs || 0;
  const mode = useMemo(() => ({ world: 'test', worldId: 'test', actorId: persona, clockOffsetMs: offset }), [persona, offset]);
  if (!persona) {
    return (
      <div className="gx-empty">
        <div className="gx-empty-icon">🧪</div>
        <p>Yukarıdan bir test personası seç (ya da "Hızlı kurulum").</p>
      </div>
    );
  }
  return (
    <GangProvider mode={mode}>
      <GangHome key={persona} />
    </GangProvider>
  );
}
