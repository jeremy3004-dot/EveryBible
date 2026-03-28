import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'syncService.ts'),
  'utf8'
);

test('sync service avoids static progress and bible store imports so startup does not eagerly form a require cycle', () => {
  assert.equal(
    source.includes("import { useProgressStore } from '../../stores/progressStore';"),
    false,
    'syncService should not statically import useProgressStore because progressStore already lazy-loads sync work'
  );

  assert.equal(
    source.includes("import { useBibleStore } from '../../stores/bibleStore';"),
    false,
    'syncService should not statically import useBibleStore on the startup path'
  );

  assert.equal(
    source.includes("import('../../stores/progressStore')"),
    true,
    'syncService should lazy-load the progress store when a sync actually runs'
  );

  assert.equal(
    source.includes("import('../../stores/bibleStore')"),
    true,
    'syncService should lazy-load the bible store when a sync actually runs'
  );
});

test('syncPreferences does not upsert a manual chapter feedback ID number into user_preferences', () => {
  assert.equal(
    source.includes('chapter_feedback_id_number'),
    false,
    'syncPreferences should not write a manual chapter feedback ID number into user_preferences'
  );
});
