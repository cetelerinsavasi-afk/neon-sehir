// v127 — Belediye sohbetleri (kanal: 'genel' = tüm kadro · 'koord' = kadro +
// polisin en üst 3 rütbesi). Okuma: belediyeChat_{kanal} son 60 mesaj.
// Yazma: belediyeAction { op: 'chat' } (sunucu yetki + küfür + hız denetimi).
// Polis Teşkilatı sohbetinde de (Gangs/tabs/ChatTab — "🏛️ Belediye") kullanılır.
import { useEffect, useRef, useState } from 'react';
import { limit, orderBy } from 'firebase/firestore';
import { useQueryData, fmtClock } from '../Gangs/GangContext';
import { friendlyError } from '../Gangs/gangApi';
import { Btn } from '../Gangs/ui';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import ActionMenu from '../ActionMenu/ActionMenu';
import ReportBlockSheet from '../ReportBlockSheet/ReportBlockSheet';
import { copyText, useLongPress } from '../ActionMenu/actionMenuUtils';
import { belediyeAction } from '../../services/gameActions';
import { useAuth } from '../../contexts/AuthContext';
import { markBelediyeChatSeen } from '../../hooks/useBelediyeChatUnread';
import { BELEDIYE } from '../../../functions/belediye.js';
import '../Gangs/Gangs.css';
import './Belediye.css';

function Msg({ m, mine, onMenu }) {
  const press = useLongPress(() => onMenu(m));
  const polis = m.authorKind === 'polis';
  return (
    <div className={`gx-msg-wrap${mine ? ' mine' : ''}`}>
      {!mine && <span className="gx-msg-avatar">{polis ? <span className="bd-polis-av">🚓</span> : <AvatarSvg avatar={m.avatar} size={30} rounded />}</span>}
      <div className={`gx-msg${mine ? ' mine' : ''}`} {...press}>
        {!mine && (
          <span className={`gx-msg-author${polis ? ' bd-polis' : ''}`}>
            {m.name} <small className="dim">· {m.title}</small>
          </span>
        )}
        <span className="gx-msg-text">{m.text}</span>
        <span className="gx-msg-time">{fmtClock(m.createdAtMs)}</span>
      </div>
    </div>
  );
}

// isMine(m): mesaj bu oyuncunun mu (kadro: uid · polis: rosterId)
export default function BelediyeChat({ channel, isMine, canWrite = true }) {
  const coll = `belediyeChat_${channel === 'koord' ? 'koord' : 'genel'}`;
  const { docs } = useQueryData(coll, () => [orderBy('createdAtMs', 'desc'), limit(60)], coll);
  const msgs = [...docs].reverse();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [reportOf, setReportOf] = useState(null);
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [docs.length, coll]);
  // v127: bu kanal görüldü → bildirim noktası söner
  const { user } = useAuth();
  const latestMs = docs[0]?.createdAtMs || 0;
  useEffect(() => {
    markBelediyeChatSeen(user?.uid, channel === 'koord' ? 'koord' : 'genel', latestMs);
  }, [user?.uid, channel, latestMs]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr('');
    try {
      await belediyeAction({ op: 'chat', channel, text: t });
      setText('');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gx-chat">
      <div className="gx-chat-list" ref={listRef}>
        {msgs.length === 0 && <p className="dim gx-center-text">Henüz mesaj yok.</p>}
        {msgs.map((m) => {
          const mine = isMine(m);
          if (m.hidden && !mine)
            return (
              <div key={m.id} className="gx-chat-system gx-msg-muted">
                {m.hiddenBy === 'moderator' ? '🛡️ Bu mesaj moderasyon ekibi tarafından kaldırıldı.' : '🚩 Bu mesaj şikâyetler nedeniyle incelemeye alındı.'}
              </div>
            );
          return <Msg key={m.id} m={m} mine={mine} onMenu={setMenuFor} />;
        })}
      </div>
      {menuFor && (
        <ActionMenu
          title={`${menuFor.name || 'Oyuncu'}: “${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          actions={[
            { key: 'copy', icon: '📋', label: 'Kopyala', onClick: () => copyText(menuFor.text || '') },
            ...(!isMine(menuFor) ? [{ key: 'report', icon: '⚑', label: 'Bildir', subtle: true, onClick: () => setReportOf(menuFor) }] : []),
          ]}
        />
      )}
      {reportOf && (
        <ReportBlockSheet
          targetUid={reportOf.uid || null}
          targetName={reportOf.name || 'Oyuncu'}
          canBlock={false}
          items={[{ label: 'Mesajı bildir', targetType: 'belediyeChat', targetPath: `${coll}/${reportOf.id}`, preview: reportOf.text }]}
          onClose={() => setReportOf(null)}
        />
      )}
      {err && <p className="gx-err-text">{err}</p>}
      {canWrite ? (
        <div className="gx-chat-input">
          <input className="gx-input" value={text} maxLength={BELEDIYE.CHAT_MAX} placeholder="Mesaj yaz…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Btn onClick={send} busy={busy} disabled={!text.trim()}>
            ➤
          </Btn>
        </div>
      ) : null}
    </div>
  );
}
