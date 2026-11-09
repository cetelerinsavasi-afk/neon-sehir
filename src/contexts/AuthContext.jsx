import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, googleProvider, functions } from '../firebase';
import { IS_ANDROID_WEBVIEW } from '../lib/platform';
import { hasNativeBridge, nativeGoogleSignIn, nativeSignOutGoogle } from '../lib/nativeBridge';

const AuthContext = createContext(null);

const initializePlayer = httpsCallable(functions, 'initializePlayer');

const USER_DISABLED_MSG = 'Hesabın topluluk kurallarını ihlal ettiği için kısıtlandı. İtiraz için: studyohustle@gmail.com';

// v148 — Android WebView uygulamasında Google, signInWithPopup penceresini
// engeller ("disallowed_useragent"). Orada Google ID token'ı native Credential
// Manager'dan alınır, Firebase oturumunu yine JS SDK açar. Aynı Google hesabı
// → aynı Firebase kullanıcısı → aynı UID; onAuthStateChanged → initializePlayer
// akışı değişmez. Tarayıcıda ve eski TWA'da bu yol HİÇ kullanılmaz.
async function nativeSignIn() {
  const res = await nativeGoogleSignIn();
  if (!res) throw new Error('Google ile giriş başlatılamadı.');
  if (res.ok && res.idToken) {
    await signInWithCredential(auth, GoogleAuthProvider.credential(res.idToken));
    return;
  }
  if (res.cancelled) return; // kullanıcı vazgeçti — sessizce dön
  if (res.timeout) throw new Error('Google ile giriş zaman aşımına uğradı. Tekrar dene.');
  throw new Error(res.error || 'Google ile giriş yapılamadı.');
}

/**
 * AuthProvider — Google ile giriş/çıkış ve oturum durumunu yönetir.
 * İlk girişte `initializePlayer` Cloud Function'ını çağırarak users/{uid}
 * dokümanının sunucu tarafında (Admin SDK ile) oluşturulmasını sağlar.
 * Bu sayede istemci, başlangıç altını/mesleği gibi kritik alanları
 * doğrudan yazamaz (Bölüm 15 — güvenlik kuralı).
 *
 * isNewPlayer: initializePlayer'ın bu çağrıda GERÇEKTEN yeni bir hesap
 * oluşturup oluşturmadığını bildirir — sadece bu durumda referans kodu
 * teşviki gösterilir (bkz. ReferralPrompt).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [isNewPlayer, setIsNewPlayer] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      window.dispatchEvent(new Event('ns-auth-ready')); // v107: açılış sahnesi kapanabilir
      if (firebaseUser) {
        try {
          const res = await initializePlayer();
          if (res?.data?.isNewPlayer) setIsNewPlayer(true);
        } catch (err) {
          console.error('initializePlayer başarısız:', err);
          setInitError(err.message);
        }
      }
    });
    return unsubscribe;
  }, []);

  const dismissNewPlayerFlag = useCallback(() => setIsNewPlayer(false), []);

  const signIn = useCallback(async () => {
    setInitError(null);
    try {
      if (IS_ANDROID_WEBVIEW && hasNativeBridge()) {
        await nativeSignIn();
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      // UGC D3: banlı hesap (Auth devre dışı) — anlaşılır mesaj göster
      if (err?.code === 'auth/user-disabled') {
        setInitError(USER_DISABLED_MSG);
        return;
      }
      // v148: WebView'da hata mesajı giriş kutusunda gösterilir (Play Services /
      // hesap yok gibi native hatalarda native taraf ayrıca kısa bir Toast gösterir,
      // çünkü HUD'daki giriş butonunun hata alanı yok). Hata fırlatılmaz.
      if (IS_ANDROID_WEBVIEW && hasNativeBridge()) {
        console.warn('Native Google girişi başarısız:', err?.code || err);
        setInitError(err?.code ? 'Giriş yapılamadı. İnternet bağlantını kontrol edip tekrar dene.' : err?.message || 'Giriş yapılamadı.');
        return;
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    // v148: WebView'da bir sonraki girişte hesap seçici yeniden çıksın
    if (IS_ANDROID_WEBVIEW) nativeSignOutGoogle();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, initError, signIn, signOut, isNewPlayer, dismissNewPlayerFlag }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
