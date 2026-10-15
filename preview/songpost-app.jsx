// SADECE önizleme (v93): Sixtagram şarkı kartı — dinlenme sayısı, destek, MP3 (sanatçı)
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import SongView from '../src/components/Sixtagram/SongView';
import { fakeDb } from './mocks/backend.js';
import { emptySong } from '../functions/songData.js';
import '../src/index.css';

const s = emptySong();
s.title = 'Neon Gece';
s.bpm = 140;
s.pats[0].d[0] = 0b0001000100010001;
s.pats[0].d[2] = 0b0101010101010101;
s.pats[0].t[0][3] = 0b0000100000001000;
const post = { id: 'p1', uid: 'misafir1', plays: 3, tips: 0, attachment: s };
(async () => {
  await fakeDb.doc('sixtagramPosts/p1').set({ ...post, expiresAtMs: Date.now() + 864e5 });
  window.__db = fakeDb;
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <div style={{ padding: 16, background: '#0b0d14', minHeight: '100vh', color: '#eee' }}>
        <div style={{ maxWidth: 420 }}>
          <SongView song={s} post={post} />
        </div>
      </div>
    </AuthProvider>
  );
})();
