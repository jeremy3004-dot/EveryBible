import { shouldHideTabBarOnNestedRoute } from './tabBarVisibility';

// The tab capsule and reader's side controls travel together in the reference.
export const READER_TAB_BAR_COLLAPSE_DISTANCE = 132;

// ---- The fused player bar ---------------------------------------------------
// One capsule: the player row, a progress hairline under it, then the tab row.
// Its geometry lives here, beside the worklets that animate it, so the motion and
// the reader's content clearance read the same numbers.

/** The player row: a 42pt play tile with 7pt of paper above and below. */
export const PLAYER_BAR_ROW_HEIGHT = 56;
/** The progress hairline under the player row. */
export const PLAYER_BAR_PROGRESS_HEIGHT = 2;
/** Player row plus its progress line: what the player adds on top of the tab row. */
export const PLAYER_BAR_SECTION_HEIGHT = PLAYER_BAR_ROW_HEIGHT + PLAYER_BAR_PROGRESS_HEIGHT;
/** The icon-only strip the bar shrinks into while audio is loaded. */
export const PLAYER_BAR_STRIP_HEIGHT = 38;
/** Side inset of the progress line inside the capsule. */
export const PLAYER_BAR_PROGRESS_INSET = 16;
/** Scroll progress past which the expanded row hands over to the strip. */
export const PLAYER_BAR_STRIP_THRESHOLD = 0.5;

/**
 * How the bar gets out of the way as the reader scrolls down. With audio loaded it
 * shrinks into the strip and keeps the transport; with nothing loaded it slides
 * off, leaving only a hairline to call it back.
 */
export type PlayerBarCollapseMode = 'strip' | 'hide';

/** Which parts of the bar take touch and screen-reader focus. */
export type PlayerBarPhase = 'expanded' | 'strip' | 'hidden';

export function shouldFollowReaderScroll(
  tabName: string,
  nestedRouteName?: string,
  nestedRouteParams?: Record<string, unknown>
): boolean {
  return (
    tabName === 'Bible' &&
    nestedRouteName === 'BibleReader' &&
    !shouldHideTabBarOnNestedRoute(nestedRouteName, nestedRouteParams) &&
    !(
      typeof nestedRouteParams?.tabBarCollapseProgress === 'number' &&
      nestedRouteParams.tabBarCollapseProgress > 0
    )
  );
}

export function getReaderTabBarTranslation(progress: number): number {
  'worklet';
  return Math.max(0, Math.min(1, progress)) * READER_TAB_BAR_COLLAPSE_DISTANCE;
}

export function isReaderTabBarScrollHidden(followsScroll: boolean, progress: number): boolean {
  'worklet';
  return followsScroll && progress >= 0.98;
}

/** The reader's collapse progress as the bar applies it: none unless it follows the reader. */
export function getPlayerBarProgress(followsScroll: boolean, progress: number): number {
  'worklet';
  return followsScroll ? Math.max(0, Math.min(1, progress)) : 0;
}

export function getPlayerBarCollapseMode(
  hasPlayerRow: boolean,
  audioLoaded: boolean
): PlayerBarCollapseMode {
  return hasPlayerRow && audioLoaded ? 'strip' : 'hide';
}

/** The only state that crosses to JS: which rows are live at this progress. */
export function getPlayerBarPhase(mode: PlayerBarCollapseMode, progress: number): PlayerBarPhase {
  'worklet';
  if (mode === 'strip') {
    return progress >= PLAYER_BAR_STRIP_THRESHOLD ? 'strip' : 'expanded';
  }
  return isReaderTabBarScrollHidden(true, progress) ? 'hidden' : 'expanded';
}

/** The capsule's height: shrinking into the strip, or unchanged while it slides away. */
export function getPlayerBarCapsuleHeight(
  expandedHeight: number,
  mode: PlayerBarCollapseMode,
  progress: number
): number {
  'worklet';
  if (mode !== 'strip') return expandedHeight;
  return expandedHeight + (PLAYER_BAR_STRIP_HEIGHT - expandedHeight) * progress;
}

/** How far the bar slides down while hiding: its own height plus the gap below it. */
export function getPlayerBarHideTranslation(
  mode: PlayerBarCollapseMode,
  progress: number,
  expandedHeight: number,
  bottomOffset: number
): number {
  'worklet';
  if (mode !== 'hide') return 0;
  // A couple of points past the edge, so no sliver of the capsule's shadow stays.
  return progress * (expandedHeight + bottomOffset + 4);
}

/** Where the progress line sits: under the player row, or as the strip's bottom edge. */
export function getPlayerBarProgressLineTop(mode: PlayerBarCollapseMode, progress: number): number {
  'worklet';
  const expandedTop = PLAYER_BAR_ROW_HEIGHT;
  if (mode !== 'strip') return expandedTop;
  const stripTop = PLAYER_BAR_STRIP_HEIGHT - PLAYER_BAR_PROGRESS_HEIGHT;
  return expandedTop + (stripTop - expandedTop) * progress;
}

/** Cross-fade between the expanded row (1 → 0) and the strip (0 → 1). */
export function getPlayerBarRowOpacities(
  mode: PlayerBarCollapseMode,
  progress: number
): { expanded: number; strip: number } {
  'worklet';
  if (mode !== 'strip') return { expanded: 1, strip: 0 };
  return {
    expanded: Math.max(0, 1 - progress / PLAYER_BAR_STRIP_THRESHOLD),
    strip: Math.max(0, (progress - PLAYER_BAR_STRIP_THRESHOLD) / (1 - PLAYER_BAR_STRIP_THRESHOLD)),
  };
}
