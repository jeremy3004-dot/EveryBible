interface StartupCoordinatorDependencies {
  initializeAuth: () => Promise<void>;
  initializePrivacy: () => Promise<void>;
  preloadBibleData: () => Promise<void>;
  preloadRuntimeTranslations?: () => Promise<void>;
  migrateStorage?: () => Promise<void>;
  scheduleTask?: (task: () => Promise<void> | void) => () => void;
  onWarmupError?: (error: unknown) => void;
  criticalTaskTimeoutMs?: number;
  onCriticalTimeout?: (taskName: 'migrateStorage' | 'auth' | 'privacy') => void;
  migrateStorageTimeoutMs?: number;
}

const DEFAULT_CRITICAL_TASK_TIMEOUT_MS = 4000;
const DEFAULT_MIGRATION_TIMEOUT_MS = 2000;

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
  preloadRuntimeTranslations,
  migrateStorage,
  scheduleTask = defaultScheduleTask,
  onWarmupError,
  criticalTaskTimeoutMs = DEFAULT_CRITICAL_TASK_TIMEOUT_MS,
  onCriticalTimeout,
  migrateStorageTimeoutMs = DEFAULT_MIGRATION_TIMEOUT_MS,
}: StartupCoordinatorDependencies) => ({
  initializeCritical: async () => {
    // Run storage migration before auth/privacy so MMKV keys are populated
    // before stores attempt to rehydrate. Failure is non-fatal and the
    // migration is time-boxed so a broken native storage path cannot stall boot.
    if (migrateStorage) {
      await runBestEffortTask({
        taskName: 'migrateStorage',
        task: migrateStorage,
        timeoutMs: migrateStorageTimeoutMs,
        onTimeout: onCriticalTimeout,
      });
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
        if (preloadRuntimeTranslations) {
          await preloadRuntimeTranslations();
        }
        await preloadBibleData();
      } catch (error) {
        onWarmupError?.(error);
      }
    }),
});

async function runBestEffortTask({
  taskName,
  task,
  timeoutMs,
  onTimeout,
}: {
  taskName: 'migrateStorage';
  task: () => Promise<void>;
  timeoutMs: number;
  onTimeout?: (taskName: 'migrateStorage' | 'auth' | 'privacy') => void;
}) {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const taskPromise = Promise.resolve()
    .then(task)
    .catch((error) => {
      if (timedOut) {
        return;
      }

      console.warn('[Startup] Storage migration failed:', error);
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

async function runCriticalTask({
  taskName,
  task,
  timeoutMs,
  onTimeout,
}: {
  taskName: 'auth' | 'privacy';
  task: () => Promise<void>;
  timeoutMs: number;
  onTimeout?: (taskName: 'migrateStorage' | 'auth' | 'privacy') => void;
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
