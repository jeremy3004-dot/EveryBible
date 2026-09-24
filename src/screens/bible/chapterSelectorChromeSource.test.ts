// Import-graph guard (not a behaviour test): the book hub must not pull the stores/components
// barrels or analytics onto its render path. What it renders is covered by
// ChapterSelectorScreen.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('ChapterSelectorScreen keeps broad barrels and analytics off the book-hub render path', () => {
  const source = readRelativeSource('./ChapterSelectorScreen.tsx');

  assert.equal(
    source.includes("from '../../stores';"),
    false,
    'ChapterSelectorScreen should import only the stores it reads instead of pulling the whole stores barrel into the book hub'
  );

  assert.equal(
    source.includes("from '../../components';"),
    false,
    'ChapterSelectorScreen should import CompanionSection directly instead of pulling every component barrel export into the book hub'
  );

  assert.equal(
    source.includes(
      "import { trackBibleExperienceEvent } from '../../services/analytics/bibleExperienceAnalytics';"
    ),
    false,
    'ChapterSelectorScreen should not statically import book-hub analytics before the user taps a chapter or companion item'
  );

  assert.match(
    source,
    /void import\('\.\.\/\.\.\/services\/analytics\/bibleExperienceAnalytics'\)\.then/,
    'ChapterSelectorScreen should load book-hub analytics only when it needs to record a tap'
  );
});
