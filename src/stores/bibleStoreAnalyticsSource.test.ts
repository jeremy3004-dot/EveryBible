import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('bibleStore emits analytics when a text translation download completes', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /trackEvent\(\s*'text_translation_download_completed'/,
    'Bible store should track a completed text translation download event'
  );

  assert.match(
    source,
    /download_units:\s*1/,
    'Text translation downloads should contribute one download unit for admin reporting'
  );
});

test('bibleStore emits analytics when audio downloads complete', () => {
  const source = readRelativeSource('./bibleStore.ts');

  assert.match(
    source,
    /trackEvent\(\s*'audio_download_completed'/,
    'Bible store should track completed audio download events'
  );

  assert.match(
    source,
    /download_scope:\s*'book'/,
    'Single-book audio downloads should label the scope as book'
  );

  assert.match(
    source,
    /download_scope:\s*[\s\S]*'translation' : 'collection'/,
    'Bulk audio downloads should distinguish full-translation downloads from partial collections'
  );
});
