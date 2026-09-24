// Kept free of react-native imports so the node test runner can load it.

/** The compact header's control row: one 44pt touch target plus its padding. */
const COMPACT_HEADER_ROW_HEIGHT = 44;
const COMPACT_HEADER_VERTICAL_PADDING = 8;

export const getPlanDetailCompactHeaderHeight = (topInset: number): number =>
  topInset + COMPACT_HEADER_ROW_HEIGHT + COMPACT_HEADER_VERTICAL_PADDING * 2;

interface CompactHeaderVisibilityInput {
  scrollOffsetY: number;
  coverHeight: number;
  /** Distance from the hero's lower edge to the bottom of its title block. */
  heroTextBottom: number;
  headerHeight: number;
}

/**
 * The plan page has no navigation bar: its back control and title ride on the
 * photo hero. Once the title has scrolled up under where a bar would be, a pinned
 * compact header takes over, so the status bar always has a backing and the page
 * always shows what it is and how to leave it.
 */
export const isPlanDetailCompactHeaderVisible = ({
  scrollOffsetY,
  coverHeight,
  heroTextBottom,
  headerHeight,
}: CompactHeaderVisibilityInput): boolean =>
  scrollOffsetY >= coverHeight - heroTextBottom - headerHeight;
