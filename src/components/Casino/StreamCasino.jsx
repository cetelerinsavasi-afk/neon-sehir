/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBusinessList } from '../../hooks/useBusinessList';
import { useAuth } from '../../contexts/AuthContext';
import { CasinoGamesSheet } from './PlayerCasino';
import RouletteGame from '../Roulette/RouletteGame';
import { SlotMirror } from '../SlotScreen/SlotScreen';
import { publishCasinoFrame, clearGameFrame, streamBroadcast } from '../Stream/streamShared';
import { casinoPricesOf } from '../../../functions/casino.js';
import { SLOT_GAME_COST } from '../../../functions/casinoRules.js';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
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
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const GAME_LABEL = { rulet: '🎡 Rulet', slot: '🎰 Slot' };

export function StreamCasinoSheet({ onClose, onEnterTable }) {
  const { user } = useAuth();
  const [pick, setPick] = useState(null); // { id, h }
  const { list, loading } = useBusinessList('gazino', { enabled: Boolean(user) && !pick });
  const frameRef = useRef(null); // { k, c, st, sp }
  const gameRef = useRef(null);
  const casinoName = pick ? (pick.id === 'game' ? 'Neon Gazino' : pick.h?.name || 'Gazino') : '';
  const slotPrice = pick ? (pick.id === 'game' ? SLOT_GAME_COST : casinoPricesOf(pick.h).slot) : 0;

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
      const next = { k, c: casinoName, p: slotPrice, st };
      const same = frameRef.current && JSON.stringify(frameRef.current) === JSON.stringify(next);
      frameRef.current = next;
      if (!same) push();
    },
    [casinoName, slotPrice, push]
  );

  return (
    <div className="st-sheet-bg st-casino-sheet" onClick={onClose}>
      <div className="st-sheet cs-stream" onClick={(e) => e.stopPropagation()}>
        {!pick ? (
          <div className="bz cs-root">
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>🎰 Casinolar</h3>
              </div>
              <button className="bz-x" onClick={onClose} aria-label="Kapat">
                ✕
              </button>
            </div>
            <div className="cs-games">
              <button className="cs-game" onClick={() => setPick({ id: 'game', h: null })}>
                <span className="cs-game-ico">🎰</span>
                <span className="cs-game-txt">
                  <b>Neon Gazino</b>
                  <small>Slot {fmt(SLOT_GAME_COST)} altın</small>
                </span>
                <span className="cs-game-go">›</span>
              </button>
              {loading && <p className="bz-hint">…</p>}
              {list.map((h) => (
                <button key={h.id} className="cs-game" onClick={() => setPick({ id: h.id, h })}>
                  <span className="cs-game-ico">
                    <AvatarSvg avatar={h.ownerAvatar} size={34} rounded />
                  </span>
                  <span className="cs-game-txt">
                    <b>{h.name || 'Gazino'}</b>
                    <small>
                      {h.ownerName || 'Oyuncu'} · Slot {fmt(casinoPricesOf(h).slot)} altın
                    </small>
                  </span>
                  <span className="cs-game-go">›</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <button className="cs-back" onClick={() => setPick(null)}>
              ‹ Casinolar
            </button>
            <CasinoGamesSheet
              key={pick.id}
              casinoId={pick.id}
              houseDoc={pick.h}
              games={['onnumara', 'rulet', 'slot']}
              onClose={onClose}
              onState={onState}
              onGame={onGame}
              onEnterTable={(tableId) => {
                onClose();
                onEnterTable?.(tableId);
              }}
            />
          </>
        )}
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
