import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { registerFirebaseTokenProvider, syncFirebaseUser } from '../utils/api';

export interface AppUserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: AppUserProfile | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    registerFirebaseTokenProvider(async () => {
      if (userRef.current) {
        try {
          const fresh = await userRef.current.getIdToken();
          tokenRef.current = fresh;
          return fresh;
        } catch {
          return tokenRef.current;
        }
      }
      return tokenRef.current;
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      userRef.current = user;
      setFirebaseUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          tokenRef.current = token;
          setIdToken(token);
          const synced = await syncFirebaseUser(token);
          setProfile(synced);
        } catch (err) {
          console.error('Failed to sync signed-in user:', err);
          setProfile({
            id: 0,
            uid: user.uid,
            email: user.email || '',
            fullName: user.displayName || user.email || 'Customer',
            role: 'customer',
          });
        }
      } else {
        tokenRef.current = null;
        setIdToken(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const token = await result.user.getIdToken();
      tokenRef.current = token;
      setIdToken(token);
      const synced = await syncFirebaseUser(token);
      setProfile(synced);
    } catch (err) {
      const msg = (err as Error).message || 'Google sign-in was cancelled.';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    tokenRef.current = null;
    userRef.current = null;
    setIdToken(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        idToken,
        loading,
        authError,
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
