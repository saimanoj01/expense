import React, { createContext } from 'react';
import { AppRoute, BreadcrumbItem } from '../types/navigation';

export interface NavigationContextType {
  currentRoute: AppRoute;
  breadcrumbs: BreadcrumbItem[];
  navigate: (target: AppRoute | string) => void;
  goBack: () => void;
  canGoBack: boolean;
  direction: number;
  mainRef: React.RefObject<HTMLElement>;
  smoothNonMonthly: boolean;
  setSmoothNonMonthly: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export const NavigationContext = createContext<NavigationContextType | undefined>(undefined);
