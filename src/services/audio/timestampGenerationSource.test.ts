import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'scripts', 'generate_timestamps.py'),
  'utf8'
);

test('timestamp generation preserves the original verse line breaks during alignment', () => {
  assert.match(
    source,
    /model\.align\(\s*str\(audio_path\),\s*full_text,\s*language="en",\s*original_split=True,\s*\)/s,
    'Verse timing generation should preserve the input line breaks so stable-ts returns verse-level segments'
  );
});

test('timestamp generation serializes stable-ts align calls on the shared Whisper model', () => {
  assert.match(
    source,
    /_align_lock\s*=\s*threading\.Lock\(\)/,
    'A dedicated alignment lock should exist when the batch runner shares one Whisper model'
  );

  assert.match(
    source,
    /with _align_lock:\s*result = model\.align\(/s,
    'Verse timing generation should serialize stable-ts align calls to avoid concurrent alignment crashes'
  );
});
