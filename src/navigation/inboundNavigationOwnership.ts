/** URL events and reminder taps share one app-lifetime navigation owner. */
export type InboundNavigationArrival = object;

const launchArrival: InboundNavigationArrival = {};
let currentArrival = launchArrival;

export function claimInboundNavigation(): InboundNavigationArrival {
  currentArrival = {};
  return currentArrival;
}

/** Cached launch data may route only before any newer arrival has claimed navigation. */
export function captureInboundNavigationLaunch(): InboundNavigationArrival | null {
  return currentArrival === launchArrival ? launchArrival : null;
}

export function isCurrentInboundNavigation(arrival: InboundNavigationArrival | null): boolean {
  return arrival === currentArrival;
}
