import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import Module from 'node:module';

/**
 * shareVerseBackgroundsSource.test.ts asserts the composition in source text.
 * This file loads the real module instead — a CommonJS extension handler stands in
 * for Metro's asset transformer — so the picker's actual list is checked: order,
 * uniqueness, and that every entry resolves to bundled artwork.
 */
const registerAssetLoader = () => {
  const extensions = (Module as unknown as { _extensions: Record<string, unknown> })._extensions;
  for (const extension of ['.png', '.jpg', '.jpeg']) {
    extensions[extension] = (mod: { exports: unknown }, filename: string) => {
      mod.exports = { testAssetPath: filename };
    };
  }
};
registerAssetLoader();

const pathOf = (source: unknown): string => {
  const resolved = (source as { testAssetPath?: string } | null)?.testAssetPath;
  assert.ok(typeof resolved === 'string', 'asset did not resolve to a bundled file');
  return resolved;
};

test('the share picker opens with the home verse backgrounds, in their home order', async () => {
  const { SHARE_VERSE_BACKGROUND_SOURCES } = await import('./shareVerseBackgrounds');
  const { HOME_VERSE_BACKGROUND_SOURCES } = await import('./homeVerseBackgrounds');
  assert.deepEqual(SHARE_VERSE_BACKGROUND_SOURCES.slice(0, HOME_VERSE_BACKGROUND_SOURCES.length), [
    ...HOME_VERSE_BACKGROUND_SOURCES,
  ]);
});

test('the reading-plan cover art is appended after the home backgrounds', async () => {
  const { SHARE_VERSE_BACKGROUND_SOURCES } = await import('./shareVerseBackgrounds');
  const { HOME_VERSE_BACKGROUND_SOURCES } = await import('./homeVerseBackgrounds');
  const { READING_PLAN_COVER_SOURCES } = await import('../services/plans/readingPlanAssets');
  assert.deepEqual(SHARE_VERSE_BACKGROUND_SOURCES.slice(HOME_VERSE_BACKGROUND_SOURCES.length), [
    ...READING_PLAN_COVER_SOURCES,
  ]);
  assert.equal(
    SHARE_VERSE_BACKGROUND_SOURCES.length,
    HOME_VERSE_BACKGROUND_SOURCES.length + READING_PLAN_COVER_SOURCES.length
  );
});

test('no image appears twice in the picker', async () => {
  const { SHARE_VERSE_BACKGROUND_SOURCES } = await import('./shareVerseBackgrounds');
  const paths = SHARE_VERSE_BACKGROUND_SOURCES.map(pathOf);
  assert.deepEqual(paths, [...new Set(paths)]);
});

test('every picker image exists on disk as bundled artwork', async () => {
  const { SHARE_VERSE_BACKGROUND_SOURCES } = await import('./shareVerseBackgrounds');
  for (const source of SHARE_VERSE_BACKGROUND_SOURCES) {
    const filePath = pathOf(source);
    assert.match(filePath, /\/assets\/(home\/verse-backgrounds|plans\/covers)\/[^/]+\.(jpg|png)$/);
    assert.ok(existsSync(filePath), `${filePath} is missing`);
  }
});
