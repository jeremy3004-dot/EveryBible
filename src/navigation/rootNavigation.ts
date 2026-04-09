import { createNavigationContainerRef } from '@react-navigation/native';
import type { AuthScreenMode, RootTabParamList } from './types';

export const rootNavigationRef = createNavigationContainerRef<RootTabParamList>();

const buildAuthRoute = (mode: AuthScreenMode) =>
  ({
    screen: 'Auth',
    params: {
      screen: 'AuthScreen',
      params: {
        initialMode: mode,
      },
    },
  }) as const;

export const openAuthFlow = (mode: AuthScreenMode = 'signIn'): void => {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('More', buildAuthRoute(mode));
  }
};
