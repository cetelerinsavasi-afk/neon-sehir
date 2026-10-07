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
import { markGangChatSeen, useGangAlertsCtx } from '../alerts';
import { Btn, Chips, Logo } from '../ui';
import { GANG_RULES, RANK_ICONS, atLeast } from '../gangConstants';
import AvatarSvg from '../../AvatarSvg/AvatarSvg';
import ReportBlockSheet from '../../ReportBlockSheet/ReportBlockSheet';
import PlayerCard from '../../PlayerCard/PlayerCard';
import ActionMenu from '../../ActionMenu/ActionMenu';
import { copyText, useLongPress } from '../../ActionMenu/actionMenuUtils';
import { useBlocks } from '../../../contexts/BlocksContext';

// v53: mesaj balonu — avatara/ada dokununca Oyuncu Kartı (İstihbarat'ta yok:
// anonim); mesaja uzun basınca Kopyala · Profili gör · Bildir menüsü.
function GangMsg({ m, mine, rank, isIntel, channel, onProfile, onMenu }) {
  const press = useLongPress(() => onMenu(m));
  const canProfile = !isIntel && !mine && m.authorId;
  return (
    <div className={`gx-msg-wrap${mine ? ' mine' : ''}`}>
      {!mine &&
        (canProfile ? (
          <button type="button" className="gx-msg-avatar pc-trigger" onClick={() => onProfile(m)} aria-label={`${m.authorName || 'Oyuncu'} profilini gör`}>
            <AvatarSvg avatar={m.authorAvatar} size={30} rounded />
          </button>
        ) : (
          <span className="gx-msg-avatar">{isIntel ? <span className="gx-fcard-q sm">?</span> : <AvatarSvg avatar={m.authorAvatar} size={30} rounded />}</span>
        ))}
      <div className={`gx-msg${mine ? ' mine' : ''}`} {...press}>
        {!mine && (
          <span className="gx-msg-author">
            {canProfile ? (
              <button type="button" className="pc-trigger gx-msg-author-btn" onClick={() => onProfile(m)}>
                {RANK_ICONS[rank] || ''} {m.authorName}
              </button>
            ) : (
              <>
                {RANK_ICONS[rank] || ''} {isIntel ? m.codeName : m.authorName}
              </>
            )}
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
}

export default function ChatTab({ org, d }) {
  const { path, actorId, worldId } = useGang();
  const { run, busy } = useGangAction();
  const isIntel = org === 'intel';
  const ranked = isIntel ? ['baskan', 'sef', 'uzman'].includes(d.rank) : atLeast(d.rank, 'kidemli');
  const [channel, setChannel] = useState('genel');
  const [text, setText] = useState('');
  const listRef = useRef(null);
  // UGC D2: engellenen oyuncunun mesajı soluk/daraltılmış satır olarak görünür
  // (çete içi taktik akışı kopmasın diye tamamen silinmez); dokununca bir kez açılır.
  const { isBlocked } = useBlocks();
  const [revealed, setRevealed] = useState(() => new Set());
  const [reportTarget, setReportTarget] = useState(null);
  const [profileOf, setProfileOf] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const coll = isIntel ? path(`intelChat_${channel}`) : channel === 'tum' ? path('globalChat') : path(`gangs/${d.gangId}/chat_${channel}`);
  const since = Number((isIntel ? d.membership.intelJoinedAtMs : d.membership.gangJoinedAtMs) || 0);
  const { docs } = useQueryData(coll, () => [where('createdAtMs', '>=', since), orderBy('createdAtMs', 'desc'), limit(60)], `${coll}_${since}`);
  const msgs = [...docs].reverse();
  const canWrite = channel === 'genel' || ranked;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [docs.length, channel]);

  // Bu kanal görüldü → bildirim noktası söner
  const latestMs = docs[0]?.createdAtMs || 0;
  useEffect(() => {
    if (!latestMs) return;
    markGangChatSeen(actorId, worldId, isIntel ? `i:${channel}` : channel === 'tum' ? 'g:tum' : `g:${d.gangId}:${channel}`, latestMs);
  }, [latestMs, channel, actorId, worldId, isIntel, d.gangId]);
  const alerts = useGangAlertsCtx();
  const unread = alerts ? (isIntel ? alerts.chans?.intel : alerts.chans?.gang) || {} : {};

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    const r = isIntel ? await run('sendIntelChat', { channel, text: t }) : channel === 'tum' ? await run('sendGlobalChat', { text: t }) : await run('sendGangChat', { channel, text: t });
    if (r) setText('');
  };

  const dot = (id) => (unread[id] && channel !== id ? ' 🔴' : '');
  const channels = isIntel
    ? [{ id: 'genel', label: `Genel${dot('genel')}`, icon: '💬' }, ...(ranked ? [{ id: 'yonetim', label: `Rütbeliler${dot('yonetim')}`, icon: '🔒' }] : [])]
    : [{ id: 'genel', label: `Çete${dot('genel')}`, icon: '💬' }, ...(ranked ? [{ id: 'yonetim', label: `Yönetim${dot('yonetim')}`, icon: '🔒' }] : []), { id: 'tum', label: `Tüm Çeteler${dot('tum')}`, icon: '🌐' }];

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
          // Şikâyetlerle otomatik gizlenen mesaj (İstihbarat dahil)
          if (m.hidden && !mine) {
            return (
              <div key={m.id} className="gx-chat-system gx-msg-muted">
                {m.hiddenBy === 'moderator' ? '🛡️ Bu mesaj moderasyon ekibi tarafından kaldırıldı.' : '🚩 Bu mesaj şikâyetler nedeniyle incelemeye alındı.'}
              </div>
            );
          }
          // Engellenen oyuncu (İstihbarat anonim olduğu için orada uygulanmaz)
          if (!isIntel && !mine && isBlocked(m.authorId) && !revealed.has(m.id)) {
            return (
              <button
                key={m.id}
                type="button"
                className="gx-chat-system gx-msg-muted gx-msg-blocked"
                onClick={() => setRevealed((prev) => new Set(prev).add(m.id))}
                title="Göstermek için dokun"
              >
                🚫 Engellediğin oyuncudan mesaj · göster
              </button>
            );
          }
          return <GangMsg key={m.id} m={m} mine={mine} rank={rank} isIntel={isIntel} channel={channel} onProfile={setProfileOf} onMenu={setMenuFor} />;
        })}
      </div>
      {menuFor && (
        <ActionMenu
          title={`${isIntel ? menuFor.codeName || 'Ajan' : menuFor.authorName || 'Oyuncu'}: “${String(menuFor.text || '').slice(0, 60)}”`}
          onClose={() => setMenuFor(null)}
          actions={[
            { key: 'copy', icon: '📋', label: 'Kopyala', onClick: () => copyText(menuFor.text || '') },
            ...(!isIntel && menuFor.authorId && menuFor.authorId !== actorId ? [{ key: 'profile', icon: '👤', label: 'Profili gör', onClick: () => setProfileOf(menuFor) }] : []),
            ...((isIntel ? menuFor.rosterId !== d.rid : menuFor.authorId !== actorId) ? [{ key: 'report', icon: '⚑', label: 'Bildir', subtle: true, onClick: () => setReportTarget(menuFor) }] : []),
          ]}
        />
      )}
      {profileOf && (
        <PlayerCard
          uid={profileOf.authorId}
          name={profileOf.authorName}
          avatar={profileOf.authorAvatar}
          reportItems={[{ label: 'Bu mesajı bildir', targetType: channel === 'tum' ? 'gangGlobalChat' : 'gangChat', targetPath: `${coll}/${profileOf.id}`, preview: profileOf.text }]}
          onClose={() => setProfileOf(null)}
        />
      )}
      {reportTarget && (
        <ReportBlockSheet
          targetUid={isIntel ? null : reportTarget.authorId}
          targetName={isIntel ? reportTarget.codeName || 'Ajan' : reportTarget.authorName || 'Oyuncu'}
          canBlock={false}
          items={[{ label: 'Mesajı bildir', targetType: isIntel ? 'intelChat' : channel === 'tum' ? 'gangGlobalChat' : 'gangChat', targetPath: `${coll}/${reportTarget.id}`, preview: reportTarget.text }]}
          onClose={() => setReportTarget(null)}
        />
      )}
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
