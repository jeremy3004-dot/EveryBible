import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertCompleteCloudTranslationFetch,
  buildUnavailableCloudTranslationMessage,
  resolveCloudTextTranslationId,
  shouldContinueCloudTranslationFetch,
} from './cloudTranslationModel';

test('resolveCloudTextTranslationId maps friendly aliases to imported backend ids', () => {
  assert.equal(resolveCloudTextTranslationId('web', 'WEB'), 'engwebp');
  assert.equal(resolveCloudTextTranslationId('YLT', 'YLT'), 'engylt');
  assert.equal(resolveCloudTextTranslationId('bbe', 'BBE'), 'engBBE');
  assert.equal(resolveCloudTextTranslationId('rvr', 'RVR'), 'spaRV1909');
});

test('resolveCloudTextTranslationId preserves canonical ids when no alias is needed', () => {
  assert.equal(resolveCloudTextTranslationId('spaRV1909', 'spaRV1909'), 'spaRV1909');
  assert.equal(resolveCloudTextTranslationId('hincv', 'hincv'), 'hincv');
});

test('buildUnavailableCloudTranslationMessage returns a user-facing backend availability error', () => {
  assert.equal(
    buildUnavailableCloudTranslationMessage('KJV'),
    'KJV is not currently available from the backend.'
  );
});

test('shouldContinueCloudTranslationFetch keeps paging when the backend clamps results below page size', () => {
  assert.equal(
    shouldContinueCloudTranslationFetch({
      totalVerses: 31087,
      fetchedVerses: 1000,
      lastPageLength: 1000,
    }),
    true
  );
});

test('shouldContinueCloudTranslationFetch stops once all verses have been fetched', () => {
  assert.equal(
    shouldContinueCloudTranslationFetch({
      totalVerses: 31087,
      fetchedVerses: 31087,
      lastPageLength: 1000,
    }),
    false
  );
});

test('assertCompleteCloudTranslationFetch throws when only a partial bible was fetched', () => {
  assert.throws(
    () => assertCompleteCloudTranslationFetch('hincv', 31087, 1000),
    /expected 31087 verses, received 1000/i
  );
});
