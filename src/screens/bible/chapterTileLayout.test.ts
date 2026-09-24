import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTER_TILE_GAP,
  CHAPTER_TILE_MAX_FONT_SCALE,
  CHAPTER_TILE_MIN_SIZE,
  getChapterTileLayout,
} from './chapterTileLayout';

const rowWidth = ({ columns, tileSize }: { columns: number; tileSize: number }) =>
  columns * tileSize + (columns - 1) * CHAPTER_TILE_GAP;

// Widths of the expanded-book panel on common phones: window minus the list's
// 24pt screen padding and the panel's own 4pt inset on each side.
const PHONE_PANEL_WIDTHS = [320 - 56, 375 - 56, 393 - 56, 402 - 56, 430 - 56, 440 - 56];

test('tiles fill the row edge to edge instead of leaving a wide right gap', () => {
  // A 402pt iPhone panel is 346pt: six fixed 48pt tiles covered only 328pt and
  // left 18pt of empty space on the right.
  const tiles = getChapterTileLayout(346);

  assert.equal(tiles.columns, 6);
  assert.ok(tiles.tileSize > CHAPTER_TILE_MIN_SIZE);
  assert.ok(346 - rowWidth(tiles) < 1, 'the row should use the whole width');
});

test('every phone width gets a row that fits and is never short by a point or more', () => {
  for (const width of PHONE_PANEL_WIDTHS) {
    const tiles = getChapterTileLayout(width);
    const used = rowWidth(tiles);

    assert.ok(used <= width, `${width}pt: the row must not overflow and wrap`);
    assert.ok(width - used < 1, `${width}pt: ${width - used}pt left over`);
    // Tiles are rounded down to hundredths, so an exact fit can sit 0.01pt under.
    assert.ok(
      tiles.tileSize >= CHAPTER_TILE_MIN_SIZE - 0.01,
      `${width}pt: tiles below the minimum`
    );
  }
});

test('larger text gets fewer, wider tiles so chapter numbers keep their room', () => {
  const standard = getChapterTileLayout(346, 1);
  const large = getChapterTileLayout(346, 1.5);

  assert.ok(large.columns < standard.columns);
  assert.ok(large.tileSize >= CHAPTER_TILE_MIN_SIZE * 1.5);
  assert.ok(346 - rowWidth(large) < 1);
});

test('tile growth stops at the capped text scale', () => {
  assert.deepEqual(
    getChapterTileLayout(346, 3.1),
    getChapterTileLayout(346, CHAPTER_TILE_MAX_FONT_SCALE)
  );
});

test('text smaller than default never shrinks tiles below the touch minimum', () => {
  assert.deepEqual(getChapterTileLayout(346, 0.8), getChapterTileLayout(346, 1));
});

test('a panel narrower than one tile still lays out a single full-width column', () => {
  const tiles = getChapterTileLayout(30);

  assert.equal(tiles.columns, 1);
  assert.ok(tiles.tileSize <= 30 && tiles.tileSize > 29);
});

test('an unmeasured panel falls back to the minimum tile rather than NaN', () => {
  assert.deepEqual(getChapterTileLayout(0), { columns: 1, tileSize: CHAPTER_TILE_MIN_SIZE });
  assert.deepEqual(getChapterTileLayout(Number.NaN), {
    columns: 1,
    tileSize: CHAPTER_TILE_MIN_SIZE,
  });
});
