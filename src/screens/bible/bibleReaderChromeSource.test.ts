import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen no longer renders a duplicate chapter rail under the player', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('styles.chapterRail'),
    false,
    'BibleReaderScreen should not render the old bottom chapter rail once player navigation is in place'
  );

  assert.equal(
    source.includes('handlePrevChapter'),
    false,
    'BibleReaderScreen should not keep the removed chapter rail handlers around'
  );

  assert.equal(
    source.includes('handleNextChapter'),
    false,
    'BibleReaderScreen should not keep the removed chapter rail handlers around'
  );
});

test('Bible listen surfaces stretch to fill the reader canvas instead of floating mid-screen', () => {
  const readerSource = readRelativeSource('./BibleReaderScreen.tsx');
  const audioFirstSource = readRelativeSource('../../components/audio/AudioFirstChapterCard.tsx');

  assert.match(
    readerSource,
    /listenColumn:\s*{[\s\S]*flex:\s*1,[\s\S]*justifyContent:\s*'space-between'/,
    'Listen-mode reader layout should fill the available height and push controls lower'
  );

  assert.match(
    audioFirstSource,
    /card:\s*{[\s\S]*flex:\s*1,[\s\S]*justifyContent:\s*'space-between'/,
    'Audio-first chapter card should fill the reader canvas and distribute content vertically'
  );
});

test('BibleReaderScreen uses minimal listen chrome instead of repeating chapter metadata in the header', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const showMinimalListenChrome =[\s\S]*chapterSessionMode === 'listen' \|\| chapterPresentationMode === 'audio-first';/,
    'BibleReaderScreen should compute a dedicated minimal-header mode for listen and audio-first chapters'
  );

  assert.match(
    source,
    /!showMinimalListenChrome && \([\s\S]*styles\.title/s,
    'BibleReaderScreen should hide the duplicated chapter title when minimal listen chrome is active'
  );

  assert.match(
    source,
    /!showMinimalListenChrome && \([\s\S]*styles\.translationChip/s,
    'BibleReaderScreen should hide the translation chip when minimal listen chrome is active'
  );

  assert.match(
    source,
    /!showMinimalListenChrome && \([\s\S]*styles\.fontButtonLabel/s,
    'BibleReaderScreen should hide the font-size button when minimal listen chrome is active'
  );
});

test('listen mode no longer renders the extra eyebrow and play-CTA card copy above the player', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('styles.listenEyebrow'),
    false,
    'BibleReaderScreen should remove the extra translation eyebrow from the listen-mode hero'
  );

  assert.equal(
    source.includes('styles.listenPrimaryAction'),
    false,
    'BibleReaderScreen should remove the redundant play-chapter CTA from the listen-mode hero'
  );
});
