import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Mutate } from 'zustand/vanilla';
import { mockMmkvStorage } from '../../testing/mockModules';
import { installRenderHarness, within } from '../../testing/render';
import { RHYTHM_PRESET_LIBRARY } from '../../services/plans/rhythmPresets';
import type { RhythmComposerScreenProps } from '../../navigation/types';
import type { ReadingPlansStoreApi } from '../../stores/readingPlansStore';

// The real reading-plans store runs behind an in-memory MMKV.
mockMmkvStorage(mock);
const harness = installRenderHarness(mock);
const t = harness.i18n.t.bind(harness.i18n);

type AlertButton = { text: string; style?: string; onPress?: () => void };

type PersistedReadingPlansStore = Mutate<ReadingPlansStoreApi, [['zustand/persist', unknown]]>;

async function loadStore() {
  const { readingPlansStore } = await import('../../stores/readingPlansStore');
  // The store is built with zustand's persist middleware, which its exported API type omits.
  const { persist } = readingPlansStore as PersistedReadingPlansStore;
  // Let the start-up rehydration finish first, so it cannot overwrite what a test seeds.
  if (!persist.hasHydrated()) await persist.rehydrate();
  return readingPlansStore;
}

afterEach(async () => {
  const store = await loadStore();
  store.setState(store.getInitialState(), true);
});

async function renderComposer(rhythmId?: string) {
  const { RhythmComposerScreen } = await import('./RhythmComposerScreen');
  const props = {
    navigation: harness.navigation.navigation,
    route: { key: 'composer', name: 'RhythmComposer', params: rhythmId ? { rhythmId } : {} },
  } as unknown as RhythmComposerScreenProps;
  return harness.render(<RhythmComposerScreen {...props} />);
}

const presetTitles = (view: Awaited<ReturnType<typeof renderComposer>>) =>
  RHYTHM_PRESET_LIBRARY.map((preset) => preset.title).filter((title) => view.queryByText(title));

const callsTo = (method: string) =>
  harness.navigation.calls.filter((call) => call.method === method).map((call) => call.args);

test('the composer offers every historic preset as a card under the "Historic rhythms" hero', async () => {
  const view = await renderComposer();

  assert.ok(view.getByText(t('plans.rhythmComposer.heroEyebrow')));
  assert.ok(view.getByRole('header', { name: t('readingPlans.createRhythm') }));
  assert.deepEqual(
    presetTitles(view),
    RHYTHM_PRESET_LIBRARY.map((preset) => preset.title)
  );
  assert.equal(
    view.getAllByText(t('plans.rhythmComposer.addRhythm')).length,
    RHYTHM_PRESET_LIBRARY.length
  );
  // Presets replaced the old drag-and-build composer: no name field, passage picker or steppers.
  assert.equal(view.queryAllByType('TextInput').length, 0);
  for (const key of [
    'readingPlans.addPassage',
    'readingPlans.rhythmName',
    'readingPlans.startChapterLabel',
  ]) {
    assert.equal(view.queryByText(t(key)), null, key);
  }
});

test('the "Any time" filter narrows the list to presets with no fixed slot and is announced as selected', async () => {
  const view = await renderComposer();
  const anytime = RHYTHM_PRESET_LIBRARY.filter((preset) => preset.slot === null);
  assert.ok(anytime.length > 0 && anytime.length < RHYTHM_PRESET_LIBRARY.length);

  assert.ok(
    view.getByRole('button', { name: t('plans.rhythmComposer.filterAll'), selected: true })
  );
  await view.press(
    view.getByRole('button', { name: t('plans.rhythmComposer.anyTime'), selected: false })
  );

  assert.ok(view.getByRole('button', { name: t('plans.rhythmComposer.anyTime'), selected: true }));
  assert.ok(
    view.getByRole('button', { name: t('plans.rhythmComposer.filterAll'), selected: false })
  );
  assert.deepEqual(
    presetTitles(view),
    anytime.map((preset) => preset.title)
  );
});

test('a tradition filter narrows the list to that tradition, and an impossible combination shows the empty state', async () => {
  const view = await renderComposer();
  const chips = [
    [t('readingPlans.morningLabel'), 'morning'],
    [t('plans.rhythmComposer.midday'), 'afternoon'],
    [t('readingPlans.eveningLabel'), 'evening'],
    [t('plans.rhythmComposer.anyTime'), null],
  ] as const;
  // A tradition that has no preset for one of the times of day.
  const presetsOf = (tradition: string) =>
    RHYTHM_PRESET_LIBRARY.filter((preset) => preset.tradition === tradition);
  const [tradition, missing] = RHYTHM_PRESET_LIBRARY.map((preset) => preset.tradition)
    .map((name) => {
      const slots = new Set(presetsOf(name).map((preset) => preset.slot));
      return [name, chips.find(([, slot]) => !slots.has(slot))] as const;
    })
    .find(([, chip]) => chip)!;
  assert.ok(missing, 'fixture: some tradition lacks some time of day');

  await view.press(view.getByRole('button', { name: tradition }));
  assert.ok(view.getByRole('button', { name: tradition, selected: true }));
  assert.deepEqual(
    presetTitles(view),
    presetsOf(tradition).map((preset) => preset.title)
  );
  assert.equal(view.queryByText(t('plans.rhythmComposer.emptyTitle')), null);

  await view.press(view.getByRole('button', { name: missing[0] }));

  assert.deepEqual(presetTitles(view), []);
  assert.ok(view.getByText(t('plans.rhythmComposer.emptyTitle')));
  assert.ok(view.getByText(t('plans.rhythmComposer.emptyBody')));
});

test('tapping a preset creates a rhythm from it and replaces the composer with that rhythm', async () => {
  const store = await loadStore();
  const view = await renderComposer();
  const preset = RHYTHM_PRESET_LIBRARY[0];

  await view.press(view.getByText(preset.title));

  const [rhythmId] = store.getState().rhythmOrder;
  assert.ok(rhythmId, 'a rhythm was created');
  const rhythm = store.getState().rhythmsById[rhythmId];
  assert.equal(rhythm.title, preset.title);
  assert.equal(rhythm.slot, preset.slot);
  assert.deepEqual(
    rhythm.items.map((item) => (item.type === 'passage' ? item.title : item.planId)),
    preset.items.map((item) => (item.type === 'passage' ? item.title : item.planId))
  );
  assert.deepEqual(callsTo('replace'), [['RhythmDetail', { rhythmId }]]);
  assert.deepEqual(harness.rn.__recorded.alerts, []);
});

test('in edit mode, tapping a preset replaces the existing rhythm in place and opens it', async () => {
  const store = await loadStore();
  const created = store.getState().createRhythm({
    title: 'My morning',
    slot: 'morning',
    items: [
      {
        id: '',
        type: 'passage',
        title: 'John 1',
        bookId: 'JHN',
        startChapter: 1,
        endChapter: 1,
      },
    ],
  });
  const rhythmId = created.rhythm!.id;
  const view = await renderComposer(rhythmId);
  const preset = RHYTHM_PRESET_LIBRARY.find((candidate) => candidate.slot === 'evening')!;

  assert.ok(view.getByRole('header', { name: t('readingPlans.editRhythm') }));
  assert.ok(view.getByText(t('plans.rhythmComposer.replaceCurrentTitle')));
  assert.ok(view.getByText('My morning'));
  assert.equal(
    view.getAllByText(t('plans.rhythmComposer.replaceRhythm')).length,
    RHYTHM_PRESET_LIBRARY.length
  );

  await view.press(view.getByText(preset.title));

  assert.deepEqual(store.getState().rhythmOrder, [rhythmId], 'no second rhythm');
  const rhythm = store.getState().rhythmsById[rhythmId];
  assert.equal(rhythm.title, preset.title);
  assert.equal(rhythm.slot, 'evening');
  assert.equal(rhythm.items.length, preset.items.length);
  assert.deepEqual(callsTo('replace'), [['RhythmDetail', { rhythmId }]]);
});

test('in edit mode, Delete Rhythm asks first and only the destructive choice deletes and pops to the top', async () => {
  const store = await loadStore();
  const created = store.getState().createRhythm({
    title: 'My evening',
    slot: 'evening',
    items: [
      { id: '', type: 'passage', title: 'Psalm 4', bookId: 'PSA', startChapter: 4, endChapter: 4 },
    ],
  });
  const rhythmId = created.rhythm!.id;
  const view = await renderComposer(rhythmId);

  await view.press(view.getByRole('button', { name: t('readingPlans.deleteRhythm') }));

  const [alert] = harness.rn.__recorded.alerts;
  assert.equal(alert.title, t('readingPlans.deleteRhythmConfirmTitle'));
  assert.ok(store.getState().rhythmsById[rhythmId], 'nothing is deleted before confirming');

  const buttons = alert.buttons as AlertButton[];
  assert.equal(
    buttons.find((button) => button.style === 'cancel')?.onPress,
    undefined,
    'cancel does nothing'
  );
  buttons.find((button) => button.style === 'destructive')!.onPress!();

  assert.equal(store.getState().rhythmsById[rhythmId], undefined);
  assert.deepEqual(callsTo('popToTop'), [[]]);
});

test('a new rhythm has no delete action or current-rhythm card', async () => {
  const view = await renderComposer();

  assert.equal(view.queryByRole('button', { name: t('readingPlans.deleteRhythm') }), null);
  assert.equal(view.queryByText(t('plans.rhythmComposer.replaceCurrentTitle')), null);
});

test('editing a rhythm that no longer exists explains it and offers a way back', async () => {
  const view = await renderComposer('missing-rhythm');

  assert.ok(view.getByText(t('plans.rhythmComposer.rhythmNotFound')));
  assert.equal(view.queryByText(t('plans.rhythmComposer.heroEyebrow')), null);
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.deepEqual(callsTo('goBack'), [[]]);
});

test('each preset card lists its tradition, historic roots and included passages', async () => {
  const view = await renderComposer();
  const preset = RHYTHM_PRESET_LIBRARY[0];

  const card = view
    .getAllByRole('button')
    .find((button) => within(button).queryByText(preset.title))!;
  const scoped = within(card);
  assert.ok(scoped.getByText(preset.historicRoots));
  assert.ok(scoped.getByText(preset.tradition));
  assert.ok(scoped.getByText(t('plans.rhythmComposer.historicRoots')));
  assert.ok(scoped.getByText(t('plans.rhythmComposer.includes')));
});
