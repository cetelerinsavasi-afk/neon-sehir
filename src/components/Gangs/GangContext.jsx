/* eslint-disable react-refresh/only-export-components */
// Çete ekranları için ortak bağlam: hangi dünya (canlı / test), kim olarak
// (gerçek oyuncu / test personası), sanal saat, bildirim (toast) ve
// Firestore dinleyici yardımcıları.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { callGang, friendlyError, newRequestId } from './gangApi';

const GangCtx = createContext(null);

export function GangProvider({ mode, children }) {
  // mode: { world: 'live'|'test', worldId, actorId, clockOffsetMs }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((text, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'err' ? 4200 : 2600);
  }, []);

  const call = useCallback((action, payload) => callGang(mode, action, payload), [mode]);

  const value = useMemo(
    () => ({
      mode,
      world: mode.world,
      worldId: mode.worldId,
      actorId: mode.actorId,
      isTest: mode.world === 'test',
      nowMs: () => Date.now() + (mode.world === 'test' ? Number(mode.clockOffsetMs || 0) : 0),
      path: (p) => `gangWorlds/${mode.worldId}/${p}`,
      call,
      showToast,
    }),
    [mode, call, showToast]
  );

  return (
    <GangCtx.Provider value={value}>
      {children}
      {toast && (
        <div key={toast.id} className={`gx-toast gx-toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </GangCtx.Provider>
  );
}

export function useGang() {
  const ctx = useContext(GangCtx);
  if (!ctx) throw new Error('useGang GangProvider içinde kullanılmalı');
  return ctx;
}

// --- Firestore dinleyicileri (sadece gerekli belgeler; limitli sorgular) ---
export function useDocData(path) {
  const [state, setState] = useState({ data: undefined, loading: true });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    const unsub = onSnapshot(
      doc(db, path),
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false }),
      (err) => {
        console.warn('gang doc dinleme', path, err?.code);
        setState({ data: null, loading: false, error: err });
      }
    );
    return unsub;
  }, [path]);
  return state;
}

// constraintsKey: kısıtlar değiştiğinde yeniden abone olmak için string anahtar
export function useQueryData(collPath, buildConstraints, constraintsKey) {
  const [state, setState] = useState({ docs: [], loading: true });
  const builderRef = useRef(buildConstraints);
  builderRef.current = buildConstraints;
  useEffect(() => {
    if (!collPath) {
      setState({ docs: [], loading: false });
      return undefined;
    }
    const constraints = builderRef.current ? builderRef.current() : [];
    if (constraints === null) {
      setState({ docs: [], loading: false });
      return undefined;
    }
    const q = query(collection(db, collPath), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => setState({ docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false }),
      (err) => {
        console.warn('gang sorgu dinleme', collPath, err?.code);
        setState({ docs: [], loading: false, error: err });
      }
    );
    return unsub;
  }, [collPath, constraintsKey]);
  return state;
}

// --- Buton aksiyonu: yükleniyor + kilit + başarı/hata bildirimi ---
export function useGangAction() {
  const { call, showToast } = useGang();
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);
  const run = useCallback(
    async (action, payload = {}, { success, key = action, withRequestId = false, silent = false } = {}) => {
      if (lock.current) return null;
      lock.current = true;
      setBusy(key);
      try {
        const res = await call(action, withRequestId ? { ...payload, requestId: newRequestId() } : payload);
        if (success) showToast(typeof success === 'function' ? success(res) : success, 'ok');
        return res || { ok: true };
      } catch (err) {
        // Hata oyuncuya kısa mesajla gösterilir; çağıran null alır.
        if (!silent) showToast(friendlyError(err), 'err');
        return null;
      } finally {
        lock.current = false;
        setBusy(null);
      }
    },
    [call, showToast]
  );
  return { run, busy };
}

// Saniyelik saat (sanal saat dahil)
export function useNow(intervalMs = 1000) {
  const { nowMs } = useGang();
  const [now, setNow] = useState(nowMs());
  useEffect(() => {
    setNow(nowMs());
    const t = setInterval(() => setNow(nowMs()), intervalMs);
    return () => clearInterval(t);
  }, [nowMs, intervalMs]);
  return now;
}

// --- İstanbul saati yardımcıları (sabit UTC+3) ---
const OFF = 3 * 3600_000;
export function istDateKey(ms) {
  return new Date(ms + OFF).toISOString().slice(0, 10);
}
export function istHour(ms) {
  return new Date(ms + OFF).getUTCHours();
}
export function istMidnight(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - OFF;
}
export function nextMidnight(ms) {
  return istMidnight(istDateKey(ms)) + 24 * 3600_000;
}
export function windowSlot(ms) {
  return Math.floor(istHour(ms) / 6);
}
export function nextWindowStart(ms) {
  const base = istMidnight(istDateKey(ms));
  return base + (windowSlot(ms) + 1) * 6 * 3600_000;
}
export function fmtCountdown(msLeft) {
  if (msLeft <= 0) return '00:00';
  const s = Math.floor(msLeft / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}` : `${pad(m)}:${pad(sec)}`;
}
export function fmtClock(ms) {
  const d = new Date(ms + OFF);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
export function fmtDateTime(ms) {
  const d = new Date(ms + OFF);
  const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  return `${days[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')} ${fmtClock(ms)}`;
}
