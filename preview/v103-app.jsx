// SADECE önizleme (v103): Şüpheli Adam iki satış şekli · Sixtagram bildirimden gönderi
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import { BlocksProvider } from '../src/contexts/BlocksContext';
import ShadyDealPanel from '../src/components/ShadyDeal/ShadyDealPanel';
import PostDetailPanel from '../src/components/Sixtagram/PostDetailPanel';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import { istanbulDateKey } from '../src/lib/istanbulTime';
import '../src/index.css';
import '../src/components/ParkWorldScreen/ParkWorldScreen.css';

function Park() {
  const [busy, setBusy] = useState(null);
  return (
    <div className="pw-panel" style={{ position: 'static', maxWidth: 390 }}>
      <p className="pw-panel-title">🕶️ Şüpheli Adam</p>
      <ShadyDealPanel qty={12} busy={busy} onSell={(m) => setBusy(m)} />
      <button className="pw-panel-btn">Uzaklaş</button>
    </div>
  );
}

(async () => {
  const now = Date.now();
  await fakeDb.doc(`users/${PREVIEW_UID}`).set({ displayName: 'Önizleme', gold: 50_000, suspicion: 23, reputation: 60, parkSafeSales: { day: istanbulDateKey(), count: 3 } }, { merge: true });
  await fakeDb.doc('sixtagramPosts/p1').set({ uid: PREVIEW_UID, authorName: 'Önizleme', text: 'Parkta güzel bir gün ☀️', likeCount: 4, commentCount: 3, createdAtMs: now - 3 * 3600e3, expiresAtMs: now + 864e5 });
  await fakeDb.doc('sixtagramPosts/p1/comments/c1').set({ uid: 'a', authorName: 'Ayşe', text: 'Çok güzel olmuş!', createdAtMs: now - 2 * 3600e3 });
  await fakeDb.doc('sixtagramPosts/p1/comments/c2').set({ uid: 'b', authorName: 'Mehmet', text: 'Ben de oradaydım, seni görmedim 😄', createdAtMs: now - 3600e3 });
  await fakeDb.doc('sixtagramPosts/p1/comments/c3').set({ uid: 'a', authorName: 'Ayşe', text: 'Yarın da gidelim mi?', parentCommentId: 'c2', createdAtMs: now - 1800e3 });
  const view = new URLSearchParams(location.search).get('v') || 'park';
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <BlocksProvider>
        <div style={{ padding: 16, background: '#0b0d14', minHeight: '100vh', color: '#eee' }}>
          {view === 'park' ? <Park /> : <PostDetailPanel postId="p1" focusCommentId="c2" likedIds={new Set()} onClose={() => {}} />}
        </div>
      </BlocksProvider>
    </AuthProvider>
  );
})();
