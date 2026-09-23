// SOHBET
//  Çete: Genel (çete içi) · Yönetim (7 rütbeli) · Tüm Çeteler (tüm çetelerin
//  rütbelileri yazar, tüm çete üyeleri okur). Normal üye 2, rütbeli 3 sohbet
//  görür. Çete sohbetinde avatar görünür.
//  İstihbarat: Genel (tüm üyeler) · Rütbeliler (Başkan, Şef, Uzman). Sadece kod
//  adı görünür. İstihbarat tüm çetelerin sohbetini görmez.
//  Katılmadan önceki mesajlar görünmez.
import { useEffect, useRef, useState } from 'react';
import { limit, orderBy, where } from 'firebase/firestore';
import { fmtClock, useGang, useGangAction, useQueryData } from '../GangContext';
import { Btn, Chips, Logo } from '../ui';
import { GANG_RULES, RANK_ICONS, atLeast } from '../gangConstants';
import AvatarSvg from '../../AvatarSvg/AvatarSvg';

export default function ChatTab({ org, d }) {
  const { path, actorId } = useGang();
  const { run, busy } = useGangAction();
  const isIntel = org === 'intel';
  const ranked = isIntel ? ['baskan', 'sef', 'uzman'].includes(d.rank) : atLeast(d.rank, 'kidemli');
  const [channel, setChannel] = useState('genel');
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const coll = isIntel ? path(`intelChat_${channel}`) : channel === 'tum' ? path('globalChat') : path(`gangs/${d.gangId}/chat_${channel}`);
  const since = Number((isIntel ? d.membership.intelJoinedAtMs : d.membership.gangJoinedAtMs) || 0);
  const { docs } = useQueryData(coll, () => [where('createdAtMs', '>=', since), orderBy('createdAtMs', 'desc'), limit(60)], `${coll}_${since}`);
  const msgs = [...docs].reverse();
  const canWrite = channel === 'genel' || ranked;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [docs.length, channel]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    const r = isIntel ? await run('sendIntelChat', { channel, text: t }) : channel === 'tum' ? await run('sendGlobalChat', { text: t }) : await run('sendGangChat', { channel, text: t });
    if (r) setText('');
  };

  const channels = isIntel
    ? [{ id: 'genel', label: 'Genel', icon: '💬' }, ...(ranked ? [{ id: 'yonetim', label: 'Rütbeliler', icon: '🔒' }] : [])]
    : [{ id: 'genel', label: 'Çete', icon: '💬' }, ...(ranked ? [{ id: 'yonetim', label: 'Yönetim', icon: '🔒' }] : []), { id: 'tum', label: 'Tüm Çeteler', icon: '🌐' }];

  return (
    <div className="gx-chat">
      <Chips options={channels} value={channel} onChange={setChannel} />
      <div className="gx-chat-list" ref={listRef}>
        {msgs.length === 0 && <p className="dim gx-center-text">Henüz mesaj yok.</p>}
        {msgs.map((m) => {
          if (m.system) {
            return (
              <div key={m.id} className="gx-chat-system">
                {m.text}
              </div>
            );
          }
          const mine = isIntel ? m.rosterId === d.rid : m.authorId === actorId;
          const rank = isIntel ? m.rank : m.authorRank;
          return (
            <div key={m.id} className={`gx-msg-wrap${mine ? ' mine' : ''}`}>
              {!mine && (
                <span className="gx-msg-avatar">
                  {isIntel ? <span className="gx-fcard-q sm">?</span> : <AvatarSvg avatar={m.authorAvatar} size={30} rounded />}
                </span>
              )}
              <div className={`gx-msg${mine ? ' mine' : ''}`}>
                {!mine && (
                  <span className="gx-msg-author">
                    {RANK_ICONS[rank] || ''} {isIntel ? m.codeName : m.authorName}
                    {channel === 'tum' && m.gangName && (
                      <span className="gx-msg-gang">
                        <Logo logo={m.gangLogo} size={14} /> {m.gangName}
                      </span>
                    )}
                  </span>
                )}
                <span className="gx-msg-text">{m.text}</span>
                <span className="gx-msg-time">{fmtClock(m.createdAtMs)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {canWrite ? (
        <div className="gx-chat-input">
          <input className="gx-input" value={text} maxLength={GANG_RULES.CHAT_MAX} placeholder="Mesaj yaz…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Btn onClick={send} busy={Boolean(busy)} disabled={!text.trim()}>
            ➤
          </Btn>
        </div>
      ) : (
        <div className="gx-chat-input locked">
          <input className="gx-input" disabled placeholder="🔒 Sadece rütbeliler" />
        </div>
      )}
    </div>
  );
}
