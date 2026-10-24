/* eslint-disable react-refresh/only-export-components */
// v127 — Belediye ekranının ortak durumu: belediye/main + belediye/public
// dinleyicileri (sadece ekran açıkken), kadro paneli (callable, sadece kadro),
// işlem çağrısı (yükleniyor + bildirim).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { isAdminUid } from '../../config/admin';
import { belediyeAction } from '../../services/gameActions';
import { useDocData } from '../Gangs/GangContext';
import { friendlyError } from '../Gangs/gangApi';
import { seatOfUid } from '../../../functions/belediye.js';
import { rateDayKey } from '../../../functions/belediyeRates.js';

const Ctx = createContext(null);

export function BelediyeProvider({ children }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const uid = user?.uid || null;
  const { data: main, loading: mainLoading } = useDocData(uid ? 'belediye/main' : null);
  const { data: pub } = useDocData(uid ? 'belediye/public' : null);
  const seat = seatOfUid(main, uid);
  const isAdmin = isAdminUid(uid) || player?.role === 'admin';

  // --- bildirim ---
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((text, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'err' ? 4200 : 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // --- kadro paneli (bekleyen oranlar, kasa, borçlar) ---
  const [panel, setPanel] = useState(null);
  const [panelErr, setPanelErr] = useState(null);
  const panelBusy = useRef(false);
  const loadPanel = useCallback(async () => {
    if (panelBusy.current) return;
    panelBusy.current = true;
    try {
      const r = await belediyeAction({ op: 'panel' });
      setPanel(r?.data || null);
      setPanelErr(null);
    } catch (err) {
      setPanelErr(friendlyError(err));
    } finally {
      panelBusy.current = false;
    }
  }, []);
  // Kadroya girince bir kez; kadrodan çıkınca temizle
  useEffect(() => {
    if (seat) loadPanel();
    else {
      setPanel(null);
      setPanelErr(null);
    }
  }, [seat, loadPanel]);
  // Gün dönünce (00:00) panel eskir → yenile
  useEffect(() => {
    if (!panel?.dayKey) return undefined;
    const t = setInterval(() => {
      if (rateDayKey() !== panel.dayKey) loadPanel();
    }, 30_000);
    return () => clearInterval(t);
  }, [panel?.dayKey, loadPanel]);

  // --- işlem ---
  const [busy, setBusy] = useState(null);
  const lock = useRef(false);
  const run = useCallback(
    async (op, data = {}, { success, key = op, silent = false } = {}) => {
      if (lock.current) return null;
      lock.current = true;
      setBusy(key);
      try {
        const r = await belediyeAction({ op, ...data });
        const res = r?.data || { ok: true };
        if (success) showToast(typeof success === 'function' ? success(res) : success, 'ok');
        return res;
      } catch (err) {
        if (!silent) showToast(friendlyError(err), 'err');
        return null;
      } finally {
        lock.current = false;
        setBusy(null);
      }
    },
    [showToast]
  );

  // panel.next'i yerelde güncelle (setRate sonrası tekrar çağrı yapmadan)
  const patchNext = useCallback((id, value) => {
    setPanel((p) => (p ? { ...p, next: { ...p.next, [id]: value } } : p));
  }, []);

  const value = useMemo(
    () => ({ uid, player, main: main || {}, mainLoading, pub: pub || {}, seat, isAdmin, panel, panelErr, loadPanel, patchNext, run, busy, showToast }),
    [uid, player, main, mainLoading, pub, seat, isAdmin, panel, panelErr, loadPanel, patchNext, run, busy, showToast]
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && (
        <div key={toast.id} className={`gx-toast gx-toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useBelediye() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBelediye BelediyeProvider içinde kullanılmalı');
  return c;
}
