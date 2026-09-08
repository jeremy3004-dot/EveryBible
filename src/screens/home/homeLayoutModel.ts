export const HOME_STATS_COMPACT_LAYOUT_WIDTH = 390;
export const HOME_SCREEN_BASE_WIDTH = 390;
export const HOME_SCREEN_BASE_HEIGHT = 844;
export const HOME_SCREEN_MIN_SCALE = 0.72;
export const HOME_SCREEN_MAX_SCALE = 1.1;
export const HOME_SCREEN_BASE_HERO_PHOTO_HEIGHT = 430;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scaleDimension(base: number, scale: number, min: number, max: number): number {
  return Math.round(clamp(base * scale, min, max));
}

export function getHomeScreenScale(screenWidth: number, screenHeight: number): number {
  if (screenWidth <= 0 || screenHeight <= 0) {
    return HOME_SCREEN_MIN_SCALE;
  }

  const widthScale = screenWidth / HOME_SCREEN_BASE_WIDTH;
  const heightScale = screenHeight / HOME_SCREEN_BASE_HEIGHT;

  return clamp(Math.min(widthScale, heightScale), HOME_SCREEN_MIN_SCALE, HOME_SCREEN_MAX_SCALE);
}

export function getHomeScreenLayout(
  screenWidth: number,
  screenHeight: number,
  bottomChromeHeight = 0
) {
  const availableHeight = Math.max(0, screenHeight - bottomChromeHeight);
  const scale = getHomeScreenScale(screenWidth, availableHeight);
  const isTightHeight = availableHeight < 700;

  return {
    // The full-bleed hero photograph. 430pt on the 390×844 reference frame; it
    // has to shrink on short phones or the sheet cards fall under the tab bar.
    heroPhotoHeight: scaleDimension(HOME_SCREEN_BASE_HERO_PHOTO_HEIGHT, scale, 340, 470),
    greetingFontSize: scaleDimension(22, scale, 18, 24),
    greetingLineHeight: scaleDimension(26, scale, 22, 28),
    verseTextFontSize: scaleDimension(28, scale, 21, 30),
    verseTextLineHeight: scaleDimension(36, scale, 27, 38),
    verseTextLines: isTightHeight ? 3 : 4,
  };
}

export function shouldUseCompactHomeStatsLayout(screenWidth: number): boolean {
  return screenWidth < HOME_STATS_COMPACT_LAYOUT_WIDTH;
}
