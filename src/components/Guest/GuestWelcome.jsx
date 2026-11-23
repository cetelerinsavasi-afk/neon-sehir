import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import LegalLinks from '../LegalLinks/LegalLinks';
import './Guest.css';

// =============================================================================
// v192 — MİSAFİR KARŞILAMA: Play Store'dan ilk kez gelen (giriş yapmamış) oyuncu şehre düşünce ne
// yapacağını bilmiyordu; her dokunuşta düz bir "giriş yap" kutusu çıkıyordu. Artık:
//   • ilk girişte (cihaz başına bir kez) oyunu 4 satırda anlatan karşılama kartı: Giriş yap / Önce gezeyim
//   • "Önce gezeyim" denince kısa bir ipucu (haritadan mekâna ışınlan) birkaç saniye görünür
// Sunucuya / Firestore'a hiçbir şey yazılmaz; "gösterildi" bilgisi sadece cihazda (localStorage).
// =============================================================================
const SEEN_KEY = 'neon.guestWelcome.v1';

export const GUEST_PERKS = [
  ['🚗', 'Araba al, modifiye et, yarışlara katıl'],
  ['🏭', 'Fabrikada çalış, iş kur, borsada hisse al'],
  ['🏴', 'Çete kur, soygun planla, belediye seçimine gir'],
  ['💬', 'Diğer oyuncularla sohbet et, arkadaş edin'],
];

function seen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* depolama kapalı */
  }
}

export function GuestPerks({ compact = false }) {
  return (
    <ul className={`gw-perks${compact ? ' compact' : ''}`}>
      {GUEST_PERKS.map(([ic, t]) => (
        <li key={t}>
          <span className="gw-ic" aria-hidden="true">
            {ic}
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

// ready: şehir çizildi (kart yükleme ekranının üstünde açılmasın)
export default function GuestWelcome({ ready }) {
  const { signIn, initError } = useAuth();
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(false);
  useEffect(() => {
    if (!ready || seen()) return undefined;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => {
    if (!tip) return undefined;
    const t = setTimeout(() => setTip(false), 9000);
    return () => clearTimeout(t);
  }, [tip]);
  const later = () => {
    markSeen();
    setOpen(false);
    setTip(true);
  };
  const login = () => {
    markSeen();
    setOpen(false);
    signIn?.();
  };
  return (
    <>
      {open && (
        <div className="gv-sheet-bg gw-bg" onPointerDown={(e) => e.stopPropagation()}>
          <div className="gw-card" role="dialog" aria-label="Neon Şehir'e hoş geldin">
            <div className="gw-glow" aria-hidden="true" />
            <h2>Neon Şehir'e hoş geldin 👋</h2>
            <p className="gw-lead">Gerçek oyuncularla dolu açık dünya bir şehir. Misafir olarak gezebilirsin; oynamak için giriş yap.</p>
            <GuestPerks />
            <button type="button" className="gw-primary" onClick={login}>
              <span className="gw-g" aria-hidden="true">G</span>
              Google ile giriş yap
            </button>
            <button type="button" className="gw-secondary" onClick={later}>
              Önce şehri gezeyim
            </button>
            <p className="gw-foot">Giriş yapınca ilerlemen kaydedilir. Ücretsiz.</p>
            <LegalLinks variant="consent" />
            {initError && <p className="sign-in-prompt-error">{initError}</p>}
          </div>
        </div>
      )}
      {tip && (
        <button type="button" className="gw-tip" onClick={() => setTip(false)}>
          🗺️ İpucu: sağ üstteki <b>haritaya</b> dokun, bir mekâna dokunup oraya ışınlan.
        </button>
      )}
    </>
  );
}
