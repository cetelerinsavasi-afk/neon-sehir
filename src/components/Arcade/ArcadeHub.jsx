import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useBackClose } from '../../lib/backStack';
import { ARCADE_GAMES } from './games/index.js';
import GameRunner from './GameRunner';
import { BOT_LEVELS, PCOL } from './games/common.js';
import { ONLINE_ENABLED, cancelRoom, createRoom, joinRoom, leaveSeat, startRoom, watchLobby, watchRooms } from './net';
import { streamBroadcast } from '../Stream/streamShared';
import './Arcade.css';

const BrickBreaker = lazy(() => import('../HouseScreen/ArcadeGame'));

// =============================================================================
// v75 — OYUN SALONU (evde Atari Makinesi / Oyuncu Bilgisayarı / İnternet Kafe
// İstasyonu / Konsol & TV Seti'nden ya da karşılarındaki koltuktan açılır).
// v79 — 2–4 kişilik oyunlar: Uzay Koşusu · Tank Savaşı · Sumo · Sıcak Bomba ·
// Boya Savaşı · Drift Yarışı (yeni). Bota karşı (rakip sayısı seçilir) ya da
// online oda: kuran bekleme odasında katılanları görür, "Başlat" der; boş
// koltuklar bota döner. Online: Realtime Database (bkz. net.js).
// =============================================================================
const GAMES = ARCADE_GAMES;
const BRICK = { id: 'tugla', title: 'Tuğla Kırma', emoji: '🧱', desc: 'Klasik atari: topu sektir, tüm tuğlaları kır.', min: 1, max: 1 };
const maxOf = (g) => g?.max || 2;
const botNames = (k) => Array.from({ length: k }, (_, i) => (k > 1 ? `🤖 Bot ${i + 1}` : '🤖 Bot'));

export default function ArcadeHub({ onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const myName = String(player?.displayName || user?.displayName || 'Oyuncu').slice(0, 14);
  const [gameId, setGameId] = useState(null);
  const [view, setView] = useState('menu'); // menu | mode | waiting | joined | play | brick
  const [mode, setMode] = useState(null);
  const [names, setNames] = useState(['', '']);
  const [roomId, setRoomId] = useState(null);
  const [seat, setSeat] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [lobby, setLobby] = useState([]);
  const [fillBots, setFillBots] = useState(true);
  // v86: bot zorluğu — Kolay (varsayılan) / Zor (eski botlar). Cihazda hatırlanır.
  const [level, setLevelState] = useState(() => {
    try {
      return localStorage.getItem('arcade_bot_level') === 'hard' ? 'hard' : 'easy';
    } catch {
      return 'easy';
    }
  });
  const setLevel = (v) => {
    setLevelState(v);
    try {
      localStorage.setItem('arcade_bot_level', v);
    } catch {
      /* yoksay */
    }
  };
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const game = useMemo(() => GAMES.find((g) => g.id === gameId) || null, [gameId]);
  const max = maxOf(game);
  const bots = max - 1; // bota karşı: masa botlarla dolar

  const back = () => {
    if (view === 'play' || view === 'brick') {
      setView(gameId && view === 'play' ? 'mode' : 'menu');
      setMode(null);
    } else if (view === 'waiting') leaveWaiting();
    else if (view === 'joined') leaveJoined();
    else if (view === 'mode') setView('menu');
    else onClose();
  };
  useBackClose(true, back);

  // açık odaları dinle (mod ekranında)
  useEffect(() => {
    if (view !== 'mode' || !game || !ONLINE_ENABLED || !user) return undefined;
    return watchRooms(game.id, (list) => setRooms(list.filter((r) => r.hostUid !== user.uid)));
  }, [view, game, user]);

  // oda kurduk: oyuncular bekleniyor
  useEffect(() => {
    if (view !== 'waiting' || !roomId || !game) return undefined;
    return watchLobby(game.id, roomId, { onPlayers: setLobby });
  }, [view, roomId, game]);
  // 2 kişilik oyun / oda doldu → otomatik başla
  useEffect(() => {
    if (view === 'waiting' && game && lobby.length >= max - 1) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby, view]);

  // odaya katıldık: ev sahibi başlatana kadar bekle
  useEffect(() => {
    if (view !== 'joined' || !roomId || !game || !user) return undefined;
    return watchLobby(game.id, roomId, {
      onPlayers: setLobby,
      onMeta: (meta) => {
        if (!meta) {
          setErr('Oda kapandı.');
          setRoomId(null);
          setView('mode');
          return;
        }
        if (meta.status === 'playing' && Array.isArray(meta.roster)) {
          const roster = meta.roster;
          const idx = roster.findIndex((r) => r.uid === user.uid);
          if (idx < 0) {
            setErr('Maç sensiz başladı.');
            setView('mode');
            return;
          }
          setNames(roster.map((r) => String(r.name || 'Oyuncu').slice(0, 14)));
          setMode({ kind: 'guest', gameId: game.id, roomId, roster, me: idx, slot: seat, myUid: user.uid });
          setView('play');
        }
      },
    });
  }, [view, roomId, game, user, seat]);

  const startBot = () => {
    setNames([myName, ...botNames(bots)]);
    setMode({ kind: 'bot', level });
    setRunKey((k) => k + 1);
    setView('play');
  };
  const host = async () => {
    setErr('');
    setBusy(true);
    try {
      const id = await createRoom(game.id, { uid: user.uid, name: myName }, max);
      setLobby([]);
      setRoomId(id);
      setView('waiting');
    } catch (e) {
      setErr(e?.message || 'Oda kurulamadı.');
    } finally {
      setBusy(false);
    }
  };
  const begin = async () => {
    if (!roomId || !game || busy) return;
    const humans = lobby.slice(0, max - 1);
    const roster = [{ uid: user.uid, name: myName, bot: false }, ...humans.map((p) => ({ uid: p.uid, name: p.name, bot: false }))];
    if (fillBots || roster.length < 2) {
      const k = max - roster.length;
      botNames(k).forEach((nm) => roster.push({ uid: '', name: nm, bot: true }));
    }
    setBusy(true);
    try {
      await startRoom(game.id, roomId, roster);
      setNames(roster.map((r) => r.name));
      setMode({ kind: 'host', gameId: game.id, roomId, roster, level });
      setView('play');
    } catch (e) {
      setErr(e?.message || 'Maç başlatılamadı.');
    } finally {
      setBusy(false);
    }
  };
  const leaveWaiting = () => {
    if (roomId && game) cancelRoom(game.id, roomId);
    setRoomId(null);
    setView('mode');
  };
  const leaveJoined = () => {
    if (roomId && game && seat) leaveSeat(game.id, roomId, seat);
    setRoomId(null);
    setSeat(null);
    setView('mode');
  };
  const join = async (room) => {
    setErr('');
    setBusy(true);
    try {
      const slot = await joinRoom(game.id, room.id, { uid: user.uid, name: myName }, room.max || 2);
      setSeat(slot);
      setRoomId(room.id);
      setLobby([]);
      setView('joined');
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

  const seats = (hostName) => {
    const list = [{ name: hostName, uid: 'host' }, ...lobby];
    return Array.from({ length: max }, (_, i) => list[i] || null);
  };
  const tagOf = (g) => (g.id === 'tugla' ? 'Tek kişilik' : maxOf(g) > 2 ? `👥 2–${maxOf(g)} kişi · 🤖 · 🌐` : '👥 2 kişi · 🤖 · 🌐');
  const card = (g) => (
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
      <span className={`gs-game-tag${maxOf(g) > 2 ? ' multi' : ''}`}>{tagOf(g)}</span>
    </button>
  );

  return (
    <div className="gs-backdrop">
      <div className="gs-sheet">
        <div className="gs-head">
          <button type="button" className="gs-back" onClick={back} aria-label="Geri">
            ‹
          </button>
          <span className="gs-title">{view === 'menu' ? '🎮 Oyun Salonu' : `${game?.emoji} ${game?.title}`}</span>
          <button type="button" className="gs-back" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {view === 'menu' && (
          <div className="gs-games">
            <p className="gs-section">👥 ARKADAŞLARLA (2–4 KİŞİ)</p>
            {GAMES.filter((g) => maxOf(g) > 2).map(card)}
            <p className="gs-section">⚔️ BİRE BİR</p>
            {GAMES.filter((g) => maxOf(g) <= 2).map(card)}
            <p className="gs-section">🕹️ TEK KİŞİLİK</p>
            {/* v81: Tuğla Kırma yayına aktarılamıyor → yayındayken listede yok */}
            {!streamBroadcast.uid && card(BRICK)}
          </div>
        )}

        {view === 'mode' && game && (
          <div className="gs-modes">
            <p className="gs-desc">{game.desc}</p>
            {game.how && <p className="gs-sub">🎮 {game.how}</p>}
            <div className="gs-level" role="radiogroup" aria-label="Bot zorluğu">
              <span className="gs-level-lbl">🤖 Bot zorluğu</span>
              {BOT_LEVELS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="radio"
                  aria-checked={level === l.key}
                  className={`gs-level-opt${level === l.key ? ' on' : ''}`}
                  onClick={() => setLevel(l.key)}
                >
                  {l.emoji} {l.label}
                </button>
              ))}
            </div>
            <button type="button" className="gs-mode primary" onClick={startBot}>
              <span>🤖</span>
              <b>Bota karşı oyna · {level === 'hard' ? 'Zor' : 'Kolay'}</b>
              <small>{max > 2 ? `${bots} botla hemen başla` : 'Hemen başla'}</small>
            </button>
            {ONLINE_ENABLED && user ? (
              <>
                <button type="button" className="gs-mode" onClick={host} disabled={busy}>
                  <span>🌐</span>
                  <b>Oda kur</b>
                  <small>{max > 2 ? `En fazla ${max} kişi · istediğinde başlat` : 'Rakip katılınca maç başlar'}</small>
                </button>
                <p className="gs-sub">Açık odalar ({rooms.length})</p>
                {rooms.length === 0 && <p className="gs-empty">Şu an bekleyen oda yok — sen kur, biri katılsın!</p>}
                {rooms.map((r) => (
                  <button key={r.id} type="button" className="gs-room" onClick={() => join(r)} disabled={busy}>
                    <span>
                      🎮 {r.hostName} {r.max > 2 ? `· ${r.n}/${r.max}` : ''}
                    </span>
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

        {(view === 'waiting' || view === 'joined') && game && (
          <div className="gs-waiting">
            <div className="gs-lobby">
              {seats(view === 'waiting' ? `${myName} (sen · kurucu)` : 'Kurucu').map((p, i) => (
                <div key={i} className={`gs-seat${p ? '' : ' empty'}`}>
                  <i style={{ background: PCOL[i] }} />
                  <b>{p ? (p.uid === user?.uid ? `${p.name} (sen)` : p.name) : 'Boş koltuk'}</b>
                  {!p && view === 'waiting' && fillBots && max > 2 && <small>🤖 bot olur</small>}
                </div>
              ))}
            </div>
            {view === 'waiting' ? (
              <>
                <p>{lobby.length ? `${lobby.length + 1}/${max} kişi hazır` : 'Oyuncular bekleniyor…'}</p>
                <small>Odan herkesin "Açık odalar" listesinde görünüyor.</small>
                {max > 2 && (
                  <>
                    <label className="gs-count">
                      <input type="checkbox" checked={fillBots} onChange={(e) => setFillBots(e.target.checked)} /> Boş koltuklara bot koy
                    </label>
                    <button type="button" className="gs-pill primary" disabled={busy || lobby.length < 1} onClick={begin}>
                      ▶ Maçı başlat ({lobby.length + 1 + (fillBots ? max - 1 - lobby.length : 0)} oyuncu)
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="gs-pill"
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
              </>
            ) : (
              <>
                <div className="gs-spinner" />
                <p>Kurucunun maçı başlatması bekleniyor…</p>
                <button type="button" className="gs-pill" onClick={leaveJoined}>
                  Odadan çık
                </button>
              </>
            )}
            {err && <p className="gs-err">{err}</p>}
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
