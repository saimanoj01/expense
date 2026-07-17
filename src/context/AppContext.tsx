import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Project, StorageAdapter, LocalStorageAdapter, GoogleSheetsAdapter } from '../services/storage';
import { useAuth } from './AuthContext';

export type ViewType = 'project-selector' | 'dashboard';

export interface AppContextType {
  projects: Project[];
  activeProject: Project | null;
  currentView: ViewType;
  isLoading: boolean;
  error: string | null;
  storageAdapter: StorageAdapter;
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string | null) => void;
  createNewProject: (name: string) => Promise<Project>;
  setCurrentView: (view: ViewType) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isMockMode, isLoading: authIsLoading } = useAuth();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('project-selector');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize storage adapter selection based on AuthContext state
  const storageAdapter: StorageAdapter = useMemo(() => {
    if (isMockMode) {
      return new LocalStorageAdapter();
    } else {
      return new GoogleSheetsAdapter();
    }
  }, [isMockMode]);

  useEffect(() => {
    if (import.meta.env.DEV || (typeof window !== 'undefined' && (window as any).__PLAYWRIGHT__)) {
      (window as any).expenseStorage = storageAdapter;
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
      
      // Determine target project ID to select on initialization
      let targetProjectId = localStorage.getItem('expense_active_project_id');
      let found = targetProjectId ? list.find(p => p.id === targetProjectId) : undefined;
      if (!found && list.length > 0) {
        found = list[0];
      }
      if (found) {
        setActiveProject(found);
        setCurrentView('dashboard');
        localStorage.setItem('expense_active_project_id', found.id);
        window.location.hash = `#/dashboard?project=${found.id}`;
      } else {
        setActiveProject(null);
        setCurrentView('project-selector');
        localStorage.removeItem('expense_active_project_id');
        window.location.hash = '#/projects';
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, storageAdapter]);

  useEffect(() => {
    if (authIsLoading) return;
    if (isAuthenticated) {
      loadProjects();
    } else {
      setProjects([]);
      setActiveProject(null);
      setCurrentView('project-selector');
      setIsLoading(false);
    }
  }, [isAuthenticated, authIsLoading, loadProjects]);

  const selectProject = (projectId: string | null) => {
    if (!projectId) {
      setActiveProject(null);
      setCurrentView('project-selector');
      localStorage.removeItem('expense_active_project_id');
      window.location.hash = '#/projects';
      return;
    }
    const found = projects.find(p => p.id === projectId);
    if (found) {
      setActiveProject(found);
      setCurrentView('dashboard');
      localStorage.setItem('expense_active_project_id', projectId);
    } else if (projects.length > 0) {
      setActiveProject(null);
      setCurrentView('project-selector');
      localStorage.removeItem('expense_active_project_id');
      window.location.hash = '#/projects';
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
      window.location.hash = '';
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

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
