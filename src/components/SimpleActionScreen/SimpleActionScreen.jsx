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
}) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const { actions } = useDailyActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!user) {
    return <SignInPrompt message={signInMessage} />;
  }

  // isDone verilirse (ör. satıcıya-özel nested kontrol) onu kullan,
  // yoksa basit düz alan kontrolüne düş (Camii, Karakol gibi).
  const done = isDone ? isDone(actions) : Boolean(actions[dailyFlagKey]);
  const gold = player?.gold ?? 0;

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await actionFn();
    } catch (err) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="simple-action-screen">
      <p className="simple-action-desc">{description}</p>
      <button
        className="simple-action-btn"
        disabled={done || busy || (goldCost > 0 && gold < goldCost)}
        onClick={handleClick}
      >
        {done ? doneLabel : busy ? '…' : buttonLabel}
      </button>
      {error && <p className="simple-action-error">{error}</p>}
    </div>
  );
}
