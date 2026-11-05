import { createContext } from 'react';
import { AppRoute, BreadcrumbItem } from '../types/navigation';

export interface NavigationContextType {
  currentRoute: AppRoute;
  breadcrumbs: BreadcrumbItem[];
  navigate: (target: AppRoute | string) => void;
  goBack: () => void;
  canGoBack: boolean;
}

export const NavigationContext = createContext<NavigationContextType | undefined>(undefined);
