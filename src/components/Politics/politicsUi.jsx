/* eslint-disable react-refresh/only-export-components */
// v136 — seçim / darbe ekranlarının ortak küçük parçaları
import { useEffect, useRef, useState } from 'react';
import { politicsAction } from '../../services/gameActions';
import { friendlyError } from '../Gangs/gangApi';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import { POLITICS } from '../../../functions/politicsRules.js';

export const nf = (v) => Math.round(Number(v) || 0).toLocaleString('tr-TR');
export const pc = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function useSecNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
export function Countdown({ untilMs, label }) {
  const now = useSecNow();
  const s = Math.max(0, Math.floor((untilMs - now) / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <div className="pl-time">
      <span>{label}</span>
      <b>
        {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
      </b>
    </div>
  );
}

export function Av({ avatar, color }) {
  return (
    <span className="pl-av" style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}>
      {avatar ? <AvatarSvg avatar={avatar} size={44} rounded /> : <span className="pl-av-ph" aria-hidden="true">👤</span>}
    </span>
  );
}

// Aday yazısının bir kısmı; dokununca tamamı
export function TextPreview({ text, name, onOpen }) {
  if (!text) return null;
  const short = text.length > POLITICS.TEXT_PREVIEW ? `${text.slice(0, POLITICS.TEXT_PREVIEW).trimEnd()}…` : text;
  return (
    <button type="button" className="pl-text-prev" onClick={() => onOpen({ name, text })}>
      “{short.replace(/\n+/g, ' ')}”
    </button>
  );
}

export function useRun(showToast) {
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);
  const run = async (op, data, { key = op, success } = {}) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(key);
    try {
      const r = await politicsAction({ op, ...data });
      if (success) showToast(typeof success === 'function' ? success(r?.data || {}) : success, 'ok');
      return r?.data || { ok: true };
    } catch (err) {
      showToast(friendlyError(err), 'err');
      return null;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  return { run, busy };
}

