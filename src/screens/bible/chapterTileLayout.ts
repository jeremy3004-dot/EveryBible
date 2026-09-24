/**
 * Chapter grid geometry for the expanded book panel in the Bible browser.
 *
 * Fixed 48pt tiles left whatever width did not divide evenly as one wide gap on
 * the right edge. Instead the column count is the most that fit at the minimum
 * tile size, and the tiles then grow to share the row evenly.
 */
export const CHAPTER_TILE_MIN_SIZE = 48;
export const CHAPTER_TILE_GAP = 8;
// Tiles widen with Dynamic Type up to this scale; the chapter number caps its
// own font scaling at the same value so it always fits inside its tile.
export const CHAPTER_TILE_MAX_FONT_SCALE = 1.6;

export interface ChapterTileLayout {
  columns: number;
  tileSize: number;
}

export function getChapterTileLayout(availableWidth: number, fontScale = 1): ChapterTileLayout {
  const scale = Math.min(
    Math.max(Number.isFinite(fontScale) ? fontScale : 1, 1),
    CHAPTER_TILE_MAX_FONT_SCALE
  );
  const minTileSize = CHAPTER_TILE_MIN_SIZE * scale;

  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return { columns: 1, tileSize: minTileSize };
  }

  const columns = Math.max(
    1,
    Math.floor((availableWidth + CHAPTER_TILE_GAP) / (minTileSize + CHAPTER_TILE_GAP))
  );
  const exactTileSize = (availableWidth - CHAPTER_TILE_GAP * (columns - 1)) / columns;
  // Round down to hundredths, a hair under the exact share, so floating-point
  // noise can never push the last tile of a row past the edge and wrap it.
  const tileSize = Math.floor((exactTileSize - 0.005) * 100) / 100;

  return { columns, tileSize };
}
