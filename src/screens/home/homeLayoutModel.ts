export const HOME_STATS_COMPACT_LAYOUT_WIDTH = 390;
export const HOME_SCREEN_BASE_WIDTH = 390;
export const HOME_SCREEN_BASE_HEIGHT = 844;
export const HOME_SCREEN_MIN_SCALE = 0.72;
export const HOME_SCREEN_MAX_SCALE = 1.1;
export const HOME_SCREEN_BASE_SCREEN_PADDING = 24;
export const HOME_SCREEN_BASE_SECTION_GAP = 24;
export const HOME_SCREEN_BASE_CARD_PADDING = 20;
export const HOME_SCREEN_BASE_DENSE_CARD_PADDING = 16;
export const HOME_SCREEN_BASE_CARD_GAP = 16;
export const HOME_SCREEN_BASE_SPACE_SM = 8;
export const HOME_SCREEN_BASE_SPACE_MD = 12;

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
    scale,
    screenPadding: scaleDimension(HOME_SCREEN_BASE_SCREEN_PADDING, scale, 14, 28),
    sectionGap: scaleDimension(HOME_SCREEN_BASE_SECTION_GAP, scale, 10, 24),
    cardPadding: scaleDimension(HOME_SCREEN_BASE_CARD_PADDING, scale, 14, 24),
    denseCardPadding: scaleDimension(HOME_SCREEN_BASE_DENSE_CARD_PADDING, scale, 12, 20),
    cardTitleGap: scaleDimension(HOME_SCREEN_BASE_SPACE_MD, scale, 8, 14),
    bodyGap: scaleDimension(HOME_SCREEN_BASE_SPACE_SM, scale, 6, 10),
    foundationCardGap: scaleDimension(HOME_SCREEN_BASE_CARD_GAP, scale, 10, 18),
    foundationIconSize: scaleDimension(72, scale, 54, 80),
    verseCardMinHeight: scaleDimension(220, scale, 150, 260),
    greetingFontSize: scaleDimension(32, scale, 24, 34),
    greetingLineHeight: scaleDimension(38, scale, 28, 40),
    subtitleFontSize: scaleDimension(15, scale, 13, 17),
    subtitleLineHeight: scaleDimension(22, scale, 18, 24),
    verseTextFontSize: scaleDimension(28, scale, 20, 30),
    verseTextLineHeight: scaleDimension(38, scale, 28, 40),
    verseBodyFontSize: scaleDimension(17, scale, 14, 18),
    verseBodyLineHeight: scaleDimension(26, scale, 21, 28),
    verseReferenceFontSize: scaleDimension(13, scale, 11, 14),
    verseReferenceLineHeight: scaleDimension(18, scale, 14, 20),
    statNumberFontSize: scaleDimension(28, scale, 20, 30),
    statNumberLineHeight: scaleDimension(32, scale, 24, 34),
    statLabelFontSize: scaleDimension(12, scale, 10, 13),
    statLabelLineHeight: scaleDimension(16, scale, 14, 18),
    audioButtonPaddingHorizontal: scaleDimension(20, scale, 16, 24),
    audioButtonPaddingVertical: scaleDimension(14, scale, 10, 16),
    audioButtonGap: scaleDimension(HOME_SCREEN_BASE_SPACE_SM, scale, 6, 10),
    statsRowGap: scaleDimension(HOME_SCREEN_BASE_SPACE_SM, scale, 6, 12),
    foundationTitleLines: isTightHeight ? 1 : 2,
    foundationSubtitleLines: isTightHeight ? 2 : 3,
    verseTextLines: isTightHeight ? 4 : 5,
    verseBodyLines: isTightHeight ? 3 : 4,
  };
}

export function shouldUseCompactHomeStatsLayout(screenWidth: number): boolean {
  return screenWidth < HOME_STATS_COMPACT_LAYOUT_WIDTH;
}
