import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { handleAuthDeepLinkUrl } from '../services/auth/authDeepLink';

// Password-reset links arrive with recovery tokens in the URL fragment, which React
// Navigation's path-based linkingConfig never sees (fragments aren't passed to
// getStateFromPath). This raw Linking listener is what actually extracts and applies them.
export function useAuthDeepLink(): void {
  useEffect(() => {
    let isMounted = true;

    Linking.getInitialURL()
      .then((url) => {
        if (isMounted && url) {
          void handleAuthDeepLinkUrl(url);
        }
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthDeepLinkUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);
}
