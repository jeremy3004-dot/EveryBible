import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen wires a bottom selection tray with copy, note, share, and inline highlight colors', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');
  const traySource = readRelativeSource('../../components/annotations/AnnotationActionSheet.tsx');
  const highlightSource = readRelativeSource('../../components/bible/HighlightedVerseText.tsx');

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
    /buildBibleSelectionVerseRanges/,
    'BibleReaderScreen should group contiguous selected verses before saving highlights or notes'
  );

  assert.match(
    source,
    /const handleShareSelectedVerses = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated multi-verse share handler'
  );

  assert.match(
    source,
    /const handleOpenVerseImageShare = \(\) => \{/,
    'BibleReaderScreen should define a dedicated verse-image picker opener'
  );

  assert.match(
    source,
    /const handleShareSelectedVerseImage = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated verse-image share handler'
  );

  assert.match(
    source,
    /const handleHighlightSelectedVerses = async \(color: string\) => \{/,
    'BibleReaderScreen should define a dedicated selected-text highlight handler'
  );

  assert.match(
    source,
    /referenceLabel=\{selectedVerseReferenceLabel\}[\s\S]*selectedText=\{selectedVerseText\}/s,
    'BibleReaderScreen should pass the multi-verse selection text and action callbacks into the selection tray'
  );

  assert.match(
    source,
    /activeHighlightColors=\{selectedHighlightColors\}/,
    'BibleReaderScreen should pass the selected highlight colors into the tray so active colors can show the inline X'
  );

  assert.match(
    source,
    /onRemoveHighlight=\{handleRemoveHighlightSelectedVerses\}/,
    'BibleReaderScreen should pass a color-aware highlight removal handler into the tray'
  );

  assert.match(
    source,
    /textDecorationStyle:\s*'dotted'/,
    'BibleReaderScreen should render selected verses with the dotted underline seen in the recording'
  );

  assert.match(
    source,
    /<Pressable[\s\S]*onPress=\{\(\) => \{\s*setSelectedVerses\(/s,
    'BibleReaderScreen should wrap verse taps in Pressable instead of a clickable Text node so selection does not shove the chapter around'
  );

  assert.match(
    source,
    /visible=\{selectedVerses\.length > 0\}/,
    'BibleReaderScreen should keep the selection tray open while at least one verse remains selected'
  );

  assert.match(
    source,
    /visible=\{showVerseImageSheet\}/,
    'BibleReaderScreen should open a dedicated verse-image sheet after the image action'
  );

  assert.match(
    source,
    /SHARE_VERSE_BACKGROUND_SOURCES/,
    'BibleReaderScreen should reuse the shared scripture-image background artwork for image sharing'
  );

  assert.match(
    traySource,
    /pointerEvents="box-none"/,
    'The selection tray should be inline so Bible taps can keep reaching the underlying reader'
  );

  assert.match(
    traySource,
    /\.\.\.StyleSheet\.absoluteFillObject/,
    'The selection tray should float as a true overlay instead of taking reader layout space'
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
    /bible\.shareVerseImage/,
    'The selection tray should expose an image-share action after the text share action'
  );

  assert.match(
    traySource,
    /image-outline/,
    'The selection tray should show a picture icon for the image-share action'
  );

  assert.match(
    traySource,
    /activeHighlightColorSet\.has\(color\.hex\)/,
    'The selection tray should mark already-highlighted colors so they can show the inline remove X'
  );

  assert.match(
    traySource,
    /HIGHLIGHT_COLORS\.map\(\(color\) =>/,
    'All five highlight colors should render inline in one row'
  );

  assert.match(
    traySource,
    /highlightRow/,
    'The highlight colors should sit in a single side-by-side row'
  );

  assert.match(
    traySource,
    /selectionControlsRow/,
    'The color row and action buttons should share one horizontal tray row'
  );

  assert.match(
    traySource,
    /actionButtonRail/,
    'The four primary actions should appear beside the highlight colors in the same row'
  );

  assert.match(
    traySource,
    /Ionicons name="close" size=\{13\}/,
    'Already-highlighted color chips should show the inline X badge from the recording'
  );

  assert.match(
    traySource,
    /Ionicons[\s\S]*name={icon}[\s\S]*size=\{16\}/s,
    'The action pills should be a bit smaller so the tray feels lighter'
  );

  assert.match(
    traySource,
    /minHeight:\s*60/,
    'The action pills should be slightly shorter than before'
  );

  assert.match(
    traySource,
    /width:\s*50/,
    'The action pills should be sized tighter so the whole row can stay mostly on screen'
  );

  assert.equal(
    traySource.includes('ScrollView'),
    false,
    'The tray should not need a horizontal ScrollView now that the actions fit on one row'
  );

  assert.match(
    highlightSource,
    /onTextLayout=/,
    'Highlighted verses should measure wrapped lines so each line can get its own rounded highlight pill'
  );

  assert.match(
    highlightSource,
    /highlightLine:/,
    'Highlighted verses should render each line as its own highlight fragment'
  );

  assert.match(
    highlightSource,
    /borderRadius:\s*radius\.xs/,
    'Line-level highlight fragments should keep compact rounded edges from the reference screenshot'
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

  assert.equal(
    traySource.includes('annotations.highlight'),
    false,
    'The tray should not show a separate highlight button when the color chips apply immediately'
  );

  assert.equal(
    traySource.includes('highlightOverflow'),
    false,
    'The tray should not use an overflow palette now that all five highlight colors are shown inline'
  );
});
