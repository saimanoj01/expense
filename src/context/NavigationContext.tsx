import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppRoute } from '../types/navigation';
import { parseHash, routeToHash, computeParentRoute, buildBreadcrumbs } from '../utils/navigation';
import { Category } from '../services/storage';
import { NavigationContext } from './NavigationContextDef';

interface NavigationProviderProps {
  children: React.ReactNode;
  activeMonth: string;
  onMonthChange?: (month: string) => void;
  onSelectProject?: (projectId: string | null) => void;
  categories?: Category[];
  categoryTxnCount?: number;
  monthTxnCount?: number;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  activeMonth,
  onMonthChange,
  onSelectProject,
  categories = [],
  categoryTxnCount,
  monthTxnCount
}) => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (typeof window !== 'undefined') {
      return parseHash(window.location.hash, activeMonth);
    }
    return { view: 'overview', level: 1, month: activeMonth };
  });

  const onMonthChangeRef = useRef(onMonthChange);
  onMonthChangeRef.current = onMonthChange;

  const onSelectProjectRef = useRef(onSelectProject);
  onSelectProjectRef.current = onSelectProject;

  const activeMonthRef = useRef(activeMonth);
  activeMonthRef.current = activeMonth;

  const syncHashState = useCallback((hash: string) => {
    if (hash.includes('access_token=') || hash.includes('error=')) {
      return; // Handled by AuthContext
    }

    const parsed = parseHash(hash, activeMonthRef.current);
    setCurrentRoute(parsed);

    // Sync project if present in query or if navigating to projects
    if (parsed.projectId && onSelectProjectRef.current) {
      onSelectProjectRef.current(parsed.projectId);
    } else if (parsed.view === 'projects' && onSelectProjectRef.current) {
      onSelectProjectRef.current(null);
    }

    // Sync month if changed
    if (parsed.month && parsed.month !== activeMonthRef.current && onMonthChangeRef.current) {
      onMonthChangeRef.current(parsed.month);
    }

    // Canonical redirect for empty, #/dashboard, or fallback overview hashes
    const targetMonth = parsed.month || activeMonthRef.current;
    const canonicalOverviewHash = `#/month/${targetMonth}`;
    if (parsed.view === 'overview' && hash !== canonicalOverviewHash) {
      window.history.replaceState(null, '', canonicalOverviewHash);
    }
  }, []);

  // Listen for hashchange events
  useEffect(() => {
    syncHashState(window.location.hash);
    const handleHashChange = () => {
      syncHashState(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [syncHashState]);

  // Synchronize when activeMonth changes from an external control (e.g. MonthSwitcher or selector)
  useEffect(() => {
    if (activeMonth && currentRoute.month !== activeMonth && currentRoute.view !== 'projects') {
      setCurrentRoute(() => {
        const parsedCurrent = parseHash(window.location.hash, activeMonth);
        const next: AppRoute = { ...parsedCurrent, month: activeMonth };
        const newHash = routeToHash(next, activeMonth);
        if (window.location.hash !== newHash) {
          window.location.hash = newHash;
        }
        return next;
      });
    }
  }, [activeMonth, currentRoute.month, currentRoute.view]);

  // Navigate helper
  const navigate = useCallback((target: AppRoute | string) => {
    if (typeof target === 'string') {
      const formatted = target.startsWith('#') ? target : `#${target.startsWith('/') ? target : '/' + target}`;
      if (window.location.hash !== formatted) {
        window.location.hash = formatted;
      } else {
        syncHashState(formatted);
      }
    } else {
      const newHash = routeToHash(target, activeMonth);
      if (window.location.hash !== newHash) {
        window.location.hash = newHash;
      } else {
        syncHashState(newHash);
      }
    }
  }, [activeMonth, syncHashState]);

  // Go back helper
  const canGoBack = currentRoute.level > 1 || ['budgets', 'trends', 'reports', 'settings', 'transactions'].includes(currentRoute.view);

  const goBack = useCallback(() => {
    // If we have history and can pop
    if (canGoBack) {
      const parent = computeParentRoute(currentRoute, categories);
      const parentHash = routeToHash(parent, activeMonth);
      if (window.location.hash !== parentHash) {
        window.location.hash = parentHash;
      }
    }
  }, [canGoBack, currentRoute, categories, activeMonth]);

  // Keyboard navigation shortcuts: Escape or Alt + ArrowLeft
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input, textarea, or contentEditable element
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      
      // Also ignore if a modal is open (modals handle their own Escape)
      const hasOpenModal = !!document.querySelector('[role="dialog"], .fixed.inset-0.z-50');

      if (!isInput && !hasOpenModal) {
        if (e.key === 'Escape' || (e.altKey && e.key === 'ArrowLeft')) {
          if (canGoBack) {
            e.preventDefault();
            goBack();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoBack, goBack]);

  const breadcrumbs = useMemo(() => {
    return buildBreadcrumbs(currentRoute, categories, { categoryTxnCount, monthTxnCount });
  }, [currentRoute, categories, categoryTxnCount, monthTxnCount]);

  const value = useMemo(() => ({
    currentRoute,
    breadcrumbs,
    navigate,
    goBack,
    canGoBack
  }), [currentRoute, breadcrumbs, navigate, goBack, canGoBack]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
