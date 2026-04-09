import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'RhythmComposerScreen.tsx'), 'utf8');

test('RhythmComposerScreen allows blank names and relies on the store fallback on save', () => {
  assert.match(
    source,
    /placeholder=\{t\('readingPlans\.rhythmNamePlaceholder'\)\}/,
    'RhythmComposerScreen should tell the user they can leave the rhythm name blank'
  );
  assert.match(
    source,
    /const result = currentRhythm\s*\?\s*updateRhythm\(currentRhythm\.id, input\)\s*:\s*createRhythm\(input\);/s,
    'RhythmComposerScreen should hand the raw title input through to the store so fallback naming can happen there'
  );
});

test('RhythmComposerScreen blocks plans that already belong to another rhythm', () => {
  assert.match(
    source,
    /alreadyInAnotherRhythm/,
    'RhythmComposerScreen should show a clear conflict message when a plan is already included in another rhythm'
  );
  assert.match(
    source,
    /planUnavailableForRhythm/,
    'RhythmComposerScreen should label ineligible plans as unavailable for rhythms'
  );
});

test('RhythmComposerScreen supports manual ordering and rhythm deletion', () => {
  assert.match(
    source,
    /moveSelectedPlan/,
    'RhythmComposerScreen should provide explicit move up and move down controls for rhythm ordering'
  );
  assert.match(
    source,
    /deleteRhythm\(currentRhythm\.id\)/,
    'RhythmComposerScreen should let the user delete an existing rhythm'
  );
  assert.match(
    source,
    /navigation\.replace\('RhythmDetail', \{ rhythmId: result\.rhythm\.id \}\)/,
    'RhythmComposerScreen should route a newly created rhythm into the detail view'
  );
});
