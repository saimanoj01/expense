import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export const useHashRouting = (
  selectedMonth?: string,
  setSelectedMonth?: (m: string) => void,
  isUserSelectedMonth?: boolean
) => {
  const { currentView, activeProject, selectProject, setCurrentView, isLoading } = useApp();

  // Sync state to Hash URL
  useEffect(() => {
    if (isLoading) return;
    const currentHash = window.location.hash;
    if (currentHash.includes('access_token=')) return;

    if (currentView === 'project-selector') {
      if (window.location.hash !== '#/projects') {
        window.location.hash = '#/projects';
      }
    } else if (currentView === 'dashboard' && activeProject) {
      const monthPart = (isUserSelectedMonth && selectedMonth && selectedMonth !== 'all') ? `&month=${selectedMonth}` : '';
      const targetHash = `#/dashboard?project=${activeProject.id}${monthPart}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  }, [currentView, activeProject, selectedMonth, isUserSelectedMonth, isLoading]);

  // Sync Hash URL back to state on load or popstate action
  useEffect(() => {
    if (isLoading) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('access_token=')) return;

      if (hash.startsWith('#/projects')) {
        setCurrentView('project-selector');
        selectProject(null);
      } else if (hash.startsWith('#/dashboard')) {
        const urlParams = new URLSearchParams(hash.split('?')[1] || '');
        const projectId = urlParams.get('project');
        if (projectId && activeProject?.id !== projectId) {
          selectProject(projectId);
        }
        const month = urlParams.get('month');
        if (month && setSelectedMonth && /^\d{4}-\d{2}$/.test(month) && month !== selectedMonth) {
          setSelectedMonth(month);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    // Execute on initial run to handle bookmarked URLs
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectProject, activeProject, setCurrentView, setSelectedMonth, selectedMonth, isLoading]);
};
