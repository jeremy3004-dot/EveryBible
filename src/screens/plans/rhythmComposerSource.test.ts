import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'RhythmComposerScreen.tsx'), 'utf8');

test('RhythmComposerScreen is driven by the preset library instead of the old builder', () => {
  assert.match(
    source,
    /RHYTHM_PRESET_LIBRARY/,
    'RhythmComposerScreen should render from a curated preset library'
  );
  assert.match(
    source,
    /Historic rhythms/,
    'RhythmComposerScreen should frame the experience around historic starter rhythms'
  );
  assert.doesNotMatch(
    source,
    /NestableDraggableFlatList|BuilderMode|ChapterStepper|handleAddPassage/,
    'RhythmComposerScreen should no longer carry the old drag-and-build composer machinery'
  );
});

test('RhythmComposerScreen filters presets by time of day and tradition', () => {
  assert.match(
    source,
    /type SlotFilter = 'all' \| 'anytime' \| RhythmSlot;/,
    'RhythmComposerScreen should support both slot-based and anytime preset filtering'
  );
  assert.match(
    source,
    /RHYTHM_PRESET_TRADITIONS/,
    'RhythmComposerScreen should expose tradition filters for the preset catalog'
  );
  assert.match(
    source,
    /setSlotFilter\('anytime'\)/,
    'RhythmComposerScreen should let the user narrow the catalog to all-day rhythms'
  );
});

test('RhythmComposerScreen creates or replaces rhythms directly from presets', () => {
  assert.match(
    source,
    /createRhythm\(\{\s*title: preset\.title,\s*slot: preset\.slot,\s*items: buildPresetRhythmItems\(preset\),\s*\}\)/s,
    'RhythmComposerScreen should create new rhythms directly from preset definitions'
  );
  assert.match(
    source,
    /updateRhythm\(currentRhythm\.id,\s*\{\s*title: preset\.title,\s*slot: preset\.slot,\s*items: buildPresetRhythmItems\(preset\),\s*\}\)/s,
    'RhythmComposerScreen should let edit mode replace an existing rhythm with a preset'
  );
  assert.match(
    source,
    /navigation\.replace\('RhythmDetail', \{ rhythmId: result\.rhythm\.id \}\)/,
    'RhythmComposerScreen should land on the rhythm detail screen after applying a preset'
  );
});

test('RhythmComposerScreen still lets users delete an existing rhythm', () => {
  assert.match(
    source,
    /deleteRhythm\(currentRhythm\.id\)/,
    'RhythmComposerScreen should keep deletion available while edit mode is simplified'
  );
  assert.match(
    source,
    /Replace current rhythm/,
    'RhythmComposerScreen should explain that edit mode now replaces a rhythm from the preset catalog'
  );
});
