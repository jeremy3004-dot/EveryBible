// UI-only source check: BibleReaderScreen is too large to render here, so this pins how it configures PlaybackControls; the controls' behaviour is covered by PlaybackControls.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('Bible listen surfaces opt into the chapter-only transport variant', () => {
  const readerSource = readRelativeSource('../../screens/bible/BibleReaderScreen.tsx');

  assert.match(
    readerSource,
    /<PlaybackControls[\s\S]*variant="chapter-only"/,
    'BibleReaderScreen listen mode should use the simplified chapter-only player transport'
  );

  assert.match(
    readerSource,
    /<PlaybackControls[\s\S]*variant="chapter-only"[\s\S]*showUtilityRow=\{false\}/,
    'BibleReaderScreen audio-only mode should keep the chapter transport visible while moving utilities to the top audio menu'
  );
});
