import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import Module from 'node:module';

import { getHomeVerseBackgroundIndex } from './homeVerseBackgroundSelection';

/**
 * Complements homeVerseBackgrounds.test.ts, which pins the rotation arithmetic
 * against a hard-coded count. This file loads the real module — a CommonJS
 * extension handler stands in for Metro's asset transformer — so the bundled
 * photo list and getHomeVerseBackground itself are exercised.
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

test('every bundled verse background exists on disk as a jpg', async () => {
  const { HOME_VERSE_BACKGROUND_SOURCES } = await import('./homeVerseBackgrounds');
  assert.ok(HOME_VERSE_BACKGROUND_SOURCES.length >= 2);
  for (const source of HOME_VERSE_BACKGROUND_SOURCES) {
    const filePath = pathOf(source);
    assert.match(filePath, /\/assets\/home\/verse-backgrounds\/[^/]+\.jpg$/);
    assert.ok(existsSync(filePath), `${filePath} is missing`);
  }
});

test('no photo is bundled twice, so the daily rotation never repeats early', async () => {
  const { HOME_VERSE_BACKGROUND_SOURCES } = await import('./homeVerseBackgrounds');
  const paths = HOME_VERSE_BACKGROUND_SOURCES.map(pathOf);
  assert.deepEqual(paths, [...new Set(paths)]);
});

test('getHomeVerseBackground returns the source the daily index selects', async () => {
  const { HOME_VERSE_BACKGROUND_SOURCES, getHomeVerseBackground } =
    await import('./homeVerseBackgrounds');
  const date = new Date(2026, 4, 17);
  const expectedIndex = getHomeVerseBackgroundIndex(date, HOME_VERSE_BACKGROUND_SOURCES.length);
  assert.equal(getHomeVerseBackground(date), HOME_VERSE_BACKGROUND_SOURCES[expectedIndex]);
});

test('consecutive days walk the whole list before repeating a photo', async () => {
  const { HOME_VERSE_BACKGROUND_SOURCES, getHomeVerseBackground } =
    await import('./homeVerseBackgrounds');
  const count = HOME_VERSE_BACKGROUND_SOURCES.length;
  const cycle = Array.from({ length: count }, (_unused, offset) =>
    getHomeVerseBackground(new Date(2026, 0, 1 + offset))
  );
  assert.equal(new Set(cycle).size, count, 'a photo repeated inside one cycle');
  assert.equal(getHomeVerseBackground(new Date(2026, 0, 1 + count)), cycle[0]);
});

test('getHomeVerseBackground defaults to today when no date is given', async () => {
  const { HOME_VERSE_BACKGROUND_SOURCES, getHomeVerseBackground } =
    await import('./homeVerseBackgrounds');
  const expectedIndex = getHomeVerseBackgroundIndex(
    new Date(),
    HOME_VERSE_BACKGROUND_SOURCES.length
  );
  assert.equal(getHomeVerseBackground(), HOME_VERSE_BACKGROUND_SOURCES[expectedIndex]);
});
