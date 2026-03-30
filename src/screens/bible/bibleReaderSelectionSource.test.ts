import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen wires a bottom selection tray with copy, note, share, and highlight actions', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');
  const traySource = readRelativeSource('../../components/annotations/AnnotationActionSheet.tsx');

  assert.match(
    source,
    /import \* as Clipboard from 'expo-clipboard';/,
    'BibleReaderScreen should use a real clipboard implementation for selected-text copy'
  );

  assert.match(
    source,
    /const handleCopySelectedVerse = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated selected-text copy handler'
  );

  assert.match(
    source,
    /const handleShareSelectedVerse = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated selected-text share handler'
  );

  assert.match(
    source,
    /const handleHighlightSelectedVerse = async \(color: string\) => \{/,
    'BibleReaderScreen should define a dedicated selected-text highlight handler'
  );

  assert.match(
    source,
    /referenceLabel=\{selectedVerseReferenceLabel\}[\s\S]*selectedText=\{selectedVerseText\}[\s\S]*handleCopySelectedVerse[\s\S]*handleShareSelectedVerse[\s\S]*handleHighlightSelectedVerse[\s\S]*handleNoteSelectedVerse/s,
    'BibleReaderScreen should pass the selected text and action callbacks into the selection tray'
  );

  assert.match(
    source,
    /textDecorationStyle:\s*'dotted'/,
    'BibleReaderScreen should render selected verses with the dotted underline seen in the recording'
  );

  assert.match(
    traySource,
    /annotations\.selected/,
    'The selection tray should title the action panel with the selected reference copy'
  );

  assert.match(
    traySource,
    /common\.save/,
    'The selection tray should keep the save/highlight primary action label from the recording'
  );

  assert.match(
    traySource,
    /annotations\.copy/,
    'The selection tray should expose a copy action in the tray'
  );

  assert.match(
    traySource,
    /annotations\.note/,
    'The selection tray should expose a note action in the tray'
  );

  assert.match(
    traySource,
    /groups\.share/,
    'The selection tray should expose a share action in the tray'
  );
});
