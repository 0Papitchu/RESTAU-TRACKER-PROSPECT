import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { User } from "firebase/auth";
import {
  clearCachedAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from "../services/googleAuth";

interface GoogleWorkspaceAuthContextValue {
  user: User | null;
  accessToken: string | null;
  needsAuth: boolean;
  isSigningIn: boolean;
  authError: string | null;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
  invalidateToken: () => void;
}

const GoogleWorkspaceAuthContext = createContext<
  GoogleWorkspaceAuthContextValue | undefined
>(undefined);

export function GoogleWorkspaceAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    getAccessToken()
  );
  const [needsAuth, setNeedsAuth] = useState<boolean>(
    () => !getAccessToken()
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (signedUser, token) => {
        setUser(signedUser);
        setAccessToken(token);
        setNeedsAuth(false);
        setAuthError(null);
      },
      (firebaseUser) => {
        setUser(firebaseUser);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (): Promise<string | null> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setAccessToken(res.accessToken);
      setNeedsAuth(false);
      return res.accessToken;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Échec de la connexion Google. Veuillez réessayer.";
      setAuthError(message);
      setNeedsAuth(true);
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setAuthError(null);
  }, []);

  const invalidateToken = useCallback(() => {
    clearCachedAccessToken();
    setAccessToken(null);
    setNeedsAuth(true);
  }, []);

  return (
    <GoogleWorkspaceAuthContext.Provider
      value={{
        user,
        accessToken,
        needsAuth,
        isSigningIn,
        authError,
        signIn,
        signOut,
        invalidateToken,
      }}
    >
      {children}
    </GoogleWorkspaceAuthContext.Provider>
  );
}

export function useGoogleWorkspaceAuth(): GoogleWorkspaceAuthContextValue {
  const ctx = useContext(GoogleWorkspaceAuthContext);
  if (!ctx) {
    throw new Error(
      "useGoogleWorkspaceAuth must be used inside GoogleWorkspaceAuthProvider"
    );
  }
  return ctx;
}
