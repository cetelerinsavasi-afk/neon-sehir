import { Component } from 'react';

// =============================================================================
// v102 — Ekran parçalarının (lazy chunk) yüklenememesine karşı koruma.
// Oyun her güncellendiğinde dosya adları değişir; uygulama açıkken güncelleme
// gelirse eski parça bulunamaz ve ekran (ör. ev) açılmaz — "çık-gir" yapınca
// düzelir. Burada önce bir kez daha denenir, olmazsa sayfa sessizce bir kez
// yenilenir (dakikada en fazla bir kez), o da olmazsa "Yenile" düğmesi çıkar.
// =============================================================================
const RELOAD_KEY = 'ns_chunk_reload_at';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function retryImport(loader) {
  return () =>
    loader().catch(async (err) => {
      await wait(800);
      try {
        return await loader();
      } catch {
        if (reloadOnce()) return new Promise(() => {}); // sayfa yenileniyor
        throw err;
      }
    });
}

// Vite'ın ön-yükleme hatası (CSS/bağımlılık parçası bulunamadı)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnce()) e.preventDefault();
  });
}

export class ChunkBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('Ekran yüklenemedi:', err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app-lazy-fallback app-lazy-error" role="alert">
        <p>Ekran yüklenemedi.</p>
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem(RELOAD_KEY);
            } catch {
              /* */
            }
            window.location.reload();
          }}
        >
          🔄 Yenile
        </button>
        {this.props.onClose && <button onClick={this.props.onClose}>✕ Kapat</button>}
      </div>
    );
  }
}
