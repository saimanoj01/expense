import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { parseHash } from '../utils/navigation';
import { AppRoute } from '../types/navigation';

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
    if (currentHash.includes('access_token=') || currentHash.includes('error=')) return;

    if (currentView === 'project-selector') {
      if (window.location.hash !== '#/projects') {
        window.location.hash = '#/projects';
      }
    } else if (currentView === 'dashboard' && activeProject) {
      const cleanHash = currentHash.replace(/^#\/?/, '');
      // If the current hash already represents a valid subview, don't overwrite with legacy #/dashboard
      if (
        cleanHash.startsWith('month') || 
        cleanHash.startsWith('budgets') || 
        cleanHash.startsWith('trends') || 
        cleanHash.startsWith('reports') || 
        cleanHash.startsWith('settings') || 
        cleanHash.startsWith('transactions') || 
        /^\d{4}-\d{2}/.test(cleanHash)
      ) {
        return;
      }
      
      const monthPart = (isUserSelectedMonth && selectedMonth && selectedMonth !== 'all') ? `&month=${selectedMonth}` : '';
      const targetHash = `#/dashboard?project=${activeProject.id}${monthPart}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  }, [currentView, activeProject, selectedMonth, isUserSelectedMonth, isLoading]);

  // Sync Hash URL back to state on load or popstate/hashchange action
  useEffect(() => {
    if (isLoading) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('access_token=') || hash.includes('error=')) return;

      if (hash.startsWith('#/projects')) {
        setCurrentView('project-selector');
        selectProject(null);
      } else {
        const parsed: AppRoute = parseHash(hash, selectedMonth || undefined);
        
        // Handle project selection if project query parameter is present
        if (parsed.projectId && activeProject?.id !== parsed.projectId) {
          selectProject(parsed.projectId);
        }
        
        // Handle month sync
        if (parsed.month && setSelectedMonth && /^\d{4}-\d{2}$/.test(parsed.month) && parsed.month !== selectedMonth) {
          setSelectedMonth(parsed.month);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    // Execute on initial run to handle bookmarked URLs
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectProject, activeProject, setCurrentView, setSelectedMonth, selectedMonth, isLoading]);
};
