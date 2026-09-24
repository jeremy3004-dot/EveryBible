import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocaleOptionRowAccessibility } from './localeOptionRowAccessibility';

test('a language row reads its native name, its English name and whether it is chosen', () => {
  assert.deepEqual(
    getLocaleOptionRowAccessibility({ title: 'Español', subtitle: 'Spanish', isSelected: true }),
    { label: 'Español, Spanish', state: { selected: true }, value: undefined }
  );
});

test('a caller label replaces only the title, keeping the subtitle and chip', () => {
  assert.deepEqual(
    getLocaleOptionRowAccessibility({
      title: 'हिन्दी',
      subtitle: 'Hindi',
      accessibilityLabel: 'Hindi',
      statusLabel: 'RECOMMENDED',
      isSelected: false,
    }).label,
    'Hindi, RECOMMENDED'
  );
});

test('a translation row without a radio mark carries no selected state', () => {
  assert.deepEqual(
    getLocaleOptionRowAccessibility({
      title: 'English',
      subtitle: 'Berean Standard Bible · Text and audio',
      statusLabel: 'DOWNLOAD',
    }),
    {
      label: 'English, Berean Standard Bible · Text and audio, DOWNLOAD',
      state: {},
      value: undefined,
    }
  );
});

test('a downloading row is busy and reports its progress as a clamped percentage', () => {
  assert.deepEqual(
    getLocaleOptionRowAccessibility({
      title: 'English',
      subtitle: 'Downloading 42%',
      isBusy: true,
      progress: 41.6,
    }),
    {
      label: 'English, Downloading 42%',
      state: { busy: true },
      value: { min: 0, max: 100, now: 42 },
    }
  );
  assert.deepEqual(
    getLocaleOptionRowAccessibility({ title: 'English', isBusy: true, progress: 140 }).value,
    { min: 0, max: 100, now: 100 }
  );
  assert.equal(
    getLocaleOptionRowAccessibility({ title: 'English', isBusy: true, progress: null }).value,
    undefined
  );
});

test('blank and repeated parts are dropped', () => {
  assert.equal(
    getLocaleOptionRowAccessibility({ title: 'English', subtitle: ' English ', statusLabel: '' })
      .label,
    'English'
  );
});
