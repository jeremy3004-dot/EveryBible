import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/authStore';

/**
 * One analytics session per foreground, and exactly one session_started /
 * session_ended per session. A signed-in session's lifecycle events are owned by
 * the authenticated path (so they carry user_id); it still sets up the anonymous
 * session_id context that audio and reading events use, without emitting a second
 * session_started. A signed-out session is owned by anonymous analytics. Auth is
 * read live when a session starts, and the session ends on the path it started on.
 * A cold start's session is attributed once the session restore has finished, so a
 * signed-in reader is not counted as anonymous; leaving the app first starts it with
 * what is known then. The analytics service is imported lazily so it stays off the
 * startup path.
 */
export function useAppSessionAnalytics(enabled: boolean): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let sessionWasAuthenticated = false;
    // Starts a session still waiting for the session restore, straight away.
    let startPendingSession: (() => void) | null = null;
    const startAnalyticsSessions = () => {
      void import('../services/analytics').then(
        ({
          startAnonymousUsageSession,
          initAnonymousSessionContext,
          startSession,
          primeGeoContext,
        }) => {
          // Resolve geo ONCE per foreground (fire-and-forget, timed out) so the
          // flush — which fires on app-background when the network may be gone —
          // attaches cached location instead of losing the race to server IP.
          void primeGeoContext();

          const beginSession = () => {
            startPendingSession = null;
            // Read auth live at call time so a mid-session sign-in/out is attributed
            // correctly without tearing down the AppState listener on every auth change.
            sessionWasAuthenticated = useAuthStore.getState().isAuthenticated;
            if (sessionWasAuthenticated) {
              // Authenticated path: the session lifecycle event (session_started /
              // session_ended) is owned by analyticsService so it carries user_id.
              // We still establish an anonymous session_id context so that
              // audio_playback_progress and reading_ended — which always flow
              // through trackAnonymousUsageEvent for ALL users — have a valid
              // session_id. Without this setup those events would
              // lazily create a new anonymous session and emit their own
              // session_started, which is worse than just pre-creating the id.
              const sessionId = initAnonymousSessionContext();
              startSession(sessionId);
            } else {
              // Unauthenticated path: anonymous analytics owns both the session
              // context and the session lifecycle event (session_started).
              startAnonymousUsageSession();
            }
          };

          if (useAuthStore.getState().isInitialized) {
            beginSession();
            return;
          }
          // Cold start: auth is not known until the session restore finishes.
          const unsubscribe = useAuthStore.subscribe((state) => {
            if (state.isInitialized) {
              startPendingSession?.();
            }
          });
          startPendingSession = () => {
            unsubscribe();
            beginSession();
          };
        }
      );
    };

    const endAndFlushAnalyticsSessions = () => {
      void import('../services/analytics').then(
        ({
          endAnonymousUsageSession,
          clearAnonymousSessionContext,
          flushAnonymousUsageEvents,
          endSession,
          flushEvents,
        }) => {
          startPendingSession?.();
          if (sessionWasAuthenticated) {
            // Authenticated path: session_ended is emitted by the authenticated
            // analytics path. We only reset the anonymous session_id context (no
            // duplicate session_ended event) and flush both queues so audio /
            // reading events captured during this session are delivered.
            clearAnonymousSessionContext();
            endSession();
          } else {
            // Unauthenticated path: anonymous analytics owns the session_ended event.
            endAnonymousUsageSession();
          }
          // Both facades share one durable queue; concurrent calls are coalesced.
          void flushAnonymousUsageEvents();
          void flushEvents();
        }
      );
    };

    if (AppState.currentState === 'active') {
      startAnalyticsSessions();
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousAppState = appStateRef.current;

      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        startAnalyticsSessions();
      }

      if (previousAppState === 'active' && nextAppState.match(/inactive|background/)) {
        endAndFlushAnalyticsSessions();
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();

      if (appStateRef.current === 'active') {
        endAndFlushAnalyticsSessions();
      }
    };
  }, [enabled]);
}
