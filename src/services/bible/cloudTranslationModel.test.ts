import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCloudTextTranslationId } from './cloudTranslationModel';

test('resolveCloudTextTranslationId maps friendly aliases to imported backend ids', () => {
  assert.equal(resolveCloudTextTranslationId('web', 'WEB'), 'engwebp');
  assert.equal(resolveCloudTextTranslationId('asv', 'ASV'), 'eng-asv');
  assert.equal(resolveCloudTextTranslationId('YLT', 'YLT'), 'engylt');
  assert.equal(resolveCloudTextTranslationId('rvr', 'RVR'), 'spaRV1909');
  assert.equal(resolveCloudTextTranslationId('sparv1909', 'spaRV1909'), 'spaRV1909');
});

test('resolveCloudTextTranslationId preserves canonical ids when no alias is needed', () => {
  assert.equal(resolveCloudTextTranslationId('spaRV1909', 'spaRV1909'), 'spaRV1909');
  assert.equal(resolveCloudTextTranslationId('hincv', 'hincv'), 'hincv');
});
