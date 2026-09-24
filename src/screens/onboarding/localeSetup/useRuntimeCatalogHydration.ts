import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BibleTranslation } from '../../../types';
import {
  ensureRuntimeCatalogLoaded,
  hasRuntimeCatalogTranslations,
} from '../../../services/translations';
import {
  getRuntimeCatalogHydrationPolicy,
  hydrateRuntimeCatalogWithRetry,
  type SetupMode,
} from '../localeSetupModel';

/**
 * First run loads the Bible library's runtime catalog behind the bundled Bibles.
 * The automatic first load retries once before the "can't reach" card appears;
 * `retry` starts another round.
 */
export function useRuntimeCatalogHydration(mode: SetupMode, translations: BibleTranslation[]) {
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(mode === 'initial');
  const [runtimeCatalogLoadFailed, setRuntimeCatalogLoadFailed] = useState(false);
  const [runtimeCatalogHydrationAttempt, setRuntimeCatalogHydrationAttempt] = useState(0);
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

  useEffect(() => {
    if (mode !== 'initial' || hasHydratedRuntimeCatalog) {
      // The effect is what starts (or skips) the request, so it owns the flags too.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsHydratingRuntimeCatalog(false);
      setRuntimeCatalogLoadFailed(false);
      return;
    }

    let isMounted = true;
    setIsHydratingRuntimeCatalog(true);
    setRuntimeCatalogLoadFailed(false);

    // The Bibles that ship with the app stay selectable the whole time.
    // ensureRuntimeCatalogLoaded resolves false (it does not throw) when the
    // library is unreachable or returns no usable catalog.
    void hydrateRuntimeCatalogWithRetry(
      () => ensureRuntimeCatalogLoaded(),
      getRuntimeCatalogHydrationPolicy(runtimeCatalogHydrationAttempt),
      { shouldContinue: () => isMounted }
    )
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (result !== 'loaded') {
          console.warn('[Onboarding] Failed to hydrate runtime translation catalog:', result);
          setRuntimeCatalogLoadFailed(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsHydratingRuntimeCatalog(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasHydratedRuntimeCatalog, mode, runtimeCatalogHydrationAttempt]);

  const retryRuntimeCatalog = useCallback(
    () => setRuntimeCatalogHydrationAttempt((currentAttempt) => currentAttempt + 1),
    []
  );

  return {
    isHydratingRuntimeCatalog,
    runtimeCatalogLoadFailed,
    hasHydratedRuntimeCatalog,
    retryRuntimeCatalog,
  };
}
