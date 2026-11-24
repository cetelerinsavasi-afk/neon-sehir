/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CasinoGamesSheet } from './PlayerCasino';
import RouletteGame from '../Roulette/RouletteGame';
import { SlotMirror } from '../SlotScreen/SlotScreen';
import { publishCasinoFrame, clearGameFrame, streamBroadcast } from '../Stream/streamShared';
import { SLOT_GAME_COST } from '../../../functions/casinoRules.js';
import '../../styles/bizui.css';
import './PlayerCasino.css';

// =============================================================================
// v124 Faz 7 — YAYINDA CASİNOLAR
//   StreamCasinoSheet (yayıncı): "Oyun oyna › 🎰 Casinolar" → gazino seç (Neon Gazino +
//     oyuncu gazinoları) → On Numara · Rulet · Slot (piyango yok). Rulet / slot durumu
//     ~1/sn ve her değişiklikte yayına gider (Realtime DB, Firestore değil); 10 Numara
//     masası mevcut akışla tam ekranda açılır (masa kimliği yayına gider).
//   StreamCasinoView (izleyici): yayıncının rulet / slotunu butonsuz çizer.
// =============================================================================
const GAME_LABEL = { rulet: '🎡 Rulet', slot: '🎰 Slot' };

// v200: tek gazino (oyunun) — gazino seçimi yok, doğrudan On Numara · Rulet · Slot
export function StreamCasinoSheet({ onClose, onEnterTable }) {
  const frameRef = useRef(null); // { k, c, st, sp }
  const gameRef = useRef(null);

  const push = useCallback(() => {
    const f = frameRef.current;
    if (f && (gameRef.current === 'rulet' || gameRef.current === 'slot')) publishCasinoFrame(f);
  }, []);
  // izleyicide oyun penceresi açık kalsın (kare gelmezse 4 sn'de kapanır)
  useEffect(() => {
    const iv = setInterval(push, 1000);
    return () => {
      clearInterval(iv);
      if (streamBroadcast.uid) clearGameFrame();
    };
  }, [push]);
  const onGame = useCallback((g) => {
    gameRef.current = g;
    if (g !== 'rulet' && g !== 'slot') {
      frameRef.current = null;
      if (streamBroadcast.uid) clearGameFrame();
    }
  }, []);
  const onState = useCallback(
    (k, st) => {
      const next = { k, c: 'Neon Gazino', p: SLOT_GAME_COST, st };
      const same = frameRef.current && JSON.stringify(frameRef.current) === JSON.stringify(next);
      frameRef.current = next;
      if (!same) push();
    },
    [push]
  );

  return (
    <div className="st-sheet-bg st-casino-sheet" onClick={onClose}>
      <div className="st-sheet cs-stream" onClick={(e) => e.stopPropagation()}>
        <CasinoGamesSheet
          casinoId="game"
          houseDoc={null}
          games={['onnumara', 'rulet', 'slot']}
          onClose={onClose}
          onState={onState}
          onGame={onGame}
          onEnterTable={(tableId) => {
            onClose();
            onEnterTable?.(tableId);
          }}
        />
      </div>
    </div>
  );
}

// İzleyici: frameRef.current = { g: 'casino', s: '{"k":"rulet","c":"…","st":{…}}' }
export function StreamCasinoView({ frameRef }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    let last = '';
    const iv = setInterval(() => {
      const fr = frameRef.current;
      if (!fr || fr.g !== 'casino' || fr.s === last) return;
      last = fr.s;
      try {
        setF(JSON.parse(fr.s));
      } catch {
        /* bozuk kare */
      }
    }, 250);
    return () => clearInterval(iv);
  }, [frameRef]);
  if (!f) return <div className="st-game st-cards" />;
  return (
    <div className="st-game st-cards">
      <div className="st-cards-inner">
        <p className="st-cards-title">
          {GAME_LABEL[f.k] || '🎰'} · {f.c || 'Gazino'}
        </p>
        {f.k === 'rulet' ? <RouletteGame mirror={f.st || {}} /> : <SlotMirror mirror={f.st} price={f.p} />}
      </div>
    </div>
  );
}
