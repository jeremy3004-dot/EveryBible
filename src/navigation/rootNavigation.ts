import { createNavigationContainerRef } from '@react-navigation/native';
import type { AuthScreenMode, RootTabParamList } from './types';

export const rootNavigationRef = createNavigationContainerRef<RootTabParamList>();

// `initial: false` keeps MoreScreen under the modal. Without it, a More stack that has
// not rendered yet (the tab was never opened) starts as [Auth] alone: closing the modal
// falls through to the tab navigator, and the More tab keeps showing it afterwards.
const buildAuthRoute = (mode: AuthScreenMode) =>
  ({
    screen: 'Auth',
    params: {
      screen: 'AuthScreen',
      params: {
        initialMode: mode,
      },
    },
    initial: false,
  }) as const;

export const openAuthFlow = (mode: AuthScreenMode = 'signIn'): void => {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('More', buildAuthRoute(mode));
  }
};
