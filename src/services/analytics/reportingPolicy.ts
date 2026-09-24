import type { NetInfoState } from '@react-native-community/netinfo';

// Unknown connectivity defers optional work. Once connected, unknown
// reachability/cost is usable until the OS explicitly reports otherwise.
let allowed = false;
let isForeground = () => false;
// Read currentState as well: an earlier AppState listener may flush before our
// own callback receives the same background event.
export const canReportUsage = (): boolean => allowed && isForeground();

// Other optional uploaders (crash reports) follow the same policy without
// installing a second set of AppState/NetInfo listeners.
const listeners = new Set<() => void>();
const notifyListeners = () => {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A failing subscriber must not stop the usage queue's own reaction.
    }
  }
};

export function subscribeToReportingPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installReportingPolicy(onChange: () => void): () => void {
  // Only the deferred runtime owner calls this. No native reads at module load.
  const { AppState } = require('react-native') as typeof import('react-native');
  const NetInfo = require('@react-native-community/netinfo')
    .default as typeof import('@react-native-community/netinfo').default;
  isForeground = () => AppState.currentState === 'active';
  let active = isForeground();
  let state: NetInfoState | null = null;
  let disposed = false;
  let refreshGeneration = 0;
  let networkRevision = 0;
  let refreshing = false;
  const update = () => {
    if (disposed) return;
    const next =
      active &&
      !refreshing &&
      state?.isConnected === true &&
      state.isInternetReachable !== false &&
      state.details?.isConnectionExpensive !== true;
    if (next === allowed) return;
    allowed = next;
    onChange();
    notifyListeners();
  };
  const appSubscription = AppState.addEventListener('change', (status) => {
    const nextActive = status === 'active';
    if (nextActive === active) return;
    active = nextActive;
    state = null;
    const generation = ++refreshGeneration;
    refreshing = active;
    update();
    if (!active) return;
    // iOS can miss network changes while backgrounded. refresh() asks native
    // for current state; fetch() may only return NetInfo's stale cached value.
    const revision = networkRevision;
    void NetInfo.refresh().then(
      (next) => {
        if (disposed || generation !== refreshGeneration) return;
        refreshing = false;
        if (revision === networkRevision) state = next;
        update();
      },
      () => {
        if (disposed || generation !== refreshGeneration) return;
        refreshing = false;
        state = null;
        update();
      }
    );
  });
  const unsubscribe = NetInfo.addEventListener((next) => {
    networkRevision += 1;
    state = next;
    update();
  });
  return () => {
    disposed = true;
    unsubscribe();
    appSubscription.remove();
    allowed = false;
    onChange();
    notifyListeners();
  };
}
