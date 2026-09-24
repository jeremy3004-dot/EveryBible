import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { handleAuthDeepLinkUrl } from '../services/auth/authDeepLink';

// Password-reset links carry a one-time PKCE code (or, for an expired link, an
// error) that React Navigation's path-based linkingConfig does not act on. This raw
// Linking listener hands every URL to handleAuthDeepLinkUrl, which parks the code.
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
