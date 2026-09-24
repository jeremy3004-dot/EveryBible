import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { TFunction } from 'i18next';
import { mockMmkvStorage } from '../../../testing/mockModules';
import { RHYTHM_PRESET_LIBRARY, type RhythmPreset } from '../../../services/plans/rhythmPresets';

// The model reads its error codes from the reading-plans store, which persists to MMKV.
mockMmkvStorage(mock);

const t = ((key: string) => `t:${key}`) as unknown as TFunction;

const preset = (overrides: Partial<RhythmPreset>): RhythmPreset => ({
  id: 'preset',
  title: 'Preset',
  tradition: 'Catholic',
  historicRoots: 'Roots',
  description: 'Description',
  slot: 'morning',
  items: [],
  ...overrides,
});

const load = () => import('./rhythmComposerModel');

test('with no filters every preset is offered', async () => {
  const { ALL_TRADITIONS, filterRhythmPresets } = await load();
  assert.deepEqual(
    filterRhythmPresets(RHYTHM_PRESET_LIBRARY, 'all', ALL_TRADITIONS),
    RHYTHM_PRESET_LIBRARY
  );
});

test('"Any time" keeps presets with no slot; a slot keeps only its own', async () => {
  const { ALL_TRADITIONS, filterRhythmPresets } = await load();
  const presets = [
    preset({ id: 'dawn', slot: 'morning' }),
    preset({ id: 'noon', slot: 'afternoon' }),
    preset({ id: 'free', slot: null }),
  ];
  const ids = (filter: Parameters<typeof filterRhythmPresets>[1]) =>
    filterRhythmPresets(presets, filter, ALL_TRADITIONS).map((item) => item.id);

  assert.deepEqual(ids('anytime'), ['free']);
  assert.deepEqual(ids('afternoon'), ['noon']);
  assert.deepEqual(ids('evening'), []);
});

test('the tradition and time-of-day filters combine', async () => {
  const { filterRhythmPresets } = await load();
  const presets = [
    preset({ id: 'cat-am', tradition: 'Catholic', slot: 'morning' }),
    preset({ id: 'ang-am', tradition: 'Anglican', slot: 'morning' }),
    preset({ id: 'ang-pm', tradition: 'Anglican', slot: 'evening' }),
  ];
  assert.deepEqual(
    filterRhythmPresets(presets, 'morning', 'Anglican').map((item) => item.id),
    ['ang-am']
  );
});

test('the time-of-day chips run All, Morning, Midday, Evening, Any time', async () => {
  const { SLOT_FILTER_CHIPS } = await load();
  assert.deepEqual(
    SLOT_FILTER_CHIPS.map((chip) => [chip.filter, chip.labelKey]),
    [
      ['all', 'plans.rhythmComposer.filterAll'],
      ['morning', 'readingPlans.morningLabel'],
      ['afternoon', 'plans.rhythmComposer.midday'],
      ['evening', 'readingPlans.eveningLabel'],
      ['anytime', 'plans.rhythmComposer.anyTime'],
    ]
  );
});

test('a tradition is translated through the first preset of that tradition', async () => {
  const { getTraditionLabelKey } = await load();
  const first = RHYTHM_PRESET_LIBRARY[0];
  assert.equal(
    getTraditionLabelKey(first.tradition),
    `interface.rhythmPresets.${first.id}.tradition`
  );
});

test('a preset without a slot is labelled "Any time"', async () => {
  const { getRhythmSlotLabel } = await load();
  assert.equal(getRhythmSlotLabel(null, t), 't:plans.rhythmComposer.anyTime');
  assert.equal(getRhythmSlotLabel('evening', t), 't:readingPlans.eveningLabel');
});

test('the Includes line lists passage titles and plan ids, dot-separated', async () => {
  const { buildPresetItemPreview } = await load();
  assert.equal(
    buildPresetItemPreview(
      preset({
        items: [
          { type: 'passage', title: 'Psalm 63', bookId: 'PSA', startChapter: 63 },
          { type: 'plan', planId: 'psalms-30-days' },
        ],
      })
    ),
    'Psalm 63  •  psalms-30-days'
  );
});

test('each rejected-save code has its own message, and anything else a generic one', async () => {
  const { resolveRhythmErrorMessage } = await load();
  const { RHYTHM_MUTATION_ERROR_CODES } = await import('../../../stores/readingPlansStore');

  assert.equal(
    resolveRhythmErrorMessage(RHYTHM_MUTATION_ERROR_CODES.emptyItems, t),
    't:plans.rhythmComposer.errorEmptyItems'
  );
  assert.equal(
    resolveRhythmErrorMessage(RHYTHM_MUTATION_ERROR_CODES.planInAnotherRhythm, t),
    't:plans.rhythmComposer.errorPlanInAnotherRhythm'
  );
  assert.equal(
    resolveRhythmErrorMessage(RHYTHM_MUTATION_ERROR_CODES.notFound, t),
    't:plans.rhythmComposer.errorRhythmNotFound'
  );
  assert.equal(resolveRhythmErrorMessage(undefined, t), 't:common.unexpectedError');
  assert.equal(resolveRhythmErrorMessage('SOMETHING_NEW', t), 't:common.unexpectedError');
});
