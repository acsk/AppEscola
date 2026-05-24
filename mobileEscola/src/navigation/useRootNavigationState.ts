import { useEffect, useState } from 'react';
import type { NavigationState } from '@react-navigation/native';
import { navigationRef } from './navigationRef';

/** Estado da navegação para componentes fora do Navigator (ex.: drawer overlay). */
export function useRootNavigationState(): NavigationState | undefined {
  const [state, setState] = useState<NavigationState | undefined>(() =>
    navigationRef.isReady() ? navigationRef.getRootState() : undefined,
  );

  useEffect(() => {
    const sync = () => {
      if (navigationRef.isReady()) {
        setState(navigationRef.getRootState());
      }
    };

    sync();
    return navigationRef.addListener('state', sync);
  }, []);

  return state;
}
