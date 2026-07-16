# Analysis and Recommendations: Context Providers & Routing Strategy

This document provides architectural recommendations and design patterns for the React context providers (`AuthContext`, `AppContext`) and basic routing/page navigation for the Expense Tracker and Budget Planning application, supporting both **Google Workspace Mode** and **Mock/Demo Mode** as defined in `ORIGINAL_REQUEST.md`.

---

## 1. AuthContext Design

The `AuthContext` is responsible for managing authentication state, user metadata, and deciding whether the application operates in **Mock/Demo Mode** or **Google Workspace Mode**.

### 1.1 Config Detection & Mock Mode Fallback Logic
As specified in R6 of the `ORIGINAL_REQUEST.md`, the application must support a Mock/Demo Mode that activates when no valid Google Client ID is configured in `.env.local` or via a user-controlled "Mock Login" toggle.

The initialization logic for `AuthContext` should follow this flowchart:
1. On mount, check if a Google Client ID is configured:
   ```typescript
   const googleClientIdExists = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
   ```
2. Check `localStorage` for a persisted user preference regarding Mock Mode or a stored mock session.
3. If `googleClientIdExists` is `false`, force `isMockMode = true` and default to mock authentication.
4. If `googleClientIdExists` is `true`, allow the user to select either **Google Sign-In** or **Mock/Demo Login** via a toggle on the login page.

### 1.2 TypeScript Interfaces and Design Pattern

We recommend exposing a hook `useAuth()` to retrieve authentication state and triggers.

```typescript
// src/context/AuthContext.tsx

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
  login: () => Promise<void>;      // Triggers real Google OAuth
  loginAsMock: () => void;         // Triggers instant local storage mock login
  logout: () => Promise<void>;
  toggleMockMode: (mock: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMockMode, setIsMockMode] = useState<boolean>(true);

  const googleClientIdExists = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    // Initial configuration check and state recovery from localStorage
    const savedMockMode = localStorage.getItem('pref_mock_mode');
    const savedUser = localStorage.getItem('mock_user_session');

    if (!googleClientIdExists) {
      setIsMockMode(true);
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      }
    } else {
      const mode = savedMockMode === 'false' ? false : true;
      setIsMockMode(mode);
      // Recovery of Google/Mock session depending on the active mode
      if (mode && savedUser) {
        setUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      } else if (!mode) {
        // GAPI/GIS client silent token check would go here
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
      // Future Google Identity Services OAuth Implicit flow integration
      // On success, set user details and isAuthenticated = true
    } catch (err) {
      console.error("Google login failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsMock = () => {
    const mockUser: User = {
      email: 'demo@example.com',
      name: 'Demo User',
      picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=Demo'
    };
    setUser(mockUser);
    setIsAuthenticated(true);
    setIsMockMode(true);
    localStorage.setItem('mock_user_session', JSON.stringify(mockUser));
    localStorage.setItem('pref_mock_mode', 'true');
  };

  const logout = async () => {
    setIsLoading(true);
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('mock_user_session');
    // If not mock mode, revoke Google OAuth token
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
      toggleMockMode
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
```

---

## 2. AppContext Design

The `AppContext` holds the global project and navigation state. It handles project initialization, fetching, creation, and coordinates with the active storage adapter.

### 2.1 Dynamic Storage Adapter Decoupling
To prevent leakage of Google API details or browser local storage code into UI components, `AppContext` must interact solely with the generic `StorageAdapter` interface defined in `PROJECT.md`.

We propose a **Storage Provider Factory Pattern**:
- A factory method resolves the active adapter instance depending on the `isMockMode` value retrieved from `AuthContext`.
- If `isMockMode` is true, the factory yields `LocalStorageAdapter`.
- If `isMockMode` is false, it yields `GoogleSheetsAdapter`.

### 2.2 Project Creation & Prompting (R1 Requirement)
Per requirement R1, "Newly logged-in users must be prompted to create a default project if none exist."
- Upon authentication success, `AppContext` executes `loadProjects()`.
- If the projects list returns empty, the app transitions `currentView` to `'project-selector'` and sets a flag `promptCreateDefault = true` to focus or auto-open a modal/form forcing the creation of the first project.

### 2.3 TypeScript Interfaces and Design Pattern

```typescript
// src/context/AppContext.tsx

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Project, StorageAdapter } from '../services/storage';
import { LocalStorageAdapter } from '../services/localStorageAdapter';
import { GoogleSheetsAdapter } from '../services/googleSheetsAdapter';
import { useAuth } from './AuthContext';

export type ViewType = 'project-selector' | 'dashboard';

export interface AppContextType {
  projects: Project[];
  activeProject: Project | null;
  currentView: ViewType;
  isLoading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string | null) => void;
  createNewProject: (name: string) => Promise<Project>;
  setCurrentView: (view: ViewType) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isMockMode } = useAuth();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('project-selector');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize storage adapter selection based on AuthContext state
  const storageAdapter: StorageAdapter = useMemo(() => {
    if (isMockMode) {
      return new LocalStorageAdapter();
    } else {
      return new GoogleSheetsAdapter();
    }
  }, [isMockMode]);

  // Load projects list when user becomes authenticated or storage adapter changes
  const loadProjects = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await storageAdapter.getProjects();
      setProjects(list);
      
      // Handle automatic redirection or project selection restoration
      const lastActiveId = localStorage.getItem('last_active_project_id');
      if (lastActiveId) {
        const found = list.find(p => p.id === lastActiveId);
        if (found) {
          setActiveProject(found);
          setCurrentView('dashboard');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadProjects();
    } else {
      setProjects([]);
      setActiveProject(null);
      setCurrentView('project-selector');
    }
  }, [isAuthenticated, storageAdapter]);

  const selectProject = (projectId: string | null) => {
    if (!projectId) {
      setActiveProject(null);
      setCurrentView('project-selector');
      localStorage.removeItem('last_active_project_id');
      return;
    }
    const found = projects.find(p => p.id === projectId);
    if (found) {
      setActiveProject(found);
      setCurrentView('dashboard');
      localStorage.setItem('last_active_project_id', projectId);
    }
  };

  const createNewProject = async (name: string): Promise<Project> => {
    setIsLoading(true);
    setError(null);
    try {
      const newProj = await storageAdapter.createProject(name);
      setProjects(prev => [...prev, newProj]);
      // Auto-select newly created project
      selectProject(newProj.id);
      return newProj;
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider value={{
      projects,
      activeProject,
      currentView,
      isLoading,
      error,
      loadProjects,
      selectProject,
      createNewProject,
      setCurrentView
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
```

---

## 3. Routing Strategy

Because the application is designed to be hosted on **GitHub Pages** (as a serverless static site), typical HTML5 browser history routing (`BrowserRouter` from `react-router-dom`) poses a critical challenge: any refresh or direct access to a sub-page URL (like `https://<user>.github.io/dashboard`) returns a **404 Not Found** because the GitHub Pages web server is not configured to redirect unmatched paths to `index.html`.

We analyze two viable strategies to address this:

| Aspect | Strategy A: State-based Router (Recommended) | Strategy B: React Router Dom (HashRouter) |
|---|---|---|
| **Overview** | Custom, lightweight navigation driven by state in `AppContext` (e.g. `currentView`). | Standard routing package, prefixing URLs with a `#` hash (e.g. `/#/dashboard`). |
| **GitHub Pages** | **Fully compatible**: Only index.html is loaded. No 404 risks. | **Fully compatible**: Hash components are processed entirely on client side. |
| **Back/Forward Navigation** | Unsupported natively (can be emulated via browser History API). | Supported natively via standard history tracking. |
| **Bundle Size & Overhead** | Zero additional dependencies; extremely low footprint. | Adds `react-router-dom` library to the bundle (~20-30kB). |
| **Complexity** | Trivial to implement, read, and maintain. | Introduces routing configuration boilerplate. |

### Recommendation: State-based Routing (with browser hash sync)

For a dashboard app that effectively acts as a single-page workspace where state drives content:
1. A **State-based Router** is recommended for Milestone 1 because it eliminates routing dependencies, compiles to a smaller footprint, and is highly robust on GitHub Pages.
2. To support basic browser history (Back button support) without adding `react-router-dom`, we can synchronize the state (`currentView` and `activeProjectId`) to the window's hash path (`window.location.hash`) inside a `useEffect` hook.

#### Implementation Sketch: State + Hash Listener hook

```typescript
// src/hooks/useHashRouting.ts
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const useHashRouting = () => {
  const { currentView, activeProject, selectProject, setCurrentView } = useApp();

  // Sync state to Hash URL
  useEffect(() => {
    if (currentView === 'project-selector') {
      window.location.hash = '#/projects';
    } else if (currentView === 'dashboard' && activeProject) {
      window.location.hash = `#/dashboard?project=${activeProject.id}`;
    }
  }, [currentView, activeProject]);

  // Sync Hash URL back to state on load or popstate action
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (!hash || hash.startsWith('#/projects')) {
        setCurrentView('project-selector');
        selectProject(null);
      } else if (hash.startsWith('#/dashboard')) {
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const projectId = urlParams.get('project');
        if (projectId && activeProject?.id !== projectId) {
          selectProject(projectId);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    // Execute on initial run to handle bookmarked URLs
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectProject, activeProject]);
};
```

---

## 4. Evidence Chain

1. **R1 Prompt Requirement**: "Newly logged-in users must be prompted to create a default project if none exist."
   - **Recommendation Integration**: `AppContext.tsx` implementation loads project list on success. If empty, the app transitions view to `'project-selector'` and sets focus on a project creation trigger.
2. **R6 Prompt Requirement**: "Mock/Demo Mode that activates when no valid Google Client ID is configured in `.env.local` or via a 'Mock Login' toggle."
   - **Recommendation Integration**: `AuthContext.tsx` checks `import.meta.env.VITE_GOOGLE_CLIENT_ID` configuration existence on initialization and provides explicit controls `loginAsMock()` and `toggleMockMode(boolean)`.
3. **Storage Interface Contract (PROJECT.md)**: Requires code flexibility to swap out storage targets (`StorageAdapter` interface).
   - **Recommendation Integration**: `AppContext.tsx` uses a memoized storage factory selector that chooses the correct storage adapter dynamically based on the state of `isMockMode` provided by `AuthContext`.
