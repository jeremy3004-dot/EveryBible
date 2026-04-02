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

test('AudioFirstChapterCard localizes the displayed Bible book name', () => {
  const source = readRelativeSource('./AudioFirstChapterCard.tsx');

  assert.match(
    source,
    /getTranslatedBookName\(bookId, t\)/,
    'AudioFirstChapterCard should resolve the chapter title through the translated book-name helper'
  );

  assert.equal(
    source.includes('{book?.name}'),
    false,
    'AudioFirstChapterCard should not render the raw English book catalog name in the player chrome'
  );
});
