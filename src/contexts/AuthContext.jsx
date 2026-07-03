import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, googleProvider, functions } from '../firebase';

const AuthContext = createContext(null);

const initializePlayer = httpsCallable(functions, 'initializePlayer');

/**
 * AuthProvider — Google ile giriş/çıkış ve oturum durumunu yönetir.
 * İlk girişte `initializePlayer` Cloud Function'ını çağırarak users/{uid}
 * dokümanının sunucu tarafında (Admin SDK ile) oluşturulmasını sağlar.
 * Bu sayede istemci, başlangıç altını/mesleği gibi kritik alanları
 * doğrudan yazamaz (Bölüm 15 — güvenlik kuralı).
 *
 * İsteğe bağlı referans kodu: kullanıcı giriş yapmadan hemen önce
 * setPendingReferralCode ile bir kod girmişse, initializePlayer'a
 * iletilir (sadece HENÜZ hiç oynamamış hesaplarda bir etkisi olur).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const pendingReferralRef = useRef('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        try {
          await initializePlayer({ referralCode: pendingReferralRef.current || null });
        } catch (err) {
          console.error('initializePlayer başarısız:', err);
          setInitError(err.message);
        }
      }
    });
    return unsubscribe;
  }, []);

  const setPendingReferralCode = useCallback((code) => {
    pendingReferralRef.current = code || '';
  }, []);

  const signIn = useCallback(async () => {
    setInitError(null);
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(() => firebaseSignOut(auth), []);

  return (
    <AuthContext.Provider
      value={{ user, loading, initError, signIn, signOut, setPendingReferralCode }}
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
