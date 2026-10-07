import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useFootballer, useMyGymMembership } from '../../hooks/useGym';
import { shopAction } from '../../services/gameActions';
import { gymPriceOf } from '../../../functions/gym.js';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import { POS, EQUIP, POSITION_LOCK_MS } from './gymMeta';
import './Gym.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

// v77 — "Üyeliği başlat": mevki seç → öde → görev ağacı açılır
export default function GymPanel({ houseId, houseDoc, onClose, onStarted }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { fb } = useFootballer(user?.uid);
  const { active, today } = useMyGymMembership();
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cue, setCue] = useState(null);
  const isOwner = !houseDoc?.bizGame && houseDoc?.ownerUid === user?.uid;
  // sahip kendi salonunda günde 1 kez ücretsiz
  const price = isOwner ? 0 : gymPriceOf(houseDoc);
  const gold = Number(player?.gold || 0);
  const bonus = !houseDoc?.bizGame && houseDoc?.gymBonusDay === futbolDayKey(Date.now());
  const position = pos || fb?.position || null;
  const lockedUntil = fb?.position ? Number(fb.positionChangedAtMs || 0) + POSITION_LOCK_MS : 0;
  const posLocked = Boolean(fb?.teamId) || (fb?.position && lockedUntil > Date.now());
  const inTeam = Boolean(fb?.teamId);
  const doneToday = today && today.status === 'done';
  const elsewhere = active && active.gymId !== houseId;
  const poor = gold < price;
  const flash = (kind) => setCue({ kind, n: Date.now() });

  const start = async () => {
    if (!position) return flash('pos');
    if (poor) return flash('gold');
    setBusy(true);
    try {
      const r = await shopAction({ op: 'gymStart', houseId, expect: price, ...(position !== fb?.position ? { position } : {}) });
      onStarted?.(r);
    } catch (err) {
      const m = String(err?.message || '');
      flash(m === 'gold' ? 'gold' : m.startsWith('price-changed') ? 'price' : m.startsWith('position') ? 'pos' : 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gy-panel" onClick={(e) => e.stopPropagation()}>
      <div className="gy-head">
        <b>🏋️</b>
        {bonus && <span className="gy-bonus">🔥 +%10</span>}
        <span className={`gy-wallet${cue?.kind === 'gold' ? ' cue-blink' : ''}`} key={cue?.kind === 'gold' ? cue.n : 'w'}>
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(gold)}
        </span>
        <button className="wk-x" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="gy-power">
        <span>⚡</span>
        <b>{fb ? Number(fb.power).toFixed(1).replace('.0', '') : 100}</b>
        <i className="gy-power-bar">
          <i style={{ width: `${Math.min(100, ((fb?.power || 100) / 200) * 100)}%` }} />
        </i>
        <span className={Number(fb?.power || 100) >= 200 ? 'cue-glow' : 'gy-dim'}>⭐ 200</span>
      </div>

      <div className={`gy-positions${cue?.kind === 'pos' ? ' cue-shake' : ''}`} key={cue?.kind === 'pos' ? cue.n : 'p'}>
        {Object.entries(POS).map(([k, v]) => {
          const on = position === k;
          const lock = posLocked && fb?.position !== k;
          return (
            <button key={k} className={`gy-pos${on ? ' on' : ''}${lock ? ' cue-dim cue-lock' : ''}${!position ? ' cue-pulse' : ''}`} disabled={lock} onClick={() => setPos(k)} title={v.name}>
              <span>{v.icon}</span>
              <small>{v.name}</small>
            </button>
          );
        })}
      </div>
      {posLocked && !inTeam && fb?.position && (
        <p className="gy-mini">
          🔒 ⏳ {new Date(lockedUntil).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
        </p>
      )}

      {inTeam ? (
        <div className="gy-state cue-lock">⚽ 👕</div>
      ) : doneToday ? (
        <div className="gy-state done">
          ✓ <b>+{today.result?.gain}</b> {today.result?.bonus && <span className="cue-glow">🔥</span>} <small>⏳ 19:00</small>
        </div>
      ) : elsewhere ? (
        <div className="gy-state cue-ring">
          📍 {active.gymName} · {active.tasks.map((t, i) => (i < active.step ? '✓' : EQUIP[t].icon)).join(' ')}
        </div>
      ) : active ? (
        <button className="gy-go" onClick={onClose}>
          {active.tasks.map((t, i) => (i < active.step ? '✓' : EQUIP[t].icon)).join(' ')} ▶
        </button>
      ) : (
        <button className={`gy-go${poor || !position ? ' dim' : ''}${cue?.kind === 'gold' ? ' cue-shake' : ''}`} key={cue?.n || 'go'} disabled={busy} onClick={start}>
          {busy ? '…' : (
            <>
              ▶ {isOwner ? '👑 0' : (
                <>
                  <span className="gold-coin-icon" style={{ width: 16, height: 16 }} /> {fmt(price)}
                </>
              )}
            </>
          )}
        </button>
      )}
      {cue?.kind === 'price' && <p className="gy-mini cue-glow">💲 ↻</p>}
    </div>
  );
}
