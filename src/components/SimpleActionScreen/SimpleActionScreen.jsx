import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useDailyActions } from '../../hooks/useDailyActions';
import SignInPrompt from '../SignInPrompt/SignInPrompt';
import './SimpleActionScreen.css';

/**
 * SimpleActionScreen — "günde 1 kez, tek buton" kalıbındaki ekranlar için
 * ortak iskelet (Camii, Karakol, Seyyar Satıcı). dailyFlagKey,
 * dailyActions/{uid}_{tarih} dokümanındaki hangi alana bakılacağını belirtir.
 * v197: yeni tasarım — ikonlu başlık, etki çipleri (ücret / şüphe / saygınlık), cebindeki altın ve
 * şüphe satırı, büyük ana düğme. icon / title / chips verilmezse eski düz görünüm (açıklama + düğme).
 */
export default function SimpleActionScreen({
  signInMessage,
  description,
  buttonLabel,
  doneLabel,
  dailyFlagKey,
  isDone,
  goldCost = 0,
  actionFn,
  icon = null,
  title = null,
  chips = null, // [{ label, tone: 'gold' | 'good' | 'bad' | 'info' }]
  tone = 'cyan', // 'cyan' | 'green' | 'gold'
  showStats = false,
}) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  if (!user) {
    return <SignInPrompt message={signInMessage} />;
  }

  // isDone verilirse (ör. satıcıya-özel nested kontrol) onu kullan,
  // yoksa basit düz alan kontrolüne düş (Camii, Karakol gibi).
  const done = isDone ? isDone(actions) : Boolean(actions[dailyFlagKey]);
  const gold = player?.gold ?? 0;
  const poor = goldCost > 0 && gold < goldCost;

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await actionFn();
      setOk(true);
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`simple-action-screen sa-${tone}${icon || title ? ' sa-card' : ''}`}>
      {(icon || title) && (
        <div className="sa-head">
          {icon && <span className="sa-ico" aria-hidden="true">{icon}</span>}
          <div className="sa-head-main">
            {title && <b>{title}</b>}
            {chips?.length > 0 && (
              <div className="sa-chips">
                {chips.map((c) => (
                  <span key={c.label} className={`sa-chip ${c.tone || 'info'}`}>{c.label}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="simple-action-desc">{description}</p>
      {showStats && (
        <div className="sa-stats">
          <span>Cebindeki altın <b>{Number(gold).toLocaleString('tr-TR')}</b></span>
          <span>Şüphe <b>%{Math.max(0, Math.round(Number(player?.suspicion) || 0))}</b></span>
        </div>
      )}
      <button className={`simple-action-btn${done ? ' done' : ''}`} disabled={done || busy || poor} onClick={handleClick}>
        {done ? `✓ ${doneLabel}` : busy ? '…' : poor ? `Altının yetmiyor (${goldCost.toLocaleString('tr-TR')})` : buttonLabel}
      </button>
      {ok && done && <p className="sa-ok">Tamam!</p>}
      {error && <p className="simple-action-error">{error}</p>}
    </div>
  );
}
