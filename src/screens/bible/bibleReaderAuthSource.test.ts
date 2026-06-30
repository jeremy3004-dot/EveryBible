import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen keeps reader actions local-first instead of restoring an auth session', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');
  const authSelectors = Array.from(
    source.matchAll(/useAuthStore\(\s*\(state\) => state\.([^)]+?)\s*\)/gs),
    (match) => match[1].replace(/\s+/g, '')
  );

  assert.ok(
    authSelectors.length > 0,
    'BibleReaderScreen should still read saved reader preferences from authStore'
  );
  assert.equal(
    authSelectors.every((selector) => selector.startsWith('preferences.')),
    true,
    `BibleReaderScreen should only read preferences from authStore, got: ${authSelectors.join(', ')}`
  );

  assert.doesNotMatch(
    source,
    /\bgetCurrentSession\b|\bisAuthenticated\b|\bhas(?:Stored|Live|Restored|Reader)AuthSession\b/,
    'BibleReaderScreen should not restore or gate reader actions on a live auth session'
  );
});

test('BibleReaderScreen keeps verse selection available and local-only annotation actions enabled', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

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
    /onPress=\{\s*\(\) => \{\s*setSelectedVerses\(\(current\) =>\s*toggleBibleSelectionVerse\(current, verse\.verse\)\s*\);\s*\}\s*\}/s,
    'BibleReaderScreen should toggle verse selection when the user taps text'
  );

  assert.match(
    source,
    /selectedVerses\.length > 0/,
    'BibleReaderScreen should only show the selection tray while at least one verse is selected'
  );
});
