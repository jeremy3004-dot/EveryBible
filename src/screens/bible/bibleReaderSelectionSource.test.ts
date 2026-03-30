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
    /import \* as Clipboard from 'expo-clipboard';[\s\S]*import \{ selectionHaptic \} from '\.\.\/\.\.\/utils\/haptics';/s,
    'BibleReaderScreen should use a real clipboard implementation and the local haptic helper for copy feedback'
  );

  assert.match(
    source,
    /const handleCopySelectedVerses = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated multi-verse copy handler'
  );

  assert.match(
    source,
    /const handleShareSelectedVerses = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated multi-verse share handler'
  );

  assert.match(
    source,
    /const handleHighlightSelectedVerses = async \(color: string\) => \{/,
    'BibleReaderScreen should define a dedicated selected-text highlight handler'
  );

  assert.match(
    source,
    /referenceLabel=\{selectedVerseReferenceLabel\}[\s\S]*selectedText=\{selectedVerseText\}[\s\S]*handleCopySelectedVerses[\s\S]*handleShareSelectedVerses[\s\S]*handleHighlightSelectedVerses[\s\S]*handleNoteSelectedVerses[\s\S]*handleRemoveHighlightSelectedVerses/s,
    'BibleReaderScreen should pass the multi-verse selection text and action callbacks into the selection tray'
  );

  assert.match(
    source,
    /textDecorationStyle:\s*'dotted'/,
    'BibleReaderScreen should render selected verses with the dotted underline seen in the recording'
  );

  assert.match(
    source,
    /visible=\{selectedVerses\.length > 0\}/,
    'BibleReaderScreen should keep the selection tray open while at least one verse remains selected'
  );

  assert.match(
    traySource,
    /pointerEvents="box-none"/,
    'The selection tray should be inline so Bible taps can keep reaching the underlying reader'
  );

  assert.match(
    traySource,
    /annotations\.highlight/,
    'The selection tray should expose a highlight action in the tray'
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

  assert.match(
    traySource,
    /annotations\.removeHighlight/,
    'The selection tray should expose an X button for removing an existing highlight'
  );

  assert.equal(
    traySource.includes('common.save'),
    false,
    'The selection tray should remove the old save button label from the recording'
  );

  assert.equal(
    traySource.includes('<Modal'),
    false,
    'The selection tray should be inline so the Bible remains tappable while verses are selected'
  );
});
