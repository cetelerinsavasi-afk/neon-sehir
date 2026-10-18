import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { shopAction, createSixtagramPost } from '../../services/gameActions';
import { bizErrText } from '../../lib/bizErrors';
import { useNetCredits } from '../../hooks/useVenueData';
import { downloadSongMp3 } from '../../lib/songExport';
import { emptySong, songHasNotes, sanitizeSong } from '../../../functions/songData.js';
import { SONG_PROJECT_TTL_MS, SONG_PROJECT_MAX } from '../../../functions/homeOfficeData.js';
import SongMaker from '../Sixtagram/SongMaker';
import './HomeOffice.css';

// =============================================================================
// v93 — Müzik Stüdyosu: mikser konsolunda süre başlatılınca açılır.
//   1) Projeler: yeni proje ya da kayıtlı projeye devam (her stüdyoda açılır;
//      7 gün dokunulmayan proje silinir). Projeden MP3 indir / sil.
//   2) Düzenleyici (Beat Atölyesi): her değişiklik birkaç sn içinde otomatik
//      kaydedilir; süre/altın bitince ya da uygulama kapanırken de kaydedilir.
//      Sixtagram'da paylaş · MP3 indir.
//   Dakika ücreti internet kafe gibi: süre bitmeden yeni dakika çekilir (netTick).
// =============================================================================
const AUTOSAVE_MS = 2500;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const daysLeft = (ms) => Math.max(0, Math.ceil((Number(ms || 0) + SONG_PROJECT_TTL_MS - Date.now()) / 864e5));
function ago(ms) {
  const d = Math.max(0, Date.now() - Number(ms || 0));
  if (d < 60_000) return 'az önce';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} dk önce`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} sa önce`;
  return `${Math.floor(d / 86_400_000)} gün önce`;
}

function useMyProjects(enabled) {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!user || !enabled) return undefined;
    return onSnapshot(
      query(collection(db, 'songProjects'), where('uid', '==', user.uid), limit(SONG_PROJECT_MAX + 5)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.updatedAtMs - a.updatedAtMs)),
      () => setRows([])
    );
  }, [user, enabled]);
  return rows;
}

// v99 — telefonda yedek taslak: kayıt başarısız olsa da çalışma kaybolmaz
const DRAFT_KEY = 'studioDraft_v1';
const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && d.song && typeof d.song === 'object' ? d : null;
  } catch {
    return null;
  }
};
const writeDraft = (d) => {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* depolama kapalı */
  }
};

export default function StudioScreen({ houseId, price, isOwner, onClose, flash }) {
  const [phase, setPhase] = useState('pick'); // 'pick' | 'edit'
  const projects = useMyProjects(true);
  const [editing, setEditing] = useState(null); // { projectId, song, key }
  const [save, setSave] = useState('saved'); // saved | dirty | saving | error
  const [saveErr, setSaveErr] = useState('');
  const [publish, setPublish] = useState(null); // { text, busy, err, done }
  const [dl, setDl] = useState(null); // indirilen proje kimliği / 'cur'
  const [delAsk, setDelAsk] = useState(null);
  const [stopped, setStopped] = useState(null);
  const [draft, setDraft] = useState(readDraft);

  const projectIdRef = useRef(null);
  const latestRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(null);
  const timerRef = useRef(0);
  const closedRef = useRef(false);
  const getSongRef = useRef(null);
  const credits = useNetCredits();
  const creditRef = useRef(0);
  creditRef.current = Number(credits.find((r) => r.houseId === houseId)?.creditUntilMs || 0);

  // --- kayıt (tek seferde bir istek; arada gelen değişiklik sırada bekler) ---------------
  const doSave = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (savingRef.current) {
      await savingRef.current.catch(() => {});
      if (!dirtyRef.current) return true;
    }
    if (!dirtyRef.current || !latestRef.current) return true;
    dirtyRef.current = false;
    const song = latestRef.current;
    setSave('saving');
    const p = shopAction({ op: 'songSave', houseId, projectId: projectIdRef.current, song: { ...song, type: 'song', v: 1 } });
    savingRef.current = p;
    try {
      const r = await p;
      projectIdRef.current = r.projectId;
      if (!dirtyRef.current) writeDraft(null);
      setSave(dirtyRef.current ? 'dirty' : 'saved');
      setSaveErr('');
      return true;
    } catch (e) {
      dirtyRef.current = true;
      setSave('error');
      setSaveErr(bizErrText(e));
      return false;
    } finally {
      savingRef.current = null;
    }
  }, [houseId]);
  const onSongChange = useCallback(
    (song) => {
      latestRef.current = song;
      dirtyRef.current = true;
      writeDraft({ song, projectId: projectIdRef.current, ts: Date.now() });
      setSave('dirty');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => doSave(), AUTOSAVE_MS);
    },
    [doSave]
  );
  const flush = useCallback(async () => {
    if (getSongRef.current && phase === 'edit') latestRef.current = getSongRef.current();
    return doSave();
  }, [doSave, phase]);

  // uygulama arka plana atılırken / sayfa kapanırken kaydet
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  // --- dakika nabzı: süre bitmek üzereyken yeni dakika; altın biterse kaydet + kapat ---
  const closeWith = useCallback(
    async (msg) => {
      if (closedRef.current) return;
      closedRef.current = true;
      await flush();
      onClose?.(msg);
    },
    [flush, onClose]
  );
  useEffect(() => {
    let busy = false;
    let last = Date.now();
    const iv = setInterval(async () => {
      if (busy || closedRef.current) return;
      const t = Date.now();
      // süre bitmek üzereyken ya da 20 sn'de bir (sunucu sadece süre bitiyorsa yeni dakikayı çeker)
      if (creditRef.current - t > 4000 && t - last < 20_000) return;
      busy = true;
      last = t;
      try {
        const r = await shopAction({ op: 'netTick', houseId });
        if (r.stopped && r.stopped !== 'none') {
          setStopped(r.stopped);
          await closeWith(r.stopped === 'gold' ? '💰 Altının bitti — projen kaydedildi, stüdyo kapandı.' : '🎛️ Stüdyo süren bitti — projen kaydedildi.');
        } else if (r.charged) flash?.(`🎛️ Yeni dakika: −${fmt(r.charged)} altın`);
      } catch {
        /* bir sonraki nabızda */
      } finally {
        busy = false;
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [houseId, closeWith, flash]);
  // kapanınca konsoldan kalk
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      shopAction({ op: 'netLeave', houseId }).catch(() => {});
    },
    [houseId]
  );

  const openProject = (p, draftSong = null) => {
    projectIdRef.current = p?.id || null;
    latestRef.current = null;
    dirtyRef.current = false;
    if (draftSong) {
      // yedek taslaktan devam: ekrandaki hâl taslak, kayıt arka planda denenir
      const song = sanitizeSong(draftSong, true).song || emptySong();
      setEditing({ song, key: `draft_${Date.now()}` });
      setPhase('edit');
      latestRef.current = song;
      dirtyRef.current = true;
      setSave('dirty');
      doSave();
      return;
    }
    const song = p ? sanitizeSong(p.song, true).song || emptySong() : { ...emptySong(), title: '' };
    if (p && !song.title) song.title = p.title || '';
    setEditing({ song, key: `${p?.id || 'new'}_${Date.now()}` });
    setSave(p ? 'saved' : 'dirty');
    setPhase('edit');
    if (!p) {
      // yeni proje hemen kaydedilir (sonradan devam edebilsin)
      latestRef.current = song;
      dirtyRef.current = true;
      doSave();
    }
  };

  const download = async (song, title, key) => {
    if (!songHasNotes(song)) {
      flash?.('Boş proje indirilemez — önce birkaç kutu doldur.');
      return;
    }
    setDl(key);
    try {
      const r = await downloadSongMp3(song, title);
      flash?.(`⬇️ ${r.name} indirildi.`);
    } catch (e) {
      flash?.(e?.message || 'MP3 oluşturulamadı.');
    } finally {
      setDl(null);
    }
  };

  const doPublish = async () => {
    const song = getSongRef.current?.() || latestRef.current;
    if (!song || !songHasNotes(song)) {
      setPublish((p) => ({ ...p, err: 'Boş şarkı paylaşılamaz — önce birkaç kutu doldur.' }));
      return;
    }
    setPublish((p) => ({ ...p, busy: true, err: '' }));
    latestRef.current = song;
    // v99 — paylaşım kayda bağlı değil: ekrandaki son hâl doğrudan gönderilir,
    // paylaşılan şarkının projesi sunucuda silinir.
    clearTimeout(timerRef.current);
    if (savingRef.current) await savingRef.current.catch(() => {});
    try {
      await createSixtagramPost(String(publish?.text || '').trim(), {
        type: 'song',
        houseId,
        song: { ...song, type: 'song', v: 1 },
        ...(projectIdRef.current ? { projectId: projectIdRef.current } : {}),
      });
      clearTimeout(timerRef.current);
      projectIdRef.current = null;
      dirtyRef.current = false;
      latestRef.current = null;
      writeDraft(null);
      setDraft(null);
      setSave('saved');
      setPublish((p) => ({ ...p, busy: false, done: true }));
    } catch (e) {
      setPublish((p) => ({ ...p, busy: false, err: e?.message || 'Paylaşılamadı.' }));
    }
  };

  const saveChip = (
    <span className={`ho-save ${save}`} title={saveErr || ''}>
      {save === 'saving' ? '⏳ Kaydediliyor' : save === 'dirty' ? '● Kaydedilecek' : save === 'error' ? '⚠️ Kaydedilemedi' : '✓ Kaydedildi'}
    </span>
  );

  const halt = (e) => e.stopPropagation();

  if (phase === 'edit' && editing) {
    return (
      <>
        <SongMaker
          key={editing.key}
          initial={editing.song}
          onChange={onSongChange}
          getSongRef={getSongRef}
          title="🎛️ Müzik Stüdyosu"
          subtitle={isOwner ? 'Kendi stüdyon: ücretsiz · otomatik kaydedilir' : `${fmt(price)} altın / dakika · otomatik kaydedilir`}
          topRight={saveChip}
          onCancel={() => closeWith(null)}
          toolbar={
            <div className="ho-studio-bar">
              <button className="ho-sbtn pub" onClick={() => setPublish({ text: '', busy: false, err: '', done: false })}>
                📤 Sixtagram'da paylaş
              </button>
              <button className="ho-sbtn" disabled={dl === 'cur'} onClick={() => { const s = getSongRef.current?.(); download(s, s?.title, 'cur'); }}>
                {dl === 'cur' ? '⏳ Hazırlanıyor…' : '⬇️ MP3 indir'}
              </button>
              <button
                className="ho-sbtn"
                onClick={async () => {
                  await flush();
                  setDraft(readDraft());
                  setPhase('pick');
                  setEditing(null);
                }}
              >
                📁 Projeler
              </button>
              {save === 'error' && saveErr && <p className="ho-err">{saveErr}</p>}
            </div>
          }
        />
        {publish &&
          createPortal(
            <div className="ho-modal-bg" onClick={() => !publish.busy && setPublish(null)} onPointerDown={halt}>
              <div className="ho-modal" onClick={halt}>
                {publish.done ? (
                  <>
                    <h3>🎉 Şarkın Sixtagram'da!</h3>
                    <button
                      className="ho-btn gold"
                      onClick={() => {
                        setPublish(null);
                        setEditing(null);
                        setPhase('pick');
                      }}
                    >
                      Tamam
                    </button>
                  </>
                ) : (
                  <>
                    <h3>📤 Sixtagram'da paylaş</h3>
                    <textarea className="ho-input" maxLength={280} rows={3} placeholder="Bir şeyler yaz (isteğe bağlı)" value={publish.text} onChange={(e) => setPublish((p) => ({ ...p, text: e.target.value }))} />
                    {publish.err && <p className="ho-err">{publish.err}</p>}
                    <div className="ho-row">
                      <button className="ho-btn ghost" disabled={publish.busy} onClick={() => setPublish(null)}>
                        Vazgeç
                      </button>
                      <button className="ho-btn gold" disabled={publish.busy} onClick={doPublish}>
                        {publish.busy ? 'Paylaşılıyor…' : 'Paylaş'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  // --- proje seçimi ---------------------------------------------------------------------
  return createPortal(
    <div className="ho-studio" role="dialog" aria-label="Müzik stüdyosu" onClick={halt} onPointerDown={halt}>
      <div className="ho-studio-top">
        <button className="ho-x" onClick={() => closeWith(null)} aria-label="Kapat">
          ✕
        </button>
        <div className="ho-studio-title">
          <b>🎛️ Müzik Stüdyosu</b>
          <small>{isOwner ? 'Kendi stüdyon: ücretsiz' : `${fmt(price)} altın / dakika — süre işliyor`}</small>
        </div>
      </div>
      <div className="ho-studio-body">
        {draft && (
          <button
            className="ho-new ho-draft"
            onClick={() => {
              const p = projects?.find((x) => x.id === draft.projectId) || null;
              setDraft(null);
              openProject(p, draft.song);
            }}
          >
            <span>↺</span>
            <b>Kaydedilmemiş çalışman</b>
            <small>Kaldığın yerden devam et</small>
          </button>
        )}
        <button className="ho-new" onClick={() => openProject(null)} disabled={projects !== null && projects.length >= SONG_PROJECT_MAX}>
          <span>＋</span>
          <b>Yeni proje</b>
          <small>{projects !== null && projects.length >= SONG_PROJECT_MAX ? `En fazla ${SONG_PROJECT_MAX} proje — eskisini sil` : 'Boş bir şarkıyla başla'}</small>
        </button>
        <p className="ho-sec">Projelerim {projects ? `(${projects.length}/${SONG_PROJECT_MAX})` : ''}</p>
        {projects === null && <p className="ho-dim">Yükleniyor…</p>}
        {projects?.length === 0 && <p className="ho-dim">Henüz projen yok.</p>}
        {projects?.map((p) => (
          <div key={p.id} className="ho-proj">
            <button className="ho-proj-main" onClick={() => openProject(p)}>
              <b>🎵 {p.title || 'İsimsiz şarkı'}</b>
              <small>
                {ago(p.updatedAtMs)} değişti · {daysLeft(p.updatedAtMs)} gün sonra silinir
              </small>
            </button>
            <button className="ho-icon ho-del" disabled={dl === p.id} title="MP3 indir" onClick={() => download(sanitizeSong(p.song, true).song || emptySong(), p.title, p.id)}>
              {dl === p.id ? '⏳' : '⬇️'}
              <small>MP3</small>
            </button>
            <button className="ho-icon danger ho-del" title="Projeyi sil" onClick={() => setDelAsk(p)}>
              🗑️
              <small>Sil</small>
            </button>
          </div>
        ))}
        <p className="ho-dim ho-foot">Yaptığın parçaları ⬇️ ile indirebilirsin.</p>
        {stopped && <p className="ho-err">Süre bitti.</p>}
      </div>
      {delAsk && (
        <div className="ho-modal-bg" onClick={() => setDelAsk(null)}>
          <div className="ho-modal" onClick={halt}>
            <h3>🗑️ "{delAsk.title || 'İsimsiz şarkı'}" silinsin mi?</h3>
            <div className="ho-row">
              <button className="ho-btn ghost" onClick={() => setDelAsk(null)}>
                Vazgeç
              </button>
              <button
                className="ho-btn danger"
                onClick={async () => {
                  const id = delAsk.id;
                  setDelAsk(null);
                  try {
                    await shopAction({ op: 'songDelete', projectId: id });
                  } catch (e) {
                    flash?.(bizErrText(e));
                  }
                }}
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
