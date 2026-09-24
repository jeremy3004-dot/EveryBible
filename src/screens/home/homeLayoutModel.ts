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
  bottomChromeHeight = 0,
  // The in-app reading size preference (FONT_SIZE_SCALES). The OS text size is
  // applied by RN on top of this, so it is deliberately not folded in here.
  readingFontScale = 1
) {
  const availableHeight = Math.max(0, screenHeight - bottomChromeHeight);
  const scale = getHomeScreenScale(screenWidth, availableHeight);
  const verseTextFontSize = scaleDimension(28, scale, 21, 30);
  const verseTextLineHeight = scaleDimension(36, scale, 27, 38);

  return {
    // The full-bleed hero photograph. 430pt on the 390×844 reference frame; it
    // has to shrink on short phones or the sheet cards fall under the tab bar.
    // It is a minimum: a long verse or a large text size grows the hero instead
    // of shrinking or truncating the scripture.
    heroPhotoHeight: scaleDimension(HOME_SCREEN_BASE_HERO_PHOTO_HEIGHT, scale, 340, 470),
    greetingFontSize: scaleDimension(22, scale, 18, 24),
    greetingLineHeight: scaleDimension(26, scale, 22, 28),
    verseTextFontSize: Math.round(verseTextFontSize * readingFontScale),
    verseTextLineHeight: Math.round(verseTextLineHeight * readingFontScale),
  };
}

export function shouldUseCompactHomeStatsLayout(screenWidth: number): boolean {
  return screenWidth < HOME_STATS_COMPACT_LAYOUT_WIDTH;
}
