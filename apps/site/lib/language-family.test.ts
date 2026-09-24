import assert from 'node:assert/strict';
import test from 'node:test';

import { languageFamily, languageNoun } from './language-family';

test('a real language family is kept', () => {
  assert.equal(languageFamily('Atlantic-Congo'), 'Atlantic-Congo');
  assert.equal(languageNoun('Atlantic-Congo'), 'a language');
  assert.equal(languageFamily(null), null);
  assert.equal(languageNoun(null), 'a language');
});

test("Glottolog's pseudo-families are never presented as language families", () => {
  for (const family of [
    'Bookkeeping',
    'Unclassifiable',
    'Unattested',
    'Sign Language',
    'Pidgin',
    'Mixed Language',
    'Artificial Language',
    'Speech Register',
  ]) {
    assert.equal(languageFamily(family), null, family);
  }
  assert.equal(languageNoun('Bookkeeping'), 'a language');
  assert.equal(languageNoun('Unclassifiable'), 'a language');
  assert.equal(languageNoun('Sign Language'), 'a sign language');
  assert.equal(languageNoun('Pidgin'), 'a pidgin');
  assert.equal(languageNoun('Mixed Language'), 'a mixed language');
  assert.equal(languageNoun('Artificial Language'), 'a constructed language');
  assert.equal(languageNoun('Speech Register'), 'a speech register');
});
