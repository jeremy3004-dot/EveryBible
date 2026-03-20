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
