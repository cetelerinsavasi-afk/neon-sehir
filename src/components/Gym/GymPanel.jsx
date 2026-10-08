import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useFootballer, useMyGymMembership } from '../../hooks/useGym';
import { shopAction } from '../../services/gameActions';
import { gymPriceOf, gymDeadlineMs } from '../../../functions/gym.js';
import { futbolDayKey } from '../../../functions/businessCatalogData.js';
import { bizErrText } from '../../lib/bizErrors';
import { POS, EQUIP } from './gymMeta';
import '../../styles/bizui.css';
import './Gym.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const f1 = (v) => Number(v || 0).toFixed(1).replace('.0', '');
const hhmm = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// v77 — Spor salonu üyeliği: mevki seç → öde → 3 görevlik antrenman başlar.
export default function GymPanel({ houseId, houseDoc, onClose, onStarted }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { fb } = useFootballer(user?.uid);
  const { active, today } = useMyGymMembership();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const isOwner = !houseDoc?.bizGame && houseDoc?.ownerUid === user?.uid;
  const price = isOwner ? 0 : gymPriceOf(houseDoc); // sahip kendi salonunda günde 1 kez ücretsiz
  const gold = Number(player?.gold || 0);
  const bonus = !houseDoc?.bizGame && houseDoc?.gymBonusDay === futbolDayKey(Date.now());
  const [pos, setPos] = useState(null);
  const position = fb?.position || pos || null;
  const inTeam = Boolean(fb?.teamId);
  const doneToday = today && today.status === 'done';
  const elsewhere = active && active.gymId !== houseId;
  const poor = gold < price;
  const power = Number(fb?.power || 100);
  const deadline = gymDeadlineMs(Date.now());

  const start = async () => {
    if (!position) return setMsg('Önce mevkini seç.');
    if (poor) return setMsg(`Altının yetmiyor: ${fmt(price)} altın lazım, cebinde ${fmt(gold)} var.`);
    setBusy(true);
    setMsg(null);
    try {
      const r = await shopAction({ op: 'gymStart', houseId, expect: price, ...(!fb?.position && pos ? { position: pos } : {}) });
      onStarted?.(r);
    } catch (err) {
      setMsg(bizErrText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bz gy-panel" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>🏋️ Spor salonu</h3>
        </div>
        <button className="bz-x" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="bz-wallet">
        <span>Cebindeki altın</span>
        <b>
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} /> {fmt(gold)}
        </b>
      </div>
      {bonus && <p className="bz-ok">🔥 Bonuslu salon: +%10 güç</p>}

      <div className="bz-sec">
        <p className="bz-sec-title">⚡ Gücün</p>
        <div className="gy-power">
          <b>{f1(power)}</b>
          <i className="gy-power-bar">
            <i style={{ width: `${Math.min(100, (power / 200) * 100)}%` }} />
          </i>
          <span className={power >= 200 ? 'cue-glow' : 'gy-dim'}>hedef 200</span>
        </div>
      </div>

      {fb?.position ? (
        <div className="bz-row">
          <span>⚽ Mevkin</span>
          <b>{`${POS[fb.position].icon} ${POS[fb.position].name}`}</b>
        </div>
      ) : (
        // v77: hiç mevki seçmediyse ilk antrenmandan önce burada da seçebilir
        <div className="bz-sec">
          <p className="bz-sec-title">⚽ Mevkini seç</p>
          <div className="gy-positions">
            {Object.entries(POS).map(([k, v]) => (
              <button key={k} className={`gy-pos${pos === k ? ' on' : ''}`} onClick={() => setPos(k)}>
                <span>{v.icon}</span>
                <small>{v.name}</small>
              </button>
            ))}
          </div>
          <p className="bz-hint">Günde 1 kez değişir. 200 güçte kalıcı olur.</p>
        </div>
      )}

      <div className="bz-sec">
        <p className="bz-sec-title">🎟️ Üyelik</p>
        <div className="bz-row">
          <span>Günlük ücret</span>
          <b>{isOwner ? 'Ücretsiz (senin salonun)' : `${fmt(price)} altın`}</b>
        </div>
        <div className="bz-row">
          <span>Geçerli</span>
          <b>{hhmm(deadline)}&apos;a kadar</b>
        </div>
      </div>

      {inTeam ? (
        <p className="bz-note">⚽ Takımdasın; antrenmanını takımın yaptırır.</p>
      ) : doneToday ? (
        <p className="bz-ok">
          ✓ Bugün yaptın: +{f1(today.result?.gain)} güç{today.result?.bonus ? ' 🔥' : ''}. Yeni hak 19:00&apos;da.
        </p>
      ) : elsewhere ? (
        <p className="bz-note">
          📍 Üyeliğin <b>{active.gymName}</b> salonunda devam ediyor ({active.step}/{active.tasks.length}).
        </p>
      ) : active ? (
        <>
          <p className="bz-note">
            Görev {active.step}/{active.tasks.length} · sıradaki: {EQUIP[active.tasks[active.step]]?.name}
          </p>
          <button className="bz-btn gold wide" onClick={onClose}>
            ▶ Antrenmana devam et
          </button>
        </>
      ) : (
        <button className="bz-btn gold wide" disabled={busy || !position} onClick={start}>
          {busy ? 'Başlatılıyor…' : isOwner ? '▶ Başla — ücretsiz' : `▶ Başla — ${fmt(price)} altın`}
        </button>
      )}
      {!active && !doneToday && !inTeam && poor && <p className="bz-warn">{fmt(price - gold)} altın eksik.</p>}
      {msg && <p className="bz-warn">{msg}</p>}
    </div>
  );
}
