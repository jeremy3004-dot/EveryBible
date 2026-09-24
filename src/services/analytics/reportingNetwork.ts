import type { NetInfoState } from '@react-native-community/netinfo';

/**
 * Optional uploads (usage analytics, crash reports) wait for a connected network that the
 * OS does not report as unreachable or metered. Unknown reachability/cost counts as usable
 * once connected; unknown connectivity does not.
 */
export function isReportingNetworkUsable(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable' | 'details'> | null | undefined
): boolean {
  if (!state) return false;
  const details = state.details as { isConnectionExpensive?: boolean } | null | undefined;
  return (
    state.isConnected === true &&
    state.isInternetReachable !== false &&
    details?.isConnectionExpensive !== true
  );
}
