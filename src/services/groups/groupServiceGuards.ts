export type SyncedGroupServiceAvailability =
  | 'backend-unavailable'
  | 'signin-required'
  | 'ready';

export function getSyncedGroupServiceAvailability({
  backendConfigured,
  signedIn,
}: {
  backendConfigured: boolean;
  signedIn: boolean;
}): SyncedGroupServiceAvailability {
  if (!backendConfigured) {
    return 'backend-unavailable';
  }

  if (!signedIn) {
    return 'signin-required';
  }

  return 'ready';
}

export function assertSyncedGroupServiceReady({
  backendConfigured,
  signedIn,
  action = 'continue with synced groups',
}: {
  backendConfigured: boolean;
  signedIn: boolean;
  action?: string;
}): void {
  const availability = getSyncedGroupServiceAvailability({
    backendConfigured,
    signedIn,
  });

  if (availability === 'backend-unavailable') {
    throw new Error('EveryBible backend is not configured for this build yet.');
  }

  if (availability === 'signin-required') {
    throw new Error(`You must be signed in to ${action}`);
  }
}
