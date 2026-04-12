import test from 'node:test';
import assert from 'node:assert/strict';

import { isHiddenTranslationId } from './translationCatalogVisibility';

test('isHiddenTranslationId blocks retired darby and English-world variants', () => {
  for (const translationId of ['darby', 'engdby', 'engdra', 'enggnv', 'eng-web', 'web']) {
    assert.equal(isHiddenTranslationId(translationId), true, `${translationId} should be hidden`);
  }
});

test('isHiddenTranslationId keeps BSB visible', () => {
  assert.equal(isHiddenTranslationId('bsb'), false);
});
