import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'RhythmDetailScreen.tsx'), 'utf8');

test('RhythmDetailScreen builds a rhythm session and resumes the reader with session context', () => {
  assert.match(
    source,
    /buildRhythmReaderSession\(\{/,
    'RhythmDetailScreen should use the shared rhythm session helper to flatten the current rhythm'
  );
  assert.match(
    source,
    /sessionContext:\s*session\.sessionContext/,
    'RhythmDetailScreen should pass the session context through to BibleReader'
  );
  assert.match(
    source,
    /playbackSequenceEntries:\s*session\.playbackSequenceEntries/,
    'RhythmDetailScreen should send the full rhythm playback sequence to BibleReader'
  );
});

test('RhythmDetailScreen exposes edit and continue actions for the rhythm', () => {
  assert.match(
    source,
    /navigation\.navigate\('RhythmComposer', \{ rhythmId \}\)/,
    'RhythmDetailScreen should let the user edit the current rhythm'
  );
  assert.match(
    source,
    /readingPlans\.continueRhythm/,
    'RhythmDetailScreen should label the main action as continue rhythm'
  );
  assert.match(
    source,
    /readingPlans\.rhythmDaySummary/,
    'RhythmDetailScreen should show a rhythm day summary section'
  );
});
