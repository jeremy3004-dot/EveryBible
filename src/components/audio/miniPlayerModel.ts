interface MiniPlayerNavigationRoute {
  name?: string;
  state?: MiniPlayerNavigationState | unknown;
}

export interface MiniPlayerNavigationState {
  index: number;
  routes: MiniPlayerNavigationRoute[];
}

export function getCurrentRouteName(state: MiniPlayerNavigationState | undefined): string | null {
  if (!state || !Array.isArray(state.routes) || state.routes.length === 0) {
    return null;
  }

  let route = state.routes[state.index];
  if (!route) {
    return null;
  }

  while (
    route?.state &&
    typeof route.state === 'object' &&
    'index' in route.state &&
    'routes' in route.state
  ) {
    const nestedState = route.state as MiniPlayerNavigationState;

    if (!Array.isArray(nestedState.routes) || nestedState.routes.length === 0) {
      return route.name ?? null;
    }

    route = nestedState.routes[nestedState.index];
    if (!route) {
      return null;
    }
  }

  return route?.name ?? null;
}
