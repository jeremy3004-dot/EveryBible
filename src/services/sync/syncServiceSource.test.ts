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

test('syncPreferences writes appearance_palette into user_preferences (M8)', () => {
  // The column exists in the remote schema
  // (20260409091500_add_appearance_palette_to_user_preferences.sql) and is read
  // back by mapRemotePreferences, so the local→cloud upsert must include it or
  // the palette silently resets to the DB default when a remote row wins LWW.
  assert.equal(
    source.includes('appearance_palette: mergedPreferences.preferences.appearancePalette'),
    true,
    'syncPreferences should upsert appearance_palette so the palette reaches the cloud'
  );
});

test('syncPreferences writes hide_play_button_from_reading_tab into user_preferences (M8)', () => {
  assert.equal(
    source.includes('hide_play_button_from_reading_tab'),
    true,
    'syncPreferences should upsert hide_play_button_from_reading_tab so the preference reaches the cloud'
  );
});

test('cloud sync also restores and uploads reading plan progress for signed-in users', () => {
  assert.match(
    source,
    /syncPlanProgress/,
    'syncAll should include reading plan progress uploads so offline plan work reaches the backend'
  );
  assert.match(
    source,
    /getUserPlanProgress/,
    'pullFromCloud should restore reading plan progress on a new device after sign-in'
  );
});
