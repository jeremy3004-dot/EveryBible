import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('share verse backgrounds append plan-cover art after the home verse backgrounds', () => {
  const source = readRelativeSource('./shareVerseBackgrounds.ts');

  assert.match(
    source,
    /import \{ HOME_VERSE_BACKGROUND_SOURCES \} from '\.\/homeVerseBackgrounds';/,
    'shareVerseBackgrounds should reuse the existing home verse artwork'
  );

  assert.match(
    source,
    /import \{ READING_PLAN_COVER_SOURCES \} from '\.\.\/services\/plans\/readingPlanAssets';/,
    'shareVerseBackgrounds should pull in the bundled reading-plan cover assets'
  );

  assert.match(
    source,
    /export const SHARE_VERSE_BACKGROUND_SOURCES[\s\S]*\[\s*\.\.\.HOME_VERSE_BACKGROUND_SOURCES,\s*\.\.\.READING_PLAN_COVER_SOURCES,\s*\]/s,
    'shareVerseBackgrounds should keep the home backgrounds first and append plan-cover artwork for scripture sharing'
  );
});
