// Static auth wiring contract; anonymous reader behavior is covered by render tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { listBibleReaderSourceFiles, readBibleReaderSource } from './bibleReaderSourceFiles';
import { assertDefined } from '../../utils/assertDefined';

test('BibleReaderScreen keeps reader actions local-first instead of restoring an auth session', () => {
  const source = readBibleReaderSource();
  const authSelectors = listBibleReaderSourceFiles().flatMap((file) => {
    const fileSource = readFileSync(new URL(file, import.meta.url), 'utf8');
    return Array.from(
      fileSource.matchAll(/useAuthStore\(\s*\(state\) => state\.([^)]+?)\s*\)/gs),
      (match) => ({ file, selector: assertDefined(match[1], 'match[1]').replace(/\s+/g, '') })
    );
  });

  assert.ok(
    authSelectors.some(({ selector }) => selector.startsWith('preferences.')),
    'BibleReaderScreen should still read saved reader preferences from authStore'
  );
  assert.equal(
    authSelectors.every(
      ({ file, selector }) =>
        selector.startsWith('preferences.') ||
        (file === './reader/useChapterFeedback.ts' &&
          (selector === 'user?.uid??null' || selector === 'authGeneration'))
    ),
    true,
    `Reader auth selectors must be preferences, except feedback submission ownership: ${authSelectors
      .map(({ file, selector }) => `${file}: ${selector}`)
      .join(', ')}`
  );

  assert.doesNotMatch(
    source,
    /\bgetCurrentSession\b|\bisAuthenticated\b|\bhas(?:Stored|Live|Restored|Reader)AuthSession\b/,
    'BibleReaderScreen should not restore or gate reader actions on a live auth session'
  );
});

test('BibleReaderScreen keeps verse selection available and local-only annotation actions enabled', () => {
  const source = readBibleReaderSource();

  assert.match(
    source,
    /<AnnotationActionSheet[\s\S]*canAnnotate=\{true\}/s,
    'BibleReaderScreen should keep the selection tray enabled for local-only annotations'
  );

  assert.match(
    source,
    /const \[selectedVerses, setSelectedVerses\] = useState<number\[\]>\(\[\]\);/,
    'BibleReaderScreen should keep selected verses in a multi-select state container'
  );

  assert.match(
    source,
    /const handleToggleVerseSelection = \(verse: Verse\) => \{\s*if \(!canSelectDisplayedVerse\(\{[^}]*\}\)\) \{\s*return;\s*\}\s*selectionHaptic\(\);\s*setSelectedVerses\(\(current\) =>\s*toggleBibleSelectionVerse\(current, verse\.verse\)\s*\);\s*\}/s,
    'BibleReaderScreen should toggle verse selection (with selection haptic) through a shared handler when the user taps text'
  );

  assert.match(
    source,
    /selectedVerses\.length > 0/,
    'BibleReaderScreen should only show the selection tray while at least one verse is selected'
  );
});
