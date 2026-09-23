// ÖNİZLEME test çubuğu (uygulamaya dahil DEĞİL): persona seçimi/düzenleme, sanal saat, zaman atlatma,
// test dünyası sıfırlama, canlıya açma/kapatma. SADECE test dünyasını etkiler
// (sunucu zaman ofsetini canlı dünyada asla uygulamaz).
import { useEffect, useMemo, useState } from 'react';
import { limit, orderBy, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../src/firebase';
import { useDocData, useQueryData, fmtDateTime } from '../src/components/Gangs/GangContext';
import { friendlyError } from '../src/components/Gangs/gangApi';
import { Btn, Confirm, Sheet } from '../src/components/Gangs/ui';
import { fmt } from '../src/components/Gangs/gangConstants';

// Sadece önizleme: uygulamada admin paneli yok (v32). Sahte arka uçtaki
// handleAdmin'e gider; canlı projede gangAdmin fonksiyonu export edilmez.
const adminFn = httpsCallable(functions, 'gangAdmin');
async function callGangAdmin(action, data = {}) {
  const res = await adminFn({ action, ...data });
  return res.data;
}

function PersonaEditor({ persona, onClose, onSaved }) {
  const [f, setF] = useState({
    displayName: persona?.displayName || '',
    gold: persona?.gold ?? 1_000_000,
    power: persona?.power ?? 20_000,
    reputation: persona?.reputation ?? 60,
    isPolice: Boolean(persona?.isPolice),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (persona?.id) await callGangAdmin('updatePersona', { id: persona.id, persona: f });
      else {
        const r = await callGangAdmin('createPersona', { persona: f });
        onSaved?.(r.id);
      }
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const num = (k) => (e) => setF({ ...f, [k]: Number(String(e.target.value).replace(/\D/g, '')) || 0 });
  return (
    <Sheet title={persona?.id ? 'Personayı düzenle' : 'Yeni persona'} icon="🧪" onClose={onClose}>
      <label className="gx-field">
        Ad
        <input className="gx-input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      </label>
      <div className="gx-grid2">
        <label className="gx-field">
          🪙 Altın
          <input className="gx-input" inputMode="numeric" value={f.gold} onChange={num('gold')} />
        </label>
        <label className="gx-field">
          💪 Güç
          <input className="gx-input" inputMode="numeric" value={f.power} onChange={num('power')} />
        </label>
        <label className="gx-field">
          ⭐ Saygınlık (0-100)
          <input className="gx-input" inputMode="numeric" value={f.reputation} onChange={num('reputation')} />
        </label>
        <label className="gx-field gx-field-check">
          <input type="checkbox" checked={f.isPolice} onChange={(e) => setF({ ...f, isPolice: e.target.checked })} /> 👮 Polis
        </label>
      </div>
      {err && <p className="gx-err-text">{err}</p>}
      <Btn block onClick={save} busy={busy}>
        Kaydet
      </Btn>
    </Sheet>
  );
}

export default function TestBar({ persona, onPersona, onExit, config }) {
  const { data: world } = useDocData('gangWorlds/test');
  const { docs: personas } = useQueryData('gangWorlds/test/players', () => [orderBy('createdAtMs', 'asc'), limit(40)], 'players');
  // tek alanlı eşitlik sorgusu (composite index gerektirmez), sıralama istemcide
  const { docs: inbox } = useQueryData(persona ? 'gangWorlds/test/inbox' : null, () => [where('to', '==', persona), limit(100)], `inbox_${persona}`);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [open, setOpen] = useState(true);
  const [showInbox, setShowInbox] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!persona && personas.length) onPersona(personas[0].id);
  }, [persona, personas, onPersona]);

  const vNow = now + Number(world?.clockOffsetMs || 0);
  const me = useMemo(() => personas.find((p) => p.id === persona) || null, [personas, persona]);
  const myInbox = useMemo(() => [...inbox].sort((a, b) => b.atMs - a.atMs), [inbox]);

  const act = async (key, action, data = {}, okText) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await callGangAdmin(action, data);
      const ticks = r?.clock?.ticks?.length ? ` · ${r.clock.ticks.length} gün işlendi` : '';
      setMsg({ ok: true, text: `${okText || 'Tamam'}${ticks}` });
      return r;
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`gx-testbar${open ? '' : ' closed'}`}>
      <div className="gx-testbar-top">
        <span className="gx-test-badge">🧪 TEST</span>
        <span className="gx-vclock" title="Sanal saat (sadece test dünyası)">
          🕒 {fmtDateTime(vNow)}
        </span>
        <button className="gx-x" onClick={() => setOpen(!open)} aria-label="Aç/kapat">
          {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <>
          <div className="gx-testbar-row">
            <select className="gx-select" value={persona || ''} onChange={(e) => onPersona(e.target.value)}>
              {personas.length === 0 && <option value="">— persona yok —</option>}
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isPolice ? '👮 ' : ''}
                  {p.displayName}
                </option>
              ))}
            </select>
            <Btn small kind="ghost" onClick={() => setEdit(me || {})} disabled={!me}>
              ✏️
            </Btn>
            <Btn small kind="ghost" onClick={() => setEdit({})}>
              ＋
            </Btn>
            {personas.length === 0 && (
              <Btn small busy={busy === 'qs'} onClick={() => act('qs', 'quickSetup', {}, '8 persona hazır')}>
                ⚡ Hızlı kurulum
              </Btn>
            )}
          </div>
          {me && (
            <div className="gx-testbar-stats">
              <span>🪙 {fmt(me.gold)}</span>
              <span>💪 {fmt(me.power)}</span>
              <span>⭐ {me.reputation}</span>
              <button className="gx-link" onClick={() => setShowInbox(true)}>
                ✉️ {myInbox.length}
              </button>
            </div>
          )}
          <div className="gx-testbar-row gx-time-row">
            <Btn small kind="ghost" busy={busy === 'h1'} onClick={() => act('h1', 'advanceTime', { hours: 1 }, '+1 saat')}>
              +1s
            </Btn>
            <Btn small kind="ghost" busy={busy === 'h6'} onClick={() => act('h6', 'advanceTime', { hours: 6 }, '+6 saat')}>
              +6s
            </Btn>
            <Btn small kind="ghost" busy={busy === 't12'} onClick={() => act('t12', 'jumpToHour', { hour: 12 }, '12:00')}>
              12:00
            </Btn>
            <Btn small kind="ghost" busy={busy === 't18'} onClick={() => act('t18', 'jumpToHour', { hour: 18 }, '18:00')}>
              18:00
            </Btn>
            <Btn small busy={busy === 'mid'} onClick={() => act('mid', 'jumpToMidnight', {}, '00:00 işlendi')}>
              ⏭ 00:00
            </Btn>
            <Btn small kind="ghost" busy={busy === 'd30'} onClick={() => act('d30', 'advanceTime', { hours: 24 * 30 }, '+30 gün')}>
              +30g
            </Btn>
          </div>
          <div className="gx-testbar-row">
            <Btn small kind="danger" onClick={() => setConfirm('reset')}>
              🧹 Test verisini sil
            </Btn>
            <Btn small kind={config?.liveOpen ? 'danger' : 'ghost'} onClick={() => setConfirm(config?.liveOpen ? 'close' : 'open')}>
              {config?.liveOpen ? '🔴 Canlıyı kapat' : '🟢 Canlıya aç'}
            </Btn>
            <Btn
              small
              kind="ghost"
              onClick={async () => {
                await callGangAdmin('lock').catch(() => {});
                onExit();
              }}
            >
              🚪 Çık
            </Btn>
          </div>
          {msg && <p className={msg.ok ? 'gx-ok-text' : 'gx-err-text'}>{msg.text}</p>}
        </>
      )}
      {edit && <PersonaEditor persona={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={(id) => onPersona(id)} />}
      {showInbox && (
        <Sheet title={`${me?.displayName || ''} — bildirimler`} icon="✉️" onClose={() => setShowInbox(false)}>
          {myInbox.length === 0 && <p className="dim">Bildirim yok.</p>}
          {myInbox.map((m) => (
            <div key={m.id} className="gx-inbox-item">
              <span className="dim">{fmtDateTime(m.atMs)}</span>
              <span>{m.text}</span>
            </div>
          ))}
        </Sheet>
      )}
      {confirm === 'reset' && (
        <Confirm
          icon="🧹"
          danger
          title="Test dünyası tamamen silinsin mi?"
          lines={['Tüm test çeteleri, personalar, savaşlar, tırlar, oylar ve İstihbarat test verisi silinir.', 'Sanal saat sıfırlanır.', 'Canlı dünya ve oyuncu hesapları ETKİLENMEZ.']}
          confirmLabel="Sil"
          busy={busy === 'reset'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await act('reset', 'resetTestWorld', { confirm: 'SIFIRLA' }, 'Test dünyası sıfırlandı');
            onPersona(null);
            setConfirm(null);
          }}
        />
      )}
      {confirm === 'open' && (
        <Confirm
          icon="🟢"
          title="Çeteler oyunculara açılsın mı?"
          lines={[
            config?.liveWorldId ? 'Önceki canlı dünya bakımdaysa "Tekrar aç" onu açar.' : 'YEPYENİ ve BOŞ bir canlı dünya oluşturulur — sistem herkes için sıfırdan başlar.',
            'Test verisi canlıya taşınmaz.',
          ]}
          confirmLabel={config?.liveWorldId ? 'Tekrar aç' : 'Sıfırdan aç'}
          busy={busy === 'open'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await act('open', 'openLive', config?.liveWorldId ? { mode: 'reopen' } : { mode: 'fresh', confirm: 'CANLIYA AÇ' }, 'Canlı açık');
            setConfirm(null);
          }}
        >
          {config?.liveWorldId && (
            <Btn
              kind="danger"
              small
              block
              busy={busy === 'fresh'}
              onClick={async () => {
                await act('fresh', 'openLive', { mode: 'fresh', confirm: 'CANLIYA AÇ' }, 'Yeni canlı dünya açıldı');
                setConfirm(null);
              }}
            >
              ♻️ Yepyeni dünya ile aç (eski canlı veriler devre dışı)
            </Btn>
          )}
        </Confirm>
      )}
      {confirm === 'close' && (
        <Confirm
          icon="🔴"
          danger
          title="Çeteler oyunculara kapatılsın mı?"
          lines={['Oyuncular "Tadilatta" görür, veriler silinmez.']}
          confirmLabel="Kapat"
          busy={busy === 'close'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await act('close', 'closeLive', {}, 'Canlı kapandı');
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
