// SADECE önizleme (v92): Sixtagram "Şarkı Yap" düzenleyicisi + akış kartı
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SongMaker from '../src/components/Sixtagram/SongMaker';
import SongView from '../src/components/Sixtagram/SongView';
import { sanitizeSong } from '../functions/songData.js';
import '../src/index.css';

function App() {
  const [song, setSong] = useState(null);
  const [open, setOpen] = useState(true);
  window.__song = song;
  return (
    <div style={{ padding: 16, background: '#0b0d14', minHeight: '100vh' }}>
      <button id="openBtn" onClick={() => setOpen(true)}>Aç</button>
      {song && (
        <div style={{ maxWidth: 420, marginTop: 12 }}>
          <SongView song={song} />
        </div>
      )}
      {open && (
        // gönderi penceresi gibi: arka plana tıklanınca kapanır (v92.3 hata testi)
        <div className="fake-backdrop" onClick={() => { window.__bdClosed = (window.__bdClosed || 0) + 1; setOpen(false); }}>
        <SongMaker
          initial={song || {}}
          onCancel={() => setOpen(false)}
          onDone={(d) => {
            const r = sanitizeSong(d);
            window.__err = r.error || null;
            setSong(r.song || null);
            setOpen(false);
          }}
        />
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
