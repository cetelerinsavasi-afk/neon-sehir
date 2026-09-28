import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { usePlayer } from '../../hooks/usePlayer';
import { houseAction } from '../../services/gameActions';
import { createHouseEngine, getThumb } from './houseEngine';
import { CATALOG, CATALOG_MAP, CATEGORIES, TINTS } from './houseCatalog';
import { FLOORS, WALLS } from './houseTextures';
import HouseMaintenance from './HouseMaintenance';
import './HouseScreen.css';

// =============================================================================
// HouseScreen — 3D Ev (v65, şimdilik sadece ADMIN + admin'in davet ettikleri).
//   - Sahibi (admin): Tasarla modu (eşya ekle/taşı/döndür/boya/sil, duvar-zemin)
//     ve Gez modu. Tasarım sunucuya otomatik kaydedilir (houseAction 'save').
//   - Davetli: sadece Gez modu; sahibin evi canlı güncellenir.
//   - Canlı: housePresence (konum/oturma) + houses/{id}/chat (sohbet + balon).
// =============================================================================

const PRESENCE_STALE_MS = 45_000;
const SAVE_DEBOUNCE_MS = 1200;

// Küçük resim kuyruğu — rafı dondurmamak için tek tek, aralıklı üretilir.
const thumbQueue = [];
let thumbBusy = false;
function pumpThumbs() {
  if (thumbBusy) return;
  const job = thumbQueue.shift();
  if (!job) return;
  if (!job.alive()) {
    pumpThumbs();
    return;
  }
  thumbBusy = true;
  setTimeout(() => {
    const url = getThumb(job.k, job.ti);
    if (job.alive()) job.cb(url);
    thumbBusy = false;
    pumpThumbs();
  }, 12);
}
function ItemThumb({ k, ti = 0, icon }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    thumbQueue.push({ k, ti, cb: (u) => setUrl(u), alive: () => alive });
    pumpThumbs();
    return () => {
      alive = false;
    };
  }, [k, ti]);
  return url ? <img className="hs-thumb" src={url} alt="" draggable={false} /> : <span className="hs-thumb hs-thumb-emoji">{icon}</span>;
}

function PriceTag({ price, small }) {
  if (!price) return <span className={`hs-price free${small ? ' sm' : ''}`}>Ücretsiz</span>;
  if (price.t === 'gem') return <span className={`hs-price gem${small ? ' sm' : ''}`}>💎 {price.v}</span>;
  return (
    <span className={`hs-price gold${small ? ' sm' : ''}`}>
      <span className="gold-coin-icon" style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} />
      {price.v.toLocaleString('tr-TR')}
    </span>
  );
}

function Joystick({ onChange }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const idRef = useRef(null);
  const move = (e) => {
    const r = baseRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width / 2 - 14;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    setKnob({ x: dx, y: dy, on: true });
    onChange(dx / max, dy / max);
  };
  return (
    <div
      ref={baseRef}
      className="hs-joy"
      onPointerDown={(e) => {
        e.stopPropagation();
        idRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (idRef.current === e.pointerId) move(e);
      }}
      onPointerUp={(e) => {
        if (idRef.current !== e.pointerId) return;
        idRef.current = null;
        setKnob({ x: 0, y: 0, on: false });
        onChange(0, 0);
      }}
      onPointerCancel={() => {
        idRef.current = null;
        setKnob({ x: 0, y: 0, on: false });
        onChange(0, 0);
      }}
    >
      <div className={`hs-joy-knob${knob.on ? ' on' : ''}`} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function sumValue(design) {
  let gold = 0;
  let gem = 0;
  const addP = (p) => {
    if (!p) return;
    if (p.t === 'gem') gem += p.v;
    else gold += p.v;
  };
  (design?.items || []).forEach((it) => addP(CATALOG_MAP[it.k]?.price));
  addP(WALLS.find((w) => w.key === design?.wall)?.price);
  addP(FLOORS.find((w) => w.key === design?.floor)?.price);
  return { gold, gem };
}

export default function HouseScreen({ onClose }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const social = useSocial();
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | maintenance | error
  const [errMsg, setErrMsg] = useState('');
  const [info, setInfo] = useState(null); // { houseId, isOwner, ownerName }
  const [mode, setMode] = useState('build');
  const [sel, setSel] = useState(null);
  const [interact, setInteract] = useState(null);
  const [cat, setCat] = useState('oturma');
  const [shelfOpen, setShelfOpen] = useState(true);
  const [saveState, setSaveState] = useState('saved');
  const [design, setDesign] = useState(null);
  const [houseDoc, setHouseDoc] = useState(null);
  const [online, setOnline] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [toast, setToast] = useState(null);

  const pendingDesignRef = useRef(null);
  const saveTimerRef = useRef(null);
  const appliedFirstRef = useRef(false);
  const seenMsgRef = useRef(new Set());
  const mountedAtRef = useRef(Date.now());

  const flash = useCallback((t) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 2600);
  }, []);

  // --- 1) Eve giriş ----------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setPhase('maintenance');
      return undefined;
    }
    let cancelled = false;
    houseAction({ op: 'enter' })
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        if (d.status !== 'ok') {
          setPhase('maintenance');
          return;
        }
        setInfo({ houseId: d.houseId, isOwner: !!d.isOwner, ownerName: d.ownerName || 'Ev' });
        setMode(d.isOwner ? 'build' : 'walk');
        setPhase('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setErrMsg(err?.message || 'Eve girilemedi.');
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // --- 2) Motor ------------------------------------------------------------------
  const flushSave = useCallback(async () => {
    const dsg = pendingDesignRef.current;
    if (!dsg || !info?.isOwner) return;
    pendingDesignRef.current = null;
    setSaveState('saving');
    try {
      await houseAction({ op: 'save', design: dsg });
      setSaveState(pendingDesignRef.current ? 'dirty' : 'saved');
    } catch (err) {
      console.error('Ev kaydı başarısız:', err);
      pendingDesignRef.current = pendingDesignRef.current || dsg;
      setSaveState('error');
    }
  }, [info?.isOwner]);

  useEffect(() => {
    if (phase !== 'ready' || !info || !mountRef.current) return undefined;
    const eng = createHouseEngine(mountRef.current, {
      canEdit: info.isOwner,
      selfUid: user.uid,
      onSelectionChange: setSel,
      onInteractChange: setInteract,
      onDesignChange: (dsg) => {
        setDesign(dsg);
        if (!info.isOwner) return;
        pendingDesignRef.current = { items: dsg.items, wall: dsg.wall, floor: dsg.floor };
        setSaveState('dirty');
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => flushSave(), SAVE_DEBOUNCE_MS);
      },
    });
    engineRef.current = eng;
    eng.setMode(info.isOwner ? 'build' : 'walk');
    return () => {
      clearTimeout(saveTimerRef.current);
      if (pendingDesignRef.current) {
        houseAction({ op: 'save', design: pendingDesignRef.current }).catch(() => {});
        pendingDesignRef.current = null;
      }
      eng.dispose();
      engineRef.current = null;
      deleteDoc(doc(db, 'housePresence', user.uid)).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, info?.houseId]);

  // kendi avatarım
  useEffect(() => {
    if (!engineRef.current || !user) return;
    engineRef.current.setSelf({ uid: user.uid, name: player?.displayName || 'Sen', avatar: player?.avatar || null });
  }, [player?.displayName, player?.avatar, user, phase, info?.houseId]);

  // --- 3) Ev dokümanı (tasarım + misafirler) --------------------------------------
  useEffect(() => {
    if (phase !== 'ready' || !info) return undefined;
    return onSnapshot(
      doc(db, 'houses', info.houseId),
      (snap) => {
        const data = snap.data() || {};
        setHouseDoc(data);
        const eng = engineRef.current;
        if (!eng) return;
        const dsg = { items: data.items || [], wall: data.wall, floor: data.floor };
        // Sahip: sadece ilk yüklemede (sonrasında yerel düzenleme esas).
        if (!info.isOwner || !appliedFirstRef.current) {
          appliedFirstRef.current = true;
          eng.setDesign(dsg, { force: true });
          setDesign(eng.getDesign());
        }
      },
      (err) => console.error('Ev dinleme hatası:', err)
    );
  }, [phase, info]);

  // --- 4) Canlı oyuncular --------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready' || !info) return undefined;
    const q = query(collection(db, 'housePresence'), where('houseId', '==', info.houseId), limit(30));
    return onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const list = [];
        snap.forEach((d) => {
          const p = d.data();
          const ms = p.updatedAt?.toMillis?.() ?? now;
          if (now - ms > PRESENCE_STALE_MS) return;
          list.push({ uid: d.id, ...p });
        });
        engineRef.current?.setOthers(list.filter((p) => p.uid !== user.uid));
        setOnline(list);
      },
      (err) => console.error('Ev presence hatası:', err)
    );
  }, [phase, info, user?.uid]);

  // kendi konumumu yaz (hareket varsa ~5/sn, yoksa 10 sn'de bir nabız)
  useEffect(() => {
    if (phase !== 'ready' || !info) return undefined;
    let last = '';
    let lastAt = 0;
    const iv = setInterval(() => {
      const eng = engineRef.current;
      if (!eng || document.hidden) return;
      const st = eng.getSelfState();
      const sig = `${st.x}|${st.z}|${st.seat}|${st.left}`;
      const now = Date.now();
      if (sig === last && now - lastAt < 10_000) return;
      last = sig;
      lastAt = now;
      setDoc(
        doc(db, 'housePresence', user.uid),
        { x: st.x, z: st.z, left: st.left, seat: st.seat, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }, 220);
    return () => clearInterval(iv);
  }, [phase, info, user?.uid]);

  // --- 5) Sohbet --------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready' || !info) return undefined;
    const q = query(collection(db, 'houses', info.houseId, 'chat'), orderBy('createdAtMs', 'desc'), limit(40));
    return onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.reverse();
        setMessages(list);
        list.forEach((m) => {
          if (seenMsgRef.current.has(m.id)) return;
          seenMsgRef.current.add(m.id);
          if ((m.createdAtMs || 0) > mountedAtRef.current - 2000) engineRef.current?.say(m.uid, m.text);
        });
      },
      (err) => console.error('Ev sohbet hatası:', err)
    );
  }, [phase, info]);

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text || chatBusy || !info) return;
    setChatBusy(true);
    try {
      await houseAction({ op: 'chat', houseId: info.houseId, text });
      setChatText('');
    } catch (err) {
      flash(err?.message || 'Mesaj gönderilemedi.');
    } finally {
      setChatBusy(false);
    }
  };

  // --- Davet ---------------------------------------------------------------------
  const guests = useMemo(() => Object.entries(houseDoc?.guests || {}).map(([uid, g]) => ({ uid, name: g?.name || 'Oyuncu' })), [houseDoc]);
  const doInvite = async (payload) => {
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      const res = await houseAction({ op: 'invite', ...payload });
      setInviteMsg({ ok: true, text: `${res.data?.name || 'Oyuncu'} davet edildi. Ev'e tıkladığında senin evine girecek.` });
      setInviteName('');
    } catch (err) {
      setInviteMsg({ ok: false, text: err?.message || 'Davet edilemedi.' });
    } finally {
      setInviteBusy(false);
    }
  };
  const doUninvite = async (uid) => {
    try {
      await houseAction({ op: 'uninvite', uid });
    } catch (err) {
      setInviteMsg({ ok: false, text: err?.message || 'Çıkarılamadı.' });
    }
  };

  // --- Mod ---------------------------------------------------------------------
  const switchMode = (m) => {
    setMode(m);
    engineRef.current?.setMode(m);
    if (m === 'walk') setSel(null);
  };

  const value = useMemo(() => sumValue(design), [design]);
  const shelfItems = useMemo(() => CATALOG.filter((d) => d.cat === cat), [cat]);
  const isOwner = !!info?.isOwner;

  // --- Görünüm -------------------------------------------------------------------
  if (phase === 'maintenance') return <HouseMaintenance onClose={onClose} />;

  return (
    <div className="hs-root">
      <div ref={mountRef} className="hs-stage" />

      {phase === 'loading' && (
        <div className="hs-loading">
          <div className="hs-spinner" />
          <p>Eve giriliyor…</p>
        </div>
      )}
      {phase === 'error' && (
        <div className="hs-loading">
          <p>⚠️ {errMsg}</p>
          <button className="hs-btn" onClick={onClose}>Kapat</button>
        </div>
      )}

      {phase === 'ready' && (
        <>
          {/* ÜST ÇUBUK */}
          <div className="hs-top">
            <button className="hs-icon-btn" onClick={onClose} title="Evden çık">✕</button>
            <div className="hs-title">
              <b>🏠 {isOwner ? 'Evim' : `${info.ownerName} evi`}</b>
              <span>
                {online.length} kişi evde
                {isOwner && (
                  <em className={`hs-save ${saveState}`}>
                    {saveState === 'saved' ? '✓ Kaydedildi' : saveState === 'saving' ? 'Kaydediliyor…' : saveState === 'error' ? '⚠ Kaydedilemedi' : '• Değişiklik var'}
                  </em>
                )}
              </span>
            </div>
            {isOwner && (
              <div className="hs-seg">
                <button className={mode === 'build' ? 'on' : ''} onClick={() => switchMode('build')}>🛠️ Tasarla</button>
                <button className={mode === 'walk' ? 'on' : ''} onClick={() => switchMode('walk')}>🚶 Gez</button>
              </div>
            )}
            {isOwner && (
              <button className="hs-icon-btn invite" onClick={() => { setInviteOpen(true); setInviteMsg(null); }} title="Davet et">
                👥<span className="hs-badge">{guests.length}</span>
              </button>
            )}
          </div>

          {isOwner && mode === 'build' && (
            <div className="hs-value">
              <span>Ev değeri</span>
              <PriceTag price={{ t: 'gold', v: value.gold }} small />
              <PriceTag price={{ t: 'gem', v: value.gem }} small />
              <em>Admin testi: yerleştirme ücretsiz</em>
            </div>
          )}

          {isOwner && mode === 'build' && showHelp && (
            <div className="hs-help" onClick={() => setShowHelp(false)}>
              <b>Nasıl tasarlanır?</b>
              <span>Aşağıdan eşya seç → odaya eklenir. Eşyayı <b>sürükle</b>: taşı · <b>dokun</b>: seç (döndür, renk, sil).</span>
              <span>Boş alanı sürükle: kamerayı çevir · İki parmak: yakınlaş/kaydır.</span>
              <i>Kapatmak için dokun</i>
            </div>
          )}

          {/* SEÇİLİ EŞYA ÇUBUĞU */}
          {isOwner && mode === 'build' && sel && (
            <div className="hs-selbar">
              <div className="hs-selbar-head">
                <b>{sel.def?.name}</b>
                <PriceTag price={sel.def?.price} small />
                <button className="hs-x" onClick={() => engineRef.current?.deselect()}>✕</button>
              </div>
              {sel.def?.tints && (
                <div className="hs-swatches">
                  {TINTS[sel.def.tints].map((t, i) => (
                    <button
                      key={t.n}
                      className={`hs-sw${(sel.c || 0) === i ? ' on' : ''}`}
                      style={{ background: t.c }}
                      title={t.n}
                      onClick={() => engineRef.current?.tintSelected(i)}
                    />
                  ))}
                </div>
              )}
              <div className="hs-selbar-actions">
                {!sel.def?.wall && <button onClick={() => engineRef.current?.rotateSelected(-1)}>↺ Döndür</button>}
                {!sel.def?.wall && <button onClick={() => engineRef.current?.rotateSelected(1)}>↻</button>}
                <button onClick={() => engineRef.current?.duplicateSelected()}>⧉ Kopyala</button>
                <button className="danger" onClick={() => engineRef.current?.deleteSelected()}>🗑 Sil</button>
              </div>
            </div>
          )}

          {/* KATALOG RAFI */}
          {isOwner && mode === 'build' && (
            <div className={`hs-shelf${shelfOpen ? '' : ' closed'}`}>
              <div className="hs-shelf-tabs">
                <button className="hs-shelf-toggle" onClick={() => setShelfOpen((v) => !v)}>{shelfOpen ? '▾' : '▴'}</button>
                <button className="hs-undo" onClick={() => engineRef.current?.undo()} title="Geri al">↶</button>
                {CATEGORIES.map((c) => (
                  <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => { setCat(c.key); setShelfOpen(true); }}>
                    {c.icon} {c.name}
                  </button>
                ))}
                <button className={cat === 'yuzey' ? 'on' : ''} onClick={() => { setCat('yuzey'); setShelfOpen(true); }}>🎨 Duvar & Zemin</button>
              </div>
              {shelfOpen && cat !== 'yuzey' && (
                <div className="hs-shelf-items">
                  {shelfItems.map((d) => (
                    <button key={d.k} className="hs-card" onClick={() => { const r = engineRef.current?.addItem(d.k, 0); if (r === 'limit') flash('Eşya sınırına ulaştın (300).'); }}>
                      <ItemThumb k={d.k} icon={d.icon} />
                      <span className="hs-card-name">{d.name}</span>
                      <PriceTag price={d.price} small />
                      {d.tints && <span className="hs-card-tints">{TINTS[d.tints].length} renk</span>}
                    </button>
                  ))}
                </div>
              )}
              {shelfOpen && cat === 'yuzey' && (
                <div className="hs-shelf-surfaces">
                  <div className="hs-surf-row">
                    <span className="hs-surf-label">Duvar</span>
                    {WALLS.map((w) => (
                      <button key={w.key} className={`hs-surf${design?.wall === w.key ? ' on' : ''}`} onClick={() => engineRef.current?.setWall(w.key)}>
                        <i style={{ background: w.swatch }} />
                        <span>{w.name}</span>
                        <PriceTag price={w.price} small />
                      </button>
                    ))}
                  </div>
                  <div className="hs-surf-row">
                    <span className="hs-surf-label">Zemin</span>
                    {FLOORS.map((f) => (
                      <button key={f.key} className={`hs-surf${design?.floor === f.key ? ' on' : ''}`} onClick={() => engineRef.current?.setFloor(f.key)}>
                        <i style={{ background: f.swatch }} />
                        <span>{f.name}</span>
                        <PriceTag price={f.price} small />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* GEZ MODU KONTROLLERİ */}
          {mode === 'walk' && (
            <>
              <Joystick onChange={(x, y) => engineRef.current?.setJoystick(x, y)} />
              <div className="hs-actions">
                {interact?.toggle && (
                  <button className="hs-act alt" onClick={() => engineRef.current?.interact('toggle')}>
                    <kbd>F</kbd> {interact.toggle}
                  </button>
                )}
                {interact?.sit && (
                  <button className="hs-act" onClick={() => engineRef.current?.interact('sit')}>
                    <kbd>E</kbd> {interact.sit}
                  </button>
                )}
              </div>
            </>
          )}

          {/* SOHBET */}
          <div className={`hs-chat${mode === 'build' && isOwner ? ' build' : ''}${chatExpanded ? ' expanded' : ''}`}>
            <div className="hs-chat-feed" onClick={() => setChatExpanded((v) => !v)}>
              {(chatExpanded ? messages : messages.slice(-4)).map((m) => (
                <div key={m.id} className={`hs-msg${m.uid === user.uid ? ' me' : ''}`}>
                  <b>{m.name}:</b> {m.text}
                </div>
              ))}
              {messages.length === 0 && <div className="hs-msg dim">Evdekilerle sohbet et 👋</div>}
            </div>
            <div className="hs-chat-row">
              <input
                value={chatText}
                maxLength={200}
                placeholder="Mesaj yaz…"
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              />
              <button onClick={sendChat} disabled={chatBusy || !chatText.trim()}>Gönder</button>
            </div>
          </div>

          {toast && <div className="hs-toast">{toast}</div>}

          {/* DAVET PANELİ */}
          {inviteOpen && (
            <div className="hs-modal-bg" onClick={() => setInviteOpen(false)}>
              <div className="hs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="hs-modal-head">
                  <b>👥 Eve Davet Et</b>
                  <button className="hs-x" onClick={() => setInviteOpen(false)}>✕</button>
                </div>
                <p className="hs-dim">Test modu: davet ettiğin oyuncu haritada <b>Ev</b>'e tıkladığında doğrudan senin evine girer.</p>
                <div className="hs-invite-row">
                  <input value={inviteName} placeholder="Oyuncu adı (tam)" onChange={(e) => setInviteName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && inviteName.trim()) doInvite({ name: inviteName.trim() }); }} />
                  <button disabled={inviteBusy || !inviteName.trim()} onClick={() => doInvite({ name: inviteName.trim() })}>Davet Et</button>
                </div>
                {inviteMsg && <p className={inviteMsg.ok ? 'hs-ok' : 'hs-err'}>{inviteMsg.text}</p>}

                <div className="hs-list-title">Davetliler ({guests.length})</div>
                {guests.length === 0 && <p className="hs-dim">Henüz kimse davetli değil.</p>}
                {guests.map((g) => {
                  const here = online.some((o) => o.uid === g.uid);
                  return (
                    <div key={g.uid} className="hs-person">
                      <span className={`hs-dot${here ? ' on' : ''}`} />
                      <span className="hs-person-name">{g.name}</span>
                      <em>{here ? 'evde' : 'dışarıda'}</em>
                      <button className="ghost" onClick={() => doUninvite(g.uid)}>Çıkar</button>
                    </div>
                  );
                })}

                {social.friends?.length > 0 && (
                  <>
                    <div className="hs-list-title">Arkadaşlarından seç</div>
                    {social.friends
                      .filter((f) => !guests.some((g) => g.uid === f.uid))
                      .slice(0, 30)
                      .map((f) => (
                        <div key={f.uid} className="hs-person">
                          <span className="hs-person-name">{f.name}</span>
                          <button disabled={inviteBusy} onClick={() => doInvite({ uid: f.uid })}>Davet</button>
                        </div>
                      ))}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
