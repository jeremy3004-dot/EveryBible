interface StartupCoordinatorDependencies {
  initializeAuth: () => Promise<void>;
  initializePrivacy: () => Promise<void>;
  preloadBibleData: () => Promise<void>;
  scheduleTask?: (task: () => Promise<void> | void) => () => void;
  onWarmupError?: (error: unknown) => void;
}

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
  scheduleTask = defaultScheduleTask,
  onWarmupError,
}: StartupCoordinatorDependencies) => ({
  initializeCritical: async () => {
    await initializeAuth();
    await initializePrivacy();
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
