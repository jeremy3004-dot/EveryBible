import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen restores a live session before gating chapter actions as signed out', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const hasStoredAuthSession = isAuthenticated \|\| hasLiveAuthSession;/,
    'BibleReaderScreen should combine persisted auth and hydrated session state before treating chapter actions as signed out'
  );

  assert.match(
    source,
    /const \[hasRestoredAuthSession, setHasRestoredAuthSession\] = useState\(hasStoredAuthSession\);/,
    'BibleReaderScreen should track whether a live session was restored after the screen mounted'
  );

  assert.match(
    source,
    /void getCurrentSession\(\)\.then\(\(\{ session \}\) => \{/,
    'BibleReaderScreen should fall back to the live auth service when the local auth store has not hydrated yet'
  );

  assert.match(
    source,
    /const hasReaderAuthSession = hasStoredAuthSession \|\| hasRestoredAuthSession;/,
    'BibleReaderScreen should reuse one resolved auth signal across chapter actions'
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
    /onPress=\{\s*\(\) => \{\s*setSelectedVerses\(\(current\) => toggleBibleSelectionVerse\(current, verse\.verse\)\);\s*\}\s*\}/s,
    'BibleReaderScreen should toggle verse selection when the user taps text'
  );

  assert.match(
    source,
    /selectedVerses\.length > 0/,
    'BibleReaderScreen should only show the selection tray while at least one verse is selected'
  );
});
