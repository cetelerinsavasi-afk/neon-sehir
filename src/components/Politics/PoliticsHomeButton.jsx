/* eslint-disable react-refresh/only-export-components */
// v136 — anasayfa sol alt 🗳️ butonu. Oyuncunun yapacağı bir şey varsa görünür:
//   imza dönemi (aday olmadı / imza vermedi) · oylama (oy vermedi) · sayım (herkese, 21–24)
// Oyuncu imza / oy verince kaybolur (takip için Belediye binasındaki buton durur).
// Konum: sol alt sütunun (Görevler → CANLI → Seçim) en üstü; boş yerler alta kayar.
import { lazy, Suspense, useEffect, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { usePoliticsState, politicsNeed } from '../../hooks/usePolitics';
import './Politics.css';

const PoliticsScreen = lazy(() => import('./PoliticsScreen'));
const CoupScreen = lazy(() => import('./Coup').then((m) => ({ default: m.CoupScreen })));
const CoupVoteSheet = lazy(() => import('./Coup').then((m) => ({ default: m.CoupVoteSheet })));
const LABEL = { signup: 'İMZA', vote: 'OY VER', count: 'SAYIM', coup: 'DARBE', coupVote: 'DARBE' };
const ICON = { coup: '⚡', coupVote: '⚡' };

export const leftSlotBottom = (slot) => `calc(${104 + slot * 64}px + env(safe-area-inset-bottom))`;

export default function PoliticsHomeButton({ slot = 0, onVisibleChange }) {
  const { player } = usePlayer();
  const { phase, cycle, state, now } = usePoliticsState();
  const need = politicsNeed({ phase, cycle, player, state, now });
  const [open, setOpen] = useState(null); // açılan ekran türü
  useEffect(() => {
    onVisibleChange?.(Boolean(need));
  }, [need, onVisibleChange]);
  return (
    <>
      {need && (
        <button type="button" className={`pl-home-btn${ICON[need] ? ' coup' : ''}`} style={{ bottom: leftSlotBottom(slot) }} onClick={() => setOpen(need)} aria-label={ICON[need] ? 'Darbe' : 'Belediye başkanlığı seçimi'}>
          {ICON[need] || '🗳️'}
          <small>{LABEL[need]}</small>
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          {open === 'coup' ? <CoupScreen onClose={() => setOpen(null)} /> : open === 'coupVote' ? <CoupVoteSheet onClose={() => setOpen(null)} /> : <PoliticsScreen onClose={() => setOpen(null)} />}
        </Suspense>
      )}
    </>
  );
}
