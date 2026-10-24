// v127 — Başkanlık › Gazete: başkan ve yardımcılar yarının gazetesine TEK yazı
// yazar (yenisi eskisinin yerine geçer); 00:00'da basılır. Diğer kadro okur.
import { useState } from 'react';
import { Btn, Confirm } from '../Gangs/ui';
import { BELEDIYE } from '../../../functions/belediye.js';
import { useBelediye } from './BelediyeContext';

export default function GazeteYazi() {
  const { panel, seat, uid, run, busy, patchPanel } = useBelediye();
  const [text, setText] = useState('');
  const [ask, setAsk] = useState(false);
  const can = BELEDIYE.GAZETE_SEATS.includes(seat);
  const d = panel?.gazete || null;
  const send = async () => {
    setAsk(false);
    const r = await run('gazeteYaz', { text: text.trim() }, { success: "📰 Yazın 00:00'da gazetede." });
    if (r?.draft) {
      patchPanel({ gazete: r.draft });
      setText('');
    }
  };
  const del = async () => {
    const r = await run('gazeteSil', {}, { success: 'Yazı silindi.' });
    if (r) patchPanel({ gazete: null });
  };
  const len = text.trim().length;
  return (
    <div className="gx-card bd-gz">
      {d ? (
        <div className="bd-gz-draft">
          <small className="dim">
            Yarının gazetesinde · {d.byTitle} · <b>{d.byName}</b>
          </small>
          <p>{d.text}</p>
          {can && (
            <button className="gx-link bd-gz-del" disabled={Boolean(busy)} onClick={del}>
              🗑️ Sil
            </button>
          )}
        </div>
      ) : (
        <p className="dim bd-note">Yarının gazetesi için henüz yazı yok.</p>
      )}
      {can && (
        <>
          <textarea className="gx-input" rows={4} maxLength={BELEDIYE.GAZETE_MAX} placeholder="Halka sesleniş… (00:00'da gazetede)" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="bd-gz-foot">
            <small className="dim">
              {len}/{BELEDIYE.GAZETE_MAX}
            </small>
            <Btn small busy={busy === 'gazeteYaz'} disabled={len < BELEDIYE.GAZETE_MIN} onClick={() => (d && d.byUid !== uid ? setAsk(true) : send())}>
              📰 Gazeteye gönder
            </Btn>
          </div>
        </>
      )}
      {ask && (
        <Confirm icon="📰" title="Mevcut yazı silinsin mi?" lines={[`${d.byName} yazdığı yazı silinecek; gazetede tek yazı yayınlanır.`]} confirmLabel="Sil ve gönder" onCancel={() => setAsk(false)} onConfirm={send} />
      )}
    </div>
  );
}
