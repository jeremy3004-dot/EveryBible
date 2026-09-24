/**
 * Tells in-app listeners that the notification permission may just have changed
 * because the app asked for it. A change made in system settings is picked up when
 * the app returns to the foreground instead; an in-app prompt does not reliably
 * send the app through the background on Android, so it announces itself here.
 *
 * Kept free of imports so the hooks that listen (Settings' notice, push-token
 * registration) do not pull the notification service onto the startup path.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function addNotificationPermissionRequestListener(listener: Listener): {
  remove: () => void;
} {
  listeners.add(listener);
  return {
    remove: () => {
      listeners.delete(listener);
    },
  };
}

export function notifyNotificationPermissionRequested(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // One listener's failure must not keep the others from re-checking.
    }
  }
}
