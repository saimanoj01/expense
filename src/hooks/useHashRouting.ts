import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const useHashRouting = () => {
  const { currentView, activeProject, selectProject, setCurrentView, isLoading } = useApp();

  // Sync state to Hash URL
  useEffect(() => {
    if (isLoading) return;
    if (currentView === 'project-selector') {
      window.location.hash = '#/projects';
    } else if (currentView === 'dashboard' && activeProject) {
      window.location.hash = `#/dashboard?project=${activeProject.id}`;
    }
  }, [currentView, activeProject, isLoading]);

  // Sync Hash URL back to state on load or popstate action
  useEffect(() => {
    if (isLoading) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/projects')) {
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
  }, [selectProject, activeProject, setCurrentView, isLoading]);
};
