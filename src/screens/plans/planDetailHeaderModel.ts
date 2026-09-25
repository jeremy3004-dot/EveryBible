// Kept free of react-native imports so the node test runner can load it.

/** The compact header's control row: one 44pt touch target plus its padding. */
const COMPACT_HEADER_ROW_HEIGHT = 44;
const COMPACT_HEADER_VERTICAL_PADDING = 8;

// Plan covers are 4:3 plates with the mark centred. A phone shows the whole
// plate; a wide (iPad) window caps the height and crops to the centre, which
// every mark is composed to survive.
const COVER_ASPECT = 3 / 4;
const COVER_MAX_HEIGHT = 420;

export const getPlanCoverHeight = (windowWidth: number): number =>
  Math.min(Math.round(windowWidth * COVER_ASPECT), COVER_MAX_HEIGHT);

export const getPlanDetailCompactHeaderHeight = (topInset: number): number =>
  topInset + COMPACT_HEADER_ROW_HEIGHT + COMPACT_HEADER_VERTICAL_PADDING * 2;

interface CompactHeaderVisibilityInput {
  scrollOffsetY: number;
  /** Distance from the top of the page to the top of the plan's title block. */
  titleTop: number;
  headerHeight: number;
}

/**
 * The plan page has no navigation bar: its back control rides on the cover and
 * its title sits beneath it. As soon as the title reaches the underside of
 * where a bar would be, a pinned compact header takes over, so the status bar
 * always has a backing and the page always shows what it is and how to leave it.
 */
export const isPlanDetailCompactHeaderVisible = ({
  scrollOffsetY,
  titleTop,
  headerHeight,
}: CompactHeaderVisibilityInput): boolean => scrollOffsetY >= titleTop - headerHeight;
