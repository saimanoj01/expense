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
  mainRef?: React.RefObject<HTMLElement>;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  activeMonth,
  onMonthChange,
  onSelectProject,
  categories = [],
  categoryTxnCount,
  monthTxnCount,
  mainRef: externalMainRef,
}) => {
  const internalMainRef = useRef<HTMLElement>(null);
  const mainRef = externalMainRef || internalMainRef;

  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (typeof window !== 'undefined') {
      return parseHash(window.location.hash, activeMonth);
    }
    return { view: 'overview', level: 1, month: activeMonth };
  });

  const prevRouteRef = useRef<AppRoute>(currentRoute);
  const [direction, setDirection] = useState<number>(0);

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
    const d = Math.sign((parsed.level || 1) - (prevRouteRef.current.level || 1));
    if (d !== 0) {
      setDirection(d);
    }
    prevRouteRef.current = parsed;
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

    // Canonical redirect for empty or #/dashboard hashes
    const clean = hash.replace(/^#\/?/, '').split('?')[0];
    if (clean === '' || clean === 'dashboard') {
      const targetMonth = parsed.month || activeMonthRef.current;
      window.history.replaceState(null, '', `#/month/${targetMonth}`);
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
        prevRouteRef.current = next;
        return next;
      });
    }
  }, [activeMonth, currentRoute.month, currentRoute.view]);

  // Navigate helper
  const navigate = useCallback((target: AppRoute | string) => {
    const newHash =
      typeof target === 'string'
        ? target.startsWith('#')
          ? target
          : `#${target.startsWith('/') ? target : '/' + target}`
        : routeToHash(target, activeMonth);

    const nextParsed =
      typeof target === 'string' ? parseHash(newHash, activeMonth) : target;
    const d = Math.sign((nextParsed.level || 1) - (prevRouteRef.current.level || 1));
    setDirection(d);

    // Scroll reset before measure when drilling deeper
    if (d > 0) {
      mainRef.current?.scrollTo({ top: 0 });
    }

    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }, [activeMonth, mainRef]);

  // Go back helper
  const canGoBack = currentRoute.level > 1 || ['budgets', 'trends', 'reports', 'settings', 'transactions'].includes(currentRoute.view);

  const goBack = useCallback(() => {
    if (canGoBack) {
      setDirection(-1);
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
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      // Ignore if a modal, popover, or listbox is open
      const hasOpenOverlay = !!document.querySelector(
        '[data-radix-popper-content-wrapper], [role="dialog"], [role="listbox"], [data-popover], .fixed.inset-0.z-50'
      );

      if (!isInput && !hasOpenOverlay) {
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
    canGoBack,
    direction,
    mainRef,
  }), [currentRoute, breadcrumbs, navigate, goBack, canGoBack, direction, mainRef]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
