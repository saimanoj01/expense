import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Project, StorageAdapter, LocalStorageAdapter, GoogleSheetsAdapter } from '../services/storage';
import { useAuth } from './AuthContext';
import { getCurrentLocalMonth, parseHash } from '../utils/navigation';

export type ViewType = 'project-selector' | 'dashboard';

export interface AppContextType {
  projects: Project[];
  activeProject: Project | null;
  currentView: ViewType;
  isLoading: boolean;
  isProjectsLoaded: boolean;
  error: string | null;
  storageAdapter: StorageAdapter;
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string | null) => void;
  createNewProject: (name: string) => Promise<Project>;
  setCurrentView: (view: ViewType) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isMockMode, isLoading: authIsLoading, setShowSessionExpiredModal } = useAuth();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('project-selector');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize storage adapter selection based on AuthContext state
  const storageAdapter: StorageAdapter = useMemo(() => {
    if (isMockMode) {
      return new LocalStorageAdapter();
    } else {
      return new GoogleSheetsAdapter(
        () => localStorage.getItem('expense_google_token'),
        (status) => {
          if (status === 401) {
            setShowSessionExpiredModal(true);
          }
        }
      );
    }
  }, [isMockMode, setShowSessionExpiredModal]);

  useEffect(() => {
    interface WindowWithPlaywright extends Window {
      __PLAYWRIGHT__?: boolean;
      expenseStorage?: StorageAdapter;
    }
    const win = typeof window !== 'undefined' ? (window as unknown as WindowWithPlaywright) : undefined;
    if (win && (import.meta.env.DEV || win.__PLAYWRIGHT__)) {
      win.expenseStorage = storageAdapter;
    }
  }, [storageAdapter]);

  // Load projects list when user becomes authenticated or storage adapter changes
  const loadProjects = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await storageAdapter.getProjects();
      setProjects(list);
      
      // Determine target project ID to select on initialization (prefer query param from hash if present)
      const parsedInitial = parseHash(window.location.hash);
      const targetProjectId = parsedInitial.projectId || localStorage.getItem('expense_active_project_id');
      let found = targetProjectId ? list.find(p => p.id === targetProjectId) : undefined;
      if (!found && list.length > 0) {
        found = list[0];
      }
      if (found) {
        setActiveProject(found);
        setCurrentView('dashboard');
        localStorage.setItem('expense_active_project_id', found.id);
        if (
          !window.location.hash ||
          window.location.hash === '#/' ||
          window.location.hash === '#' ||
          window.location.hash.startsWith('#/dashboard') ||
          window.location.hash.startsWith('#/projects')
        ) {
          const targetMonth = parsedInitial.month || getCurrentLocalMonth();
          window.history.replaceState(null, '', `#/month/${targetMonth}`);
        }
      } else {
        setActiveProject(null);
        setCurrentView('project-selector');
        localStorage.removeItem('expense_active_project_id');
        window.history.replaceState(null, '', `#/month/${getCurrentLocalMonth()}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
      setIsProjectsLoaded(true);
    }
  }, [isAuthenticated, storageAdapter]);

  useEffect(() => {
    if (authIsLoading) return;
    if (isAuthenticated) {
      setIsLoading(true);
      loadProjects();
    } else {
      setProjects([]);
      setActiveProject(null);
      setCurrentView('project-selector');
      setIsLoading(false);
      setIsProjectsLoaded(false);
    }
  }, [isAuthenticated, authIsLoading, loadProjects]);

  const selectProject = (projectId: string | null) => {
    if (!projectId) {
      if (projects.length > 0) {
        const fallback = projects[0];
        setActiveProject(fallback);
        setCurrentView('dashboard');
        localStorage.setItem('expense_active_project_id', fallback.id);
      } else {
        setActiveProject(null);
        setCurrentView('project-selector');
        localStorage.removeItem('expense_active_project_id');
      }
      return;
    }
    const found = projects.find(p => p.id === projectId);
    if (found) {
      const isSwitchingProject = activeProject && activeProject.id !== projectId;
      setActiveProject(found);
      setCurrentView('dashboard');
      localStorage.setItem('expense_active_project_id', projectId);
      if (isSwitchingProject) {
        const hash = window.location.hash || '';
        if (hash.includes('/category/') || hash.includes('/bucket/')) {
          window.location.hash = `#/month/${getCurrentLocalMonth()}`;
        }
      }
    } else if (projects.length === 0) {
      // Cold-load before loadProjects() resolves: persist requested projectId so loadProjects() picks it up
      localStorage.setItem('expense_active_project_id', projectId);
    } else {
      // Stale ?project= query param: keep existing workspace rather than trapping user on empty prompt
      const fallback = activeProject || projects[0];
      setActiveProject(fallback);
      setCurrentView('dashboard');
      localStorage.setItem('expense_active_project_id', fallback.id);
    }
  };

  const createNewProject = async (name: string): Promise<Project> => {
    setIsLoading(true);
    setError(null);
    try {
      const newProj = await storageAdapter.createProject(name);
      const updatedList = await storageAdapter.getProjects();
      setProjects(updatedList);
      setActiveProject(newProj);
      setCurrentView('dashboard');
      localStorage.setItem('expense_active_project_id', newProj.id);
      window.location.hash = `#/month/${getCurrentLocalMonth()}`;
      return newProj;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
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
      isProjectsLoaded,
      error,
      storageAdapter,
      loadProjects,
      selectProject,
      createNewProject,
      setCurrentView
    }}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
