// v127 — ŞİKÂYET KUTUSU (Belediye › sağ üst 📣). Herkes yazar (günde 3) ve
// beğenir; en çok beğenilen gece gazetede "Halkın Sesi" olur; 7 günde silinir.
// Okuma: son 50 şikâyet (tek dinleyici, sadece kutu açıkken).
import { useState } from 'react';
import { limit, orderBy } from 'firebase/firestore';
import { useQueryData } from '../Gangs/GangContext';
import { Btn, Chips, Sheet } from '../Gangs/ui';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { BELEDIYE } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';
import { useTick } from './belediyeUi';

const ago = (ms, now) => {
  const m = Math.max(0, Math.floor((now - ms) / 60_000));
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} sa` : `${Math.floor(h / 24)} gün`;
};

export default function Sikayet({ onClose }) {
  const { uid, run, busy } = useBelediye();
  const now = useTick(60_000);
  const { docs, loading } = useQueryData('belediyeSikayet', () => [orderBy('createdAtMs', 'desc'), limit(50)], 'sk');
  const [sort, setSort] = useState('top');
  const [text, setText] = useState('');
  const [rep, setRep] = useState(null);
  const list = docs.filter((d) => !d.hidden && Number(d.expiresAtMs || 0) > now);
  const shown = sort === 'top' ? [...list].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0) || b.createdAtMs - a.createdAtMs) : list;
  const send = async () => {
    const r = await run('sikayet', { text: text.trim() }, { success: '📣 Şikâyetin kutuya atıldı.' });
    if (r) setText('');
  };
  const len = text.trim().length;
  return (
    <Sheet title="Şikâyet Kutusu" icon="📣" onClose={onClose}>
      <p className="dim bd-note">En çok beğenilen şikâyet gece gazetede yayınlanır. Şikâyetler 7 gün sonra silinir.</p>
      <textarea className="gx-input" rows={3} maxLength={BELEDIYE.SIKAYET_MAX} placeholder="Belediyeye şikâyetin ne?" value={text} onChange={(e) => setText(e.target.value)} />
      <Btn block busy={busy === 'sikayet'} disabled={len < BELEDIYE.SIKAYET_MIN} onClick={send}>
        Şikâyet et
      </Btn>
      <Chips
        options={[
          { id: 'top', label: 'En çok beğenilen', icon: '🔥' },
          { id: 'new', label: 'En yeni', icon: '🕘' },
        ]}
        value={sort}
        onChange={setSort}
      />
      {loading ? (
        <div className="gx-loading">Yükleniyor…</div>
      ) : shown.length === 0 ? (
        <p className="dim bd-note">Henüz şikâyet yok.</p>
      ) : (
        <div className="bd-sk-list">
          {shown.map((d) => {
            const mine = d.uid === uid;
            const liked = Boolean(d.likes?.[uid]);
            return (
              <div key={d.id} className="bd-sk">
                <AvatarSvg avatar={d.avatar} size={32} rounded />
                <div className="bd-sk-main">
                  <small className="dim">
                    <b>{d.name}</b> · {ago(d.createdAtMs, now)}
                    {d.featuredDay ? ' · 📰 gazetede' : ''}
                  </small>
                  <p>{d.text}</p>
                  <div className="bd-sk-acts">
                    {mine ? (
                      <button className="gx-link" disabled={Boolean(busy)} onClick={() => run('sikayetSil', { id: d.id }, { key: `sil_${d.id}`, success: 'Silindi.' })}>
                        🗑️ Sil
                      </button>
                    ) : (
                      <button className="gx-link dim" onClick={() => setRep(d)}>
                        ⚑ Bildir
                      </button>
                    )}
                  </div>
                </div>
                <button className={`bd-sk-like${liked ? ' on' : ''}`} disabled={mine || Boolean(busy)} onClick={() => run('sikayetBegen', { id: d.id }, { key: `like_${d.id}`, silent: false })} aria-label="Beğen">
                  {liked ? '❤️' : '🤍'}
                  <span>{d.likeCount || 0}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {rep && (
        <ReportBlockSheet targetUid={rep.uid} targetName={rep.name || 'Oyuncu'} canBlock={false} items={[{ label: 'Şikâyeti bildir', targetType: 'belediyeSikayet', targetPath: `belediyeSikayet/${rep.id}`, preview: rep.text }]} onClose={() => setRep(null)} />
      )}
    </Sheet>
  );
}
