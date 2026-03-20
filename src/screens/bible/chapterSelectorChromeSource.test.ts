import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('ChapterSelectorScreen keeps the book hub hero minimal and removes the listening-path promo chrome', () => {
  const source = readRelativeSource('./ChapterSelectorScreen.tsx');

  assert.equal(
    source.includes('styles.heroTopRow'),
    false,
    'ChapterSelectorScreen should not render the extra testament/translation pills in the hero'
  );

  assert.equal(
    source.includes('styles.calloutCard'),
    false,
    'ChapterSelectorScreen should not render the listening-path callout card'
  );

  assert.equal(
    source.includes('bookHubPresentation.summary'),
    false,
    'ChapterSelectorScreen should not render the long descriptive summary in the simplified book hub'
  );

  assert.equal(
    source.includes("book.chapters} {t('bible.chapters')"),
    false,
    'ChapterSelectorScreen should not render the chapter-count subtitle under the book title'
  );
});
