import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from './en';

test('English gather labels expose foundations and wisdom', () => {
  assert.equal(en.gather.foundations, 'Foundations');
  assert.equal(en.gather.wisdom, 'Wisdom');
  assert.equal('topics' in en.gather, false);
});
