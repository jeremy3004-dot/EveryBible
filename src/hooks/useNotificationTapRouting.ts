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
import { rootNavigationRef } from '../navigation/rootNavigation';

const FLUSH_INTERVAL_MS = 250;
/** Stop waiting after a minute: navigation may never mount (e.g. during onboarding). */
const MAX_FLUSH_ATTEMPTS = 240;

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
 * before the navigator exists, so it is parked and retried until navigation is
 * ready. Taps on other notifications only open the app.
 */
export function useNotificationTapRouting(): void {
  useEffect(() => {
    let isMounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let activeRouter: NotificationTapRouter | null = null;

    const stopWaiting = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const waitForNavigation = (router: NotificationTapRouter) => {
      if (interval) {
        return;
      }
      let attempts = 0;
      interval = setInterval(() => {
        attempts += 1;
        if (router.flush() || !router.hasPending()) {
          stopWaiting();
        } else if (attempts >= MAX_FLUSH_ATTEMPTS) {
          router.clearPending();
          stopWaiting();
        }
      }, FLUSH_INTERVAL_MS);
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
