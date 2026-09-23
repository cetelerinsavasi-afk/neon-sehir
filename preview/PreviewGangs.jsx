// ÖNİZLEME: "Canlı" = uygulamadaki gerçek Çeteler ekranı (otomatik açılır);
// "Test" = sahte personalarla test dünyası (sadece önizlemede).
import { useEffect, useMemo, useState } from 'react';
import GangsFullScreen from '../src/components/Gangs/GangsFullScreen';
import { GangProvider, useDocData } from '../src/components/Gangs/GangContext';
import { GangHome } from '../src/components/Gangs/GangsScreen';
import TestBar from './TestBar';
import '../src/components/Gangs/Gangs.css';

function TestWorld({ persona }) {
  const { data: world } = useDocData('gangWorlds/test');
  const offset = world?.clockOffsetMs || 0;
  const mode = useMemo(() => ({ world: 'test', worldId: 'test', actorId: persona, clockOffsetMs: offset }), [persona, offset]);
  if (!persona) return <div className="gx-empty">🧪 Persona seç</div>;
  return (
    <GangProvider mode={mode}>
      <GangHome key={persona} />
    </GangProvider>
  );
}

export default function PreviewGangs() {
  const [mode, setMode] = useState(() => (location.hash === '#live' ? 'live' : 'test'));
  const [persona, setPersona] = useState(null);
  const [ready, setReady] = useState(false);
  const { data: config } = useDocData('gangSystem/config');
  useEffect(() => {
    window.__gang.system.handleAdmin({ auth: { uid: 'previewAdmin' }, data: { action: 'unlock', password: 'test' } }).finally(() => setReady(true));
  }, []);
  if (mode === 'live') {
    return (
      <>
        <GangsFullScreen onClose={() => {}} />
        <button className="pv-mode" onClick={() => setMode('test')}>
          🧪
        </button>
      </>
    );
  }
  return (
    <div className="gx-full" role="dialog" aria-label="Çeteler">
      <div className="gx-full-top">
        <span className="gx-full-title">🏴 Çeteler · önizleme</span>
        <button className="gx-full-close" onClick={() => setMode('live')}>
          Canlı
        </button>
      </div>
      <div className="gx-full-body">
        <div className="gx-root">
          {ready && <TestBar persona={persona} onPersona={setPersona} onExit={() => setMode('live')} config={config} />}
          <TestWorld persona={persona} />
        </div>
      </div>
    </div>
  );
}
