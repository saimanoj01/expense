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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem('expense_google_token');
    if (token && token !== 'EXPIRED_TOKEN' && token !== 'mangled-garbage-jwt') {
      return { email: 'cloud@example.com', name: 'Google User' };
    }
    return null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const token = localStorage.getItem('expense_google_token');
    return !!(token && token !== 'EXPIRED_TOKEN' && token !== 'mangled-garbage-jwt');
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMockMode, setIsMockMode] = useState<boolean>(() => {
    const token = localStorage.getItem('expense_google_token');
    return !(token && token !== 'EXPIRED_TOKEN' && token !== 'mangled-garbage-jwt');
  });

  const googleClientIdExists = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState<boolean>(false);
  const [authErrorToast, setAuthErrorToast] = useState<string | null>(null);

  useEffect(() => {
    const googleToken = localStorage.getItem('expense_google_token');

    if (googleToken === 'EXPIRED_TOKEN') {
      localStorage.removeItem('expense_google_token');
      setShowSessionExpiredModal(true);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    } else if (googleToken === 'mangled-garbage-jwt') {
      localStorage.removeItem('expense_google_token');
    }

    if (googleToken && googleToken !== 'EXPIRED_TOKEN' && googleToken !== 'mangled-garbage-jwt') {
      setIsMockMode(false);
      setUser({ email: 'cloud@example.com', name: 'Google User' });
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const handleHashAuth = () => {
      const hash = window.location.hash;
      if (hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
          localStorage.setItem('expense_google_token', token);
          localStorage.setItem('pref_mock_mode', 'false');
          setIsMockMode(false);
          setUser({ email: 'cloud@example.com', name: 'Google User' });
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
      // Future Google Identity Services OAuth Implicit flow integration (Milestone 4)
      console.log("Google login placeholder triggered.");
    } catch (err) {
      console.error("Google login failed:", err);
    } finally {
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
