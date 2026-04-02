import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AudioFirstChapterCard removes redundant watermark art and explanatory audio-only copy', () => {
  const source = readRelativeSource('./AudioFirstChapterCard.tsx');

  assert.equal(
    source.includes('heroWatermark'),
    false,
    'AudioFirstChapterCard should not render the duplicated background watermark artwork'
  );

  assert.equal(
    source.includes('heroPanel'),
    false,
    'AudioFirstChapterCard should remove the extra nested hero shell'
  );

  assert.equal(
    source.includes('iconShell'),
    false,
    'AudioFirstChapterCard should not wrap the book art in a second nested icon shell'
  );

  assert.equal(
    source.includes("t('bible.audioOnlyTitle')"),
    false,
    'AudioFirstChapterCard should remove the redundant audio-only headline copy'
  );

  assert.equal(
    source.includes("t('bible.audioOnlyBody'"),
    false,
    'AudioFirstChapterCard should remove the explanatory body copy for audio-only chapters'
  );
});

test('AudioFirstChapterCard keeps the listen controls comfortably above the bottom edge', () => {
  const source = readRelativeSource('./AudioFirstChapterCard.tsx');

  assert.match(
    source,
    /card:\s*{[\s\S]*flex:\s*1,[\s\S]*paddingBottom:\s*20,[\s\S]*justifyContent:\s*'flex-start'/s,
    'AudioFirstChapterCard should top-align its content so the playback controls do not clip at the bottom of the viewport'
  );
});

test('AudioFirstChapterCard moves audio sharing into the shared playback controls', () => {
  const source = readRelativeSource('./AudioFirstChapterCard.tsx');

  assert.match(
    source,
    /onShare\?: \(\) => void;/,
    'AudioFirstChapterCard should accept a share callback from the Bible reader'
  );

  assert.match(
    source,
    /<PlaybackControls[\s\S]*onShareAudio=\{onShare\}/s,
    'AudioFirstChapterCard should pass the audio-share callback into PlaybackControls'
  );

  assert.equal(
    source.includes('shareButton'),
    false,
    'AudioFirstChapterCard should not keep a separate share button in the metadata row once PlaybackControls owns it'
  );
});

test('AudioFirstChapterCard removes the duplicate chapter reference from the scrubber row', () => {
  const source = readRelativeSource('./AudioFirstChapterCard.tsx');

  assert.equal(
    source.includes('timeCenterText'),
    false,
    'AudioFirstChapterCard should remove the centered chapter label because the shared top chrome already shows the reference'
  );

  assert.equal(
    source.includes('getTranslatedBookName'),
    false,
    'AudioFirstChapterCard should not resolve a second chapter label once the shared top chrome owns that metadata'
  );
});

test('AudioFirstChapterCard removes the duplicate chapter and translation copy below the artwork', () => {
  const source = readRelativeSource('./AudioFirstChapterCard.tsx');

  assert.equal(
    source.includes('translationLabel: string;'),
    false,
    'AudioFirstChapterCard should stop accepting a dedicated translation label once the shared reader chrome carries it above'
  );

  assert.equal(
    source.includes('styles.metaRow'),
    false,
    'AudioFirstChapterCard should remove the duplicate metadata row below the artwork'
  );

  assert.equal(
    source.includes('styles.title'),
    false,
    'AudioFirstChapterCard should remove the duplicate chapter title below the artwork'
  );

  assert.equal(
    source.includes('styles.subtitle'),
    false,
    'AudioFirstChapterCard should remove the duplicate translation subtitle below the artwork'
  );
});
