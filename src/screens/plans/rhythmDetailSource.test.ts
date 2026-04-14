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
    /const preferredChapterLaunchMode = useBibleStore\(\(state\) => state\.preferredChapterLaunchMode\);/,
    'RhythmDetailScreen should read the persisted listen-or-read preference before continuing a rhythm'
  );
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
  assert.match(
    source,
    /\.\.\.\(preferredChapterLaunchMode === 'listen' \? \{ autoplayAudio: true \} : \{\}\),/,
    'RhythmDetailScreen should request autoplay when the persisted launch preference is listen'
  );
  assert.match(
    source,
    /preferredMode:\s*preferredChapterLaunchMode,/,
    'RhythmDetailScreen should continue rhythms in the persisted listen-or-read mode instead of hard-coding read mode'
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
    /readingPlans\.rhythmSequence/,
    'RhythmDetailScreen should show the rhythm sequence section for the ordered items'
  );
  assert.match(
    source,
    /segment\.itemId/,
    'RhythmDetailScreen should key ordered rhythm segments by item so custom passages and plans can coexist safely'
  );
  assert.match(
    source,
    /RHYTHM_SLOT_META\[slot\]/,
    'RhythmDetailScreen should surface the selected rhythm slot with shared metadata so Morning, Afternoon, and Evening labels stay consistent'
  );
  assert.match(
    source,
    /readingPlans\.nextUp/,
    'RhythmDetailScreen should preview the next sequence item in the summary card before the user continues the rhythm'
  );
});
