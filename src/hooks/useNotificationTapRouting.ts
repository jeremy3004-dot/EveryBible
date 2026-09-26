import { useEffect } from 'react';
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from '../services/notifications/notificationBootstrap';
import {
  createNotificationTapRouter,
  getActiveReadingPlanIds,
  type NotificationTapRouter,
} from '../services/notifications/notificationTapRouting';
import { rootNavigationRef, subscribeToNavigationReady } from '../navigation/rootNavigation';

let routerPromise: Promise<NotificationTapRouter> | null = null;

/**
 * One router per launch. The plans store and catalog are imported lazily so they stay
 * off the boot path; taps are rare, and by the time one is routed the store has hydrated.
 */
function getNotificationTapRouter(): Promise<NotificationTapRouter> {
  if (!routerPromise) {
    routerPromise = Promise.all([
      import('../stores/readingPlansStore'),
      import('../data/readingPlans.generated'),
    ])
      .then(([{ readingPlansStore }, { readingPlansById }]) =>
        createNotificationTapRouter({
          isNavigationReady: () => rootNavigationRef.isReady(),
          navigate: (destination) => {
            if (destination.screen === 'PlanDetail') {
              // `initial: false` keeps PlansHome under the plan, so back leads to Plans.
              rootNavigationRef.navigate('Plans', {
                screen: 'PlanDetail',
                params: { planId: destination.planId },
                initial: false,
              });
              return;
            }
            rootNavigationRef.navigate('Plans', { screen: 'PlansHome' });
          },
          // Progress is persisted and synced, so it can name a plan the bundled catalog
          // no longer has; its detail page would have nothing to show.
          getActivePlanIds: () =>
            getActiveReadingPlanIds(readingPlansStore.getState().progressByPlanId).filter(
              (planId) => readingPlansById.has(planId)
            ),
        })
      )
      .catch((error: unknown) => {
        routerPromise = null;
        throw error;
      });
  }
  return routerPromise;
}

/**
 * Opens Plans (or the one active plan) when the daily reminder is tapped.
 *
 * Covers a tap while the app is running (the response listener) and a tap that
 * launched it (the last response, read once on mount). A cold-start tap lands
 * before the navigator exists, so it stays parked until navigation reports ready,
 * including after a privacy unlock or onboarding. Taps on other notifications only
 * open the app.
 */
export function useNotificationTapRouting(): void {
  useEffect(() => {
    let isMounted = true;
    let unsubscribeFromReady: (() => void) | null = null;
    let activeRouter: NotificationTapRouter | null = null;

    const stopWaiting = () => {
      unsubscribeFromReady?.();
      unsubscribeFromReady = null;
    };

    const waitForNavigation = (router: NotificationTapRouter) => {
      if (unsubscribeFromReady) {
        return;
      }
      const flush = () => {
        if (router.flush() || !router.hasPending()) {
          stopWaiting();
        }
      };
      unsubscribeFromReady = subscribeToNavigationReady(flush);
      // Readiness may have changed while the lazy store/catalog imports resolved.
      flush();
    };

    const route = (response: unknown) => {
      getNotificationTapRouter()
        .then((router) => {
          if (!isMounted) {
            return;
          }
          activeRouter = router;
          if (router.handleResponse(response) === 'pending') {
            waitForNavigation(router);
          } else if (!router.hasPending()) {
            stopWaiting();
          }
        })
        .catch(() => {
          // A tap that cannot be routed still opened the app; there is nothing more to do.
        });
    };

    const subscription = addNotificationResponseReceivedListener(route);
    getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          route(response);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      subscription.remove();
      stopWaiting();
      activeRouter?.clearPending();
    };
  }, []);
}
