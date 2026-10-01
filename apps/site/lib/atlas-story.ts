/**
 * Camera maths for the homepage globe: how far to zoom so the whole globe
 * fits beside the headline, and where to leave room for it.
 */

/** Degrees of longitude per second for the idle spin. */
export const STORY_SPIN_SPEED = 3;

/**
 * Zoom at which the globe's diameter is `fraction` of the smaller side of the
 * area left after padding. MapLibre draws the globe so its scale at the map
 * centre matches Web Mercator there, so the radius in pixels is about
 * worldSize · cos(latitude) / (2π); this solves that for zoom. Its perspective
 * camera draws the visible edge at roughly 0.8 of that radius, which the
 * default fraction allows for.
 */
export function globeFitZoom(
  availableWidth: number,
  availableHeight: number,
  latitude: number,
  fraction = 1.05
): number {
  const radius = (Math.max(1, Math.min(availableWidth, availableHeight)) * fraction) / 2;
  const cos = Math.cos((latitude * Math.PI) / 180);
  return Math.log2((2 * Math.PI * radius * cos) / 512);
}

export interface StoryPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Desktop: the copy holds the left column and the globe sits to its right.
 * Phone: the globe holds the top of the screen and the copy sits below it.
 * Right-to-left pages put the copy on the right, so the globe mirrors to the left.
 */
export function storyPadding(
  width: number,
  height: number,
  headerHeight: number,
  rtl = false
): StoryPadding {
  if (width <= 760) {
    return { top: headerHeight + 8, right: 12, bottom: Math.round(height * 0.42), left: 12 };
  }
  const copySide = Math.round(Math.min(width * 0.44, 640));
  const farSide = Math.round(width * 0.04);
  return {
    top: headerHeight + 24,
    right: rtl ? copySide : farSide,
    bottom: 48,
    left: rtl ? farSide : copySide,
  };
}
