interface StartupCoordinatorDependencies {
  initializeAuth: () => Promise<void>;
  initializePrivacy: () => Promise<void>;
  isPrivacyInitialized: () => boolean;
  preloadBibleData: () => Promise<void>;
  preloadRuntimeTranslations?: () => Promise<void>;
  scheduleTask?: (task: () => Promise<void> | void) => () => void;
  onWarmupError?: (error: unknown) => void;
  criticalTaskTimeoutMs?: number;
  onCriticalTimeout?: (taskName: 'auth' | 'privacy') => void;
}

interface AuthInitializerDependencies {
  rehydrateAuth: () => Promise<void> | void;
  initializeAuth: () => Promise<void>;
}

const DEFAULT_CRITICAL_TASK_TIMEOUT_MS = 4000;

const defaultScheduleTask = (task: () => Promise<void> | void) => {
  const timeoutId = setTimeout(() => {
    void task();
  }, 0);

  return () => {
    clearTimeout(timeoutId);
  };
};

interface PrivacyRetryInitializerDependencies {
  retryPrivacy: () => Promise<void>;
  isPrivacyInitialized: () => boolean;
  initializeAuth: () => Promise<void>;
}

/**
 * Rehydrates persisted auth state after storage migration and before auth reads
 * that state to initialize the session and onboarding flow.
 */
export const createAuthInitializer =
  ({ rehydrateAuth, initializeAuth }: AuthInitializerDependencies) =>
  async (): Promise<void> => {
    await rehydrateAuth();
    await initializeAuth();
  };

/**
 * Reopens auth only after a failed privacy-installation retry has completed
 * successfully. This keeps the retry path subject to the same ordering gate
 * as the initial startup path.
 */
export const createPrivacyRetryInitializer =
  ({ retryPrivacy, isPrivacyInitialized, initializeAuth }: PrivacyRetryInitializerDependencies) =>
  async (): Promise<void> => {
    await retryPrivacy();
    if (isPrivacyInitialized()) {
      await initializeAuth();
    }
  };

export const createStartupCoordinator = ({
  initializeAuth,
  initializePrivacy,
  isPrivacyInitialized,
  preloadBibleData,
  preloadRuntimeTranslations,
  scheduleTask = defaultScheduleTask,
  onWarmupError,
  criticalTaskTimeoutMs = DEFAULT_CRITICAL_TASK_TIMEOUT_MS,
  onCriticalTimeout,
}: StartupCoordinatorDependencies) => {
  if (!isPrivacyInitialized) {
    throw new Error('isPrivacyInitialized is required');
  }

  return {
    initializeCritical: async () => {
      const privacyCompleted = await runCriticalTask({
        taskName: 'privacy',
        task: initializePrivacy,
        timeoutMs: criticalTaskTimeoutMs,
        onTimeout: onCriticalTimeout,
      });

      if (!privacyCompleted || !isPrivacyInitialized()) {
        return;
      }

      await runCriticalTask({
        taskName: 'auth',
        task: initializeAuth,
        timeoutMs: criticalTaskTimeoutMs,
        onTimeout: onCriticalTimeout,
      });
    },

    startDeferredWarmups: () =>
      scheduleTask(async () => {
        try {
          if (preloadRuntimeTranslations) {
            await preloadRuntimeTranslations();
          }
          await preloadBibleData();
        } catch (error) {
          onWarmupError?.(error);
        }
      }),
  };
};

async function runCriticalTask({
  taskName,
  task,
  timeoutMs,
  onTimeout,
}: {
  taskName: 'auth' | 'privacy';
  task: () => Promise<void>;
  timeoutMs: number;
  onTimeout?: (taskName: 'auth' | 'privacy') => void;
}): Promise<boolean> {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const taskPromise = Promise.resolve()
    .then(task)
    .catch((error) => {
      if (timedOut) {
        return;
      }

      throw error;
    });

  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      onTimeout?.(taskName);
      resolve();
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise.then(() => true), timeoutPromise.then(() => false)]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
