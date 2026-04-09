import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('LessonDetailScreen uses the active Bible translation for gather scripture and audio', () => {
  const source = readRelativeSource('./LessonDetailScreen.tsx');

  assert.equal(
    source.includes('useBibleStore'),
    true,
    'LessonDetailScreen should read the current Bible translation from the shared Bible store'
  );

  assert.equal(
    source.includes(
      'getPassageText(lesson.references, currentTranslation, { bookNameResolver: resolveBookName })'
    ),
    true,
    'LessonDetailScreen should load gather passage text in the currently selected translation and locale'
  );

  assert.equal(
    source.includes(
      'getChapterAudioUrl(currentTranslation, primaryRef.bookId, primaryRef.chapter)'
    ),
    true,
    'LessonDetailScreen should resolve gather lesson audio from the currently selected translation when available'
  );

  assert.equal(
    source.includes('gather.readTheStory'),
    false,
    'LessonDetailScreen should not render the redundant "Read the Story" button'
  );

  assert.equal(
    source.includes('share-outline'),
    false,
    'LessonDetailScreen should not keep the broken top-right header share button'
  );
});
