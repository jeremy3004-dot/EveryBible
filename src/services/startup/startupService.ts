interface StartupCoordinatorDependencies {
  initializeAuth: () => Promise<void>;
  initializePrivacy: () => Promise<void>;
  preloadBibleData: () => Promise<void>;
  migrateStorage?: () => Promise<void>;
  scheduleTask?: (task: () => Promise<void> | void) => () => void;
  onWarmupError?: (error: unknown) => void;
  criticalTaskTimeoutMs?: number;
  onCriticalTimeout?: (taskName: 'auth' | 'privacy') => void;
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

export const createStartupCoordinator = ({
  initializeAuth,
  initializePrivacy,
  preloadBibleData,
  migrateStorage,
  scheduleTask = defaultScheduleTask,
  onWarmupError,
  criticalTaskTimeoutMs = DEFAULT_CRITICAL_TASK_TIMEOUT_MS,
  onCriticalTimeout,
}: StartupCoordinatorDependencies) => ({
  initializeCritical: async () => {
    // Run storage migration before auth/privacy so MMKV keys are populated
    // before stores attempt to rehydrate. Failure is non-fatal.
    if (migrateStorage) {
      try {
        await migrateStorage();
      } catch (error) {
        // Migration failure is non-fatal — stores will use initial defaults
        console.warn('[Startup] Storage migration failed:', error);
      }
    }
    await runCriticalTask({
      taskName: 'auth',
      task: initializeAuth,
      timeoutMs: criticalTaskTimeoutMs,
      onTimeout: onCriticalTimeout,
    });
    await runCriticalTask({
      taskName: 'privacy',
      task: initializePrivacy,
      timeoutMs: criticalTaskTimeoutMs,
      onTimeout: onCriticalTimeout,
    });
  },

  startDeferredWarmups: () =>
    scheduleTask(async () => {
      try {
        await preloadBibleData();
      } catch (error) {
        onWarmupError?.(error);
      }
    }),
});

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
}) {
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
    await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
