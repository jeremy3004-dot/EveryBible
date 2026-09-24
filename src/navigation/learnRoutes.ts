import type { NavigatorScreenParams } from '@react-navigation/native';
import type { LearnStackParamList } from './types';

/**
 * Params for opening a Gather foundation (or wisdom topic) from outside the
 * Learn tab, e.g. `navigation.navigate('Learn', gatherFoundationRoute(id))`.
 *
 * `initial: false` keeps GatherHome as the stack's first route. Without it the
 * Learn stack mounts with FoundationDetail alone, back leaves the tab, and the
 * Learn tab keeps reopening that foundation with no way home.
 */
export const gatherFoundationRoute = (
  foundationId: string
): NavigatorScreenParams<LearnStackParamList> => ({
  screen: 'FoundationDetail',
  params: { foundationId },
  initial: false,
});
