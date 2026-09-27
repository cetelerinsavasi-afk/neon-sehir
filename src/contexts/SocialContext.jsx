import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

// v60 — SocialContext: arkadaşlar, arkadaşlık istekleri ve özel sohbetler.
// Tüm uygulama tek sağlayıcıdan okur (4 hafif dinleyici). Yazmalar yalnızca
// sunucuda (functions/social.js → socialAction). Sıralama/süzme bellekte;
// yeni indeks gerekmez.
export const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY = {
  ready: false,
  friends: [],
  friendMap: {},
  incoming: [],
  outgoing: [],
  chats: [],
  unreadTotal: 0,
  requestCount: 0,
  relationOf: () => 'none',
  chatWith: () => null,
};
const SocialContext = createContext(EMPTY);

export function SocialProvider({ children }) {
  const { user } = useAuth();
  const [friendMap, setFriendMap] = useState({});
  const [incomingRaw, setIncoming] = useState([]);
  const [outgoingRaw, setOutgoing] = useState([]);
  const [chatsRaw, setChats] = useState([]);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setFriendMap({});
      setIncoming([]);
      setOutgoing([]);
      setChats([]);
      setReady(false);
      return undefined;
    }
    const log = (what) => (err) => console.error(`SocialContext (${what}) dinleme hatası:`, err);
    const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unsubs = [
      onSnapshot(
        doc(db, 'friendships', user.uid),
        (s) => {
          setFriendMap(s.exists() ? s.data()?.friends || {} : {});
          setReady(true);
        },
        (err) => {
          log('friendships')(err);
          setReady(true);
        }
      ),
      onSnapshot(query(collection(db, 'friendRequests'), where('toUid', '==', user.uid)), (s) => setIncoming(docs(s)), log('incoming')),
      onSnapshot(query(collection(db, 'friendRequests'), where('fromUid', '==', user.uid)), (s) => setOutgoing(docs(s)), log('outgoing')),
      onSnapshot(query(collection(db, 'dmChats'), where('members', 'array-contains', user.uid)), (s) => setChats(docs(s)), log('dmChats')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  // İstek süreleri (48 sa) ve 7 günlük sohbet penceresi zamanla dolsun diye dakikada bir tazele
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const value = useMemo(() => {
    const now = Date.now();
    void tick;
    const uid = user?.uid;
    const friends = Object.entries(friendMap)
      .map(([id, f]) => ({ uid: id, name: f?.name || 'Oyuncu', avatar: f?.avatar || null, sinceMs: f?.sinceMs || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const live = (r) => Number(r.expiresAtMs || 0) > now;
    const incoming = incomingRaw.filter(live).sort((a, b) => b.createdAtMs - a.createdAtMs);
    const outgoing = outgoingRaw.filter(live).sort((a, b) => b.createdAtMs - a.createdAtMs);
    const chats = chatsRaw
      .filter((c) => Number(c.lastAtMs || 0) > now - MESSAGE_TTL_MS)
      .map((c) => {
        const other = (c.members || []).find((m) => m !== uid) || null;
        const f = other ? friendMap[other] : null;
        return {
          ...c,
          otherUid: other,
          otherName: f?.name || c.names?.[other] || 'Oyuncu',
          otherAvatar: f?.avatar ?? c.avatars?.[other] ?? null,
          myUnread: Number(c.unread?.[uid] || 0),
        };
      })
      .filter((c) => c.otherUid && friendMap[c.otherUid])
      .sort((a, b) => b.lastAtMs - a.lastAtMs);
    const unreadTotal = chats.reduce((sum, c) => sum + c.myUnread, 0);
    const relationOf = (other) => {
      if (!other || other === uid) return 'self';
      if (friendMap[other]) return 'friend';
      if (incoming.some((r) => r.fromUid === other)) return 'incoming';
      if (outgoing.some((r) => r.toUid === other)) return 'outgoing';
      return 'none';
    };
    return {
      ready,
      friends,
      friendMap,
      incoming,
      outgoing,
      chats,
      unreadTotal,
      requestCount: incoming.length,
      relationOf,
      chatWith: (other) => chats.find((c) => c.otherUid === other) || null,
    };
  }, [user, friendMap, incomingRaw, outgoingRaw, chatsRaw, ready, tick]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- sağlayıcı ve hook birlikte (BlocksContext ile aynı desen)
export function useSocial() {
  return useContext(SocialContext) || EMPTY;
}
