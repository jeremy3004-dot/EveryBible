import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVisibleTranslationsForPicker,
  getTranslationSelectionState,
  isTranslationReadableLocally,
} from './bibleTranslationModel';

test('downloaded translations are selectable', () => {
  const state = getTranslationSelectionState({
    isDownloaded: true,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
  });

  assert.deepEqual(state, {
    isSelectable: true,
    reason: null,
  });
});

test('text translations remain selectable even when audio downloads are separate', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
  });

  assert.deepEqual(state, {
    isSelectable: true,
    reason: null,
  });
});

test('runtime text translations require an installed local pack before they are treated as readable', () => {
  assert.equal(
    isTranslationReadableLocally({
      isDownloaded: false,
      hasText: true,
      source: 'runtime',
      textPackLocalPath: null,
    }),
    false
  );

  assert.equal(
    isTranslationReadableLocally({
      isDownloaded: false,
      hasText: true,
      source: 'runtime',
      textPackLocalPath: 'file:///translations/niv.db',
    }),
    true
  );
});

test('bundled text translations remain readable without a runtime pack path', () => {
  assert.equal(
    isTranslationReadableLocally({
      isDownloaded: false,
      hasText: true,
      source: 'bundled',
      textPackLocalPath: null,
    }),
    true
  );
});

test('audio-only translations are blocked when no audio source is available', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: false,
    hasAudio: true,
    canPlayAudio: false,
  });

  assert.deepEqual(state, {
    isSelectable: false,
    reason: 'audio-unavailable',
  });
});

test('runtime text translations without an installed local pack require download instead of looking unavailable', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
    source: 'runtime',
    textPackLocalPath: null,
  });

  assert.deepEqual(state, {
    isSelectable: false,
    reason: 'download-required',
  });
});

test('runtime text translations become selectable once the local pack exists', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
    source: 'runtime',
    textPackLocalPath: 'file:///translations/niv.db',
  });

  assert.deepEqual(state, {
    isSelectable: true,
    reason: null,
  });
});

test('picker hides unreadable runtime placeholders while the runtime catalog is still hydrating', () => {
  const visible = getVisibleTranslationsForPicker(
    [
      {
        id: 'bsb',
        isDownloaded: true,
        hasText: true,
        source: 'bundled' as const,
        textPackLocalPath: null,
      },
      {
        id: 'hincv',
        isDownloaded: false,
        hasText: false,
        source: 'runtime' as const,
        textPackLocalPath: null,
      },
      {
        id: 'npiulb',
        isDownloaded: false,
        hasText: true,
        source: 'runtime' as const,
        textPackLocalPath: null,
      },
    ],
    {
      isHydratingRuntimeCatalog: true,
      hasHydratedRuntimeCatalog: false,
    }
  );

  assert.deepEqual(
    visible.map((translation) => translation.id),
    ['bsb']
  );
});
