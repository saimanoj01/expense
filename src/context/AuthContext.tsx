import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  email: string;
  name: string;
  picture?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMockMode: boolean;
  googleClientIdExists: boolean;
  login: () => Promise<void>;      // Triggers real Google OAuth (stub for now)
  loginAsMock: () => void;         // Triggers instant local storage mock login
  logout: () => Promise<void>;
  toggleMockMode: (mock: boolean) => void;
  showSessionExpiredModal: boolean;
  setShowSessionExpiredModal: (show: boolean) => void;
  authErrorToast: string | null;
  setAuthErrorToast: (msg: string | null) => void;
}

/**
 * Helper to determine if a token represents an explicitly expired session
 * (either mock OAuth simulator expired token or an expired JWT claim).
 */
function isExpiredSessionToken(token: string): boolean {
  if (token === 'EXPIRED_TOKEN') {
    return true;
  }
  if (token.includes('.') || token.toLowerCase().includes('jwt')) {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const payload = JSON.parse(atob(padded));
        if (payload && typeof payload.exp === 'number') {
          return payload.exp * 1000 <= Date.now();
        }
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Checks if a token is null/empty, explicitly flagged expired in mock OAuth simulator,
 * or has an invalid/expired JWT structure.
 */
export function isInvalidOrExpiredToken(token: string | null): boolean {
  if (!token || token.trim() === '') {
    return true;
  }
  if (token === 'EXPIRED_TOKEN') {
    return true;
  }
  if (token.includes('.') || token.toLowerCase().includes('jwt')) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true;
    }
    try {
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = JSON.parse(atob(padded));
      if (payload && typeof payload.exp === 'number') {
        if (payload.exp * 1000 <= Date.now()) {
          return true;
        }
      }
    } catch {
      return true;
    }
  }
  return false;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem('expense_google_token');
    if (!isInvalidOrExpiredToken(token)) {
      return { email: 'cloud@example.com', name: 'Google User' };
    }
    return null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const token = localStorage.getItem('expense_google_token');
    return !isInvalidOrExpiredToken(token);
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMockMode, setIsMockMode] = useState<boolean>(() => {
    const token = localStorage.getItem('expense_google_token');
    return isInvalidOrExpiredToken(token);
  });

  const googleClientIdExists = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState<boolean>(false);
  const [authErrorToast, setAuthErrorToast] = useState<string | null>(null);

  useEffect(() => {
    const googleToken = localStorage.getItem('expense_google_token');

    if (googleToken && isInvalidOrExpiredToken(googleToken)) {
      localStorage.removeItem('expense_google_token');
      if (isExpiredSessionToken(googleToken)) {
        setShowSessionExpiredModal(true);
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }
    }

    if (!isInvalidOrExpiredToken(googleToken)) {
      setIsMockMode(false);
      setUser({ email: 'cloud@example.com', name: 'Google User' });
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const handleHashAuth = async () => {
      const hash = window.location.hash;
      if (hash.includes('access_token=')) {
        const cleanHash = hash.includes('#access_token=') ? hash.split('#access_token=')[1] : hash.substring(1);
        const params = new URLSearchParams(cleanHash);
        const token = params.get('access_token');
        if (token) {
          localStorage.setItem('expense_google_token', token);
          localStorage.setItem('pref_mock_mode', 'false');
          setIsMockMode(false);
          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
              const info = await res.json();
              setUser({ email: info.email || 'cloud@example.com', name: info.name || 'Google User', picture: info.picture });
            } else {
              setUser({ email: 'cloud@example.com', name: 'Google User' });
            }
          } catch {
            setUser({ email: 'cloud@example.com', name: 'Google User' });
          }
          setIsAuthenticated(true);
          window.location.hash = '';
        }
      } else if (hash.includes('error=access_denied')) {
        setAuthErrorToast('Access Denied');
      }
    };
    handleHashAuth();
    window.addEventListener('hashchange', handleHashAuth);
    return () => window.removeEventListener('hashchange', handleHashAuth);
  }, []);

  useEffect(() => {
    const googleToken = localStorage.getItem('expense_google_token');
    if (!isInvalidOrExpiredToken(googleToken)) {
      return;
    }
    const savedMockMode = localStorage.getItem('pref_mock_mode');
    let parsedUser = null;
    const savedUser = localStorage.getItem('expense_mock_session');
    if (savedUser) {
      try {
        parsedUser = JSON.parse(savedUser);
      } catch (e) {
        console.error('Failed to parse user session:', e);
        localStorage.removeItem('expense_mock_session');
      }
    }

    const wasCorruptedRecovered = localStorage.getItem('expense_corrupt_recovered') === 'true';
    if (!googleClientIdExists) {
      setIsMockMode(true);
      if (parsedUser) {
        setUser(parsedUser);
        setIsAuthenticated(true);
      } else if (wasCorruptedRecovered) {
        const defaultUser: User = {
          email: 'demo@example.com',
          name: 'Demo User',
          picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=Demo'
        };
        setUser(defaultUser);
        setIsAuthenticated(true);
        localStorage.setItem('expense_mock_session', JSON.stringify(defaultUser));
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } else {
      const mode = savedMockMode === 'false' ? false : true;
      setIsMockMode(mode);
      if (mode && parsedUser) {
        setUser(parsedUser);
        setIsAuthenticated(true);
      } else if (mode && wasCorruptedRecovered) {
        const defaultUser: User = {
          email: 'demo@example.com',
          name: 'Demo User',
          picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=Demo'
        };
        setUser(defaultUser);
        setIsAuthenticated(true);
        localStorage.setItem('expense_mock_session', JSON.stringify(defaultUser));
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    }
    setIsLoading(false);
  }, [googleClientIdExists]);

  const login = async () => {
    if (!googleClientIdExists) {
      console.warn("No VITE_GOOGLE_CLIENT_ID configured. Falling back to Mock Login.");
      loginAsMock();
      return;
    }
    setIsLoading(true);
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = window.location.origin + window.location.pathname;
      const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/gmail.send',
        'email',
        'profile'
      ].join(' ');

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: scopes,
        include_granted_scopes: 'true',
        prompt: 'select_account'
      }).toString();

      window.location.href = authUrl;
    } catch (err) {
      console.error("Google login failed:", err);
      setIsLoading(false);
    }
  };

  const loginAsMock = () => {
    if (!navigator.onLine) {
      setAuthErrorToast('You are currently offline');
    }
    const mockUser: User = {
      email: 'demo@example.com',
      name: 'Demo User',
      picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=Demo'
    };
    setUser(mockUser);
    setIsAuthenticated(true);
    setIsMockMode(true);
    localStorage.setItem('expense_mock_session', JSON.stringify(mockUser));
    localStorage.setItem('pref_mock_mode', 'true');
  };

  const logout = async () => {
    setIsLoading(true);
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('expense_mock_session');
    setIsLoading(false);
  };

  const toggleMockMode = (mock: boolean) => {
    if (!googleClientIdExists && !mock) {
      console.error("Cannot disable mock mode when Google Client ID is missing.");
      return;
    }
    setIsMockMode(mock);
    localStorage.setItem('pref_mock_mode', String(mock));
    logout(); // Log out current session when switching modes to prevent state pollution
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      isMockMode,
      googleClientIdExists,
      login,
      loginAsMock,
      logout,
      toggleMockMode,
      showSessionExpiredModal,
      setShowSessionExpiredModal,
      authErrorToast,
      setAuthErrorToast
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
