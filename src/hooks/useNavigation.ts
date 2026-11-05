import { useContext } from 'react';
import { NavigationContext, NavigationContextType } from '../context/NavigationContextDef';

export const useNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
