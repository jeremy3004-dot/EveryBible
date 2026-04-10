import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPresetRhythmItems, RHYTHM_PRESET_LIBRARY, RHYTHM_PRESET_TRADITIONS } from './rhythmPresets';

test('rhythm preset library ships twenty curated starter rhythms', () => {
  assert.equal(RHYTHM_PRESET_LIBRARY.length, 20);
  assert.deepEqual(
    RHYTHM_PRESET_TRADITIONS,
    ['Catholic', 'Anglican', 'Orthodox', 'Benedictine', 'Taize', 'Lutheran', 'Puritan']
  );
});

test('rhythm presets cover morning, midday, evening, and anytime use cases', () => {
  const slots = new Set(RHYTHM_PRESET_LIBRARY.map((preset) => preset.slot));

  assert.ok(slots.has('morning'));
  assert.ok(slots.has('afternoon'));
  assert.ok(slots.has('evening'));
  assert.ok(slots.has(null));
});

test('each rhythm preset expands into valid rhythm items', () => {
  for (const preset of RHYTHM_PRESET_LIBRARY) {
    const items = buildPresetRhythmItems(preset);

    assert.ok(items.length > 0, `${preset.id} should include at least one item`);
    for (const item of items) {
      assert.equal(item.id, '', `${preset.id} should let the store generate fresh item ids`);
      if (item.type === 'passage') {
        assert.ok(item.title.length > 0, `${preset.id} passage items should have titles`);
        assert.ok(item.bookId.length > 0, `${preset.id} passage items should include a book id`);
        assert.ok(item.startChapter > 0, `${preset.id} passage items should include a start chapter`);
        assert.ok(item.endChapter >= item.startChapter, `${preset.id} passage ranges should be valid`);
      }
    }
  }
});
