import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBackClose } from '../../lib/backStack';
import headSoccer from './games/headSoccer';
import fighter from './games/fighter';
import racer from './games/racer';
import GameRunner from './GameRunner';
import { ONLINE_ENABLED, cancelRoom, connectRoom, createRoom, joinRoom, watchRooms } from './net';
import './Arcade.css';

const BrickBreaker = lazy(() => import('../HouseScreen/ArcadeGame'));

// =============================================================================
// v75 — OYUN SALONU (evde Atari Makinesi / Oyuncu Bilgisayarı / İnternet Kafe
// İstasyonu / Konsol & TV Seti'nden ya da karşılarındaki koltuktan açılır).
// 4 oyun: Kafa Topu · Sokak Dövüşü · Neon Yarış · Tuğla Kırma.
// İlk üçü: 🤖 bota karşı ya da 🌐 online (oda kur → rakip gelince başlar /
// açık odalardan birine katıl). Online: Realtime Database (bkz. net.js).
// =============================================================================
const GAMES = [headSoccer, fighter, racer];
const BRICK = { id: 'tugla', title: 'Tuğla Kırma', emoji: '🧱', desc: 'Klasik atari: topu sektir, tüm tuğlaları kır.' };

export default function ArcadeHub({ onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const myName = String(player?.displayName || user?.displayName || 'Oyuncu').slice(0, 14);
  const [gameId, setGameId] = useState(null);
  const [view, setView] = useState('menu'); // menu | mode | waiting | play | brick
  const [mode, setMode] = useState(null);
  const [names, setNames] = useState(['', '']);
  const [roomId, setRoomId] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const game = useMemo(() => GAMES.find((g) => g.id === gameId) || null, [gameId]);

  const back = () => {
    if (view === 'play' || view === 'brick') {
      setView(gameId && view === 'play' ? 'mode' : 'menu');
      setMode(null);
    } else if (view === 'waiting') leaveWaiting();
    else if (view === 'mode') setView('menu');
    else onClose();
  };
  useBackClose(true, back);

  // açık odaları dinle (mod ekranında)
  useEffect(() => {
    if (view !== 'mode' || !game || !ONLINE_ENABLED || !user) return undefined;
    return watchRooms(game.id, (list) => setRooms(list.filter((r) => r.hostUid !== user.uid)));
  }, [view, game, user]);

  // oda kurduk: rakip bekleniyor
  useEffect(() => {
    if (view !== 'waiting' || !roomId || !game) return undefined;
    let conn = null;
    let alive = true;
    connectRoom(game.id, roomId, 'host', {
      onGuest: (g) => {
        if (!alive || !g?.uid || g.left) return;
        alive = false;
        conn?.close();
        setNames([myName, String(g.name || 'Rakip').slice(0, 14)]);
        setMode({ kind: 'host', gameId: game.id, roomId });
        setView('play');
      },
    }).then((c) => {
      conn = c;
      if (!alive) c.close();
    });
    return () => {
      alive = false;
      conn?.close();
    };
  }, [view, roomId, game, myName]);

  const startBot = () => {
    setNames([myName, '🤖 Bot']);
    setMode({ kind: 'bot' });
    setRunKey((k) => k + 1);
    setView('play');
  };
  const host = async () => {
    setErr('');
    setBusy(true);
    try {
      const id = await createRoom(game.id, { uid: user.uid, name: myName });
      setRoomId(id);
      setView('waiting');
    } catch (e) {
      setErr(e?.message || 'Oda kurulamadı.');
    } finally {
      setBusy(false);
    }
  };
  const leaveWaiting = () => {
    if (roomId && game) cancelRoom(game.id, roomId);
    setRoomId(null);
    setView('mode');
  };
  const join = async (room) => {
    setErr('');
    setBusy(true);
    try {
      await joinRoom(game.id, room.id, { uid: user.uid, name: myName });
      setNames([String(room.hostName || 'Rakip').slice(0, 14), myName]);
      setMode({ kind: 'guest', gameId: game.id, roomId: room.id });
      setView('play');
    } catch (e) {
      setErr(e?.message || 'Odaya katılınamadı.');
    } finally {
      setBusy(false);
    }
  };

  if (view === 'brick') {
    return (
      <Suspense fallback={null}>
        <BrickBreaker onClose={() => setView('menu')} />
      </Suspense>
    );
  }

  return (
    <div className="gs-backdrop">
      <div className="gs-sheet">
        <div className="gs-head">
          <button type="button" className="gs-back" onClick={back} aria-label="Geri">
            ‹
          </button>
          <span className="gs-title">
            {view === 'menu' ? '🎮 Oyun Salonu' : `${game?.emoji} ${game?.title}`}
          </span>
          <button type="button" className="gs-back" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {view === 'menu' && (
          <div className="gs-games">
            {[...GAMES, BRICK].map((g) => (
              <button
                key={g.id}
                type="button"
                className={`gs-game gs-game-${g.id}`}
                onClick={() => {
                  setErr('');
                  if (g.id === 'tugla') setView('brick');
                  else {
                    setGameId(g.id);
                    setView('mode');
                  }
                }}
              >
                <span className="gs-game-emoji">{g.emoji}</span>
                <span className="gs-game-title">{g.title}</span>
                <span className="gs-game-desc">{g.desc}</span>
                <span className="gs-game-tag">{g.id === 'tugla' ? 'Tek kişilik' : '🤖 Bot · 🌐 Online'}</span>
              </button>
            ))}
          </div>
        )}

        {view === 'mode' && game && (
          <div className="gs-modes">
            <p className="gs-desc">{game.desc}</p>
            <button type="button" className="gs-mode primary" onClick={startBot}>
              <span>🤖</span>
              <b>Bota karşı oyna</b>
              <small>Hemen başla</small>
            </button>
            {ONLINE_ENABLED && user ? (
              <>
                <button type="button" className="gs-mode" onClick={host} disabled={busy}>
                  <span>🌐</span>
                  <b>Oda kur</b>
                  <small>Rakip katılınca maç başlar</small>
                </button>
                <p className="gs-sub">Açık odalar ({rooms.length})</p>
                {rooms.length === 0 && <p className="gs-empty">Şu an bekleyen oda yok — sen kur, biri katılsın!</p>}
                {rooms.map((r) => (
                  <button key={r.id} type="button" className="gs-room" onClick={() => join(r)} disabled={busy}>
                    <span>🎮 {r.hostName}</span>
                    <b>Katıl ›</b>
                  </button>
                ))}
              </>
            ) : (
              <p className="gs-empty">🌐 Online oyun yakında açılacak.</p>
            )}
            {err && <p className="gs-err">{err}</p>}
          </div>
        )}

        {view === 'waiting' && game && (
          <div className="gs-waiting">
            <div className="gs-spinner" />
            <p>Rakip bekleniyor…</p>
            <small>Odan herkesin "Açık odalar" listesinde görünüyor.</small>
            <button
              type="button"
              className="gs-pill primary"
              onClick={() => {
                leaveWaiting();
                startBot();
              }}
            >
              🤖 Beklemeden bota karşı oyna
            </button>
            <button type="button" className="gs-pill" onClick={leaveWaiting}>
              Odayı kapat
            </button>
          </div>
        )}

        {view === 'play' && game && mode && (
          <GameRunner
            key={`${mode.kind}_${mode.roomId || ''}_${runKey}`}
            game={game}
            mode={mode}
            names={names}
            onExit={() => {
              setMode(null);
              setView('mode');
            }}
            onAgain={
              mode.kind === 'bot'
                ? () => setRunKey((k) => k + 1)
                : () => {
                    setMode(null);
                    setView('mode');
                  }
            }
          />
        )}
      </div>
    </div>
  );
}
