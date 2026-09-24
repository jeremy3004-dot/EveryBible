import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLanguageName } from './language-name';

test('stray trailing punctuation from the project tracker is removed', () => {
  assert.equal(normalizeLanguageName('Marwari.'), 'Marwari');
  assert.equal(normalizeLanguageName('Naxi.'), 'Naxi');
  assert.equal(normalizeLanguageName('Bine:'), 'Bine');
  assert.equal(normalizeLanguageName('Farsi:'), 'Farsi');
  assert.equal(normalizeLanguageName('Chinese, Mandarin:'), 'Chinese, Mandarin');
  assert.equal(normalizeLanguageName('Chin, Mun..'), 'Chin, Mun');
  assert.equal(normalizeLanguageName('Auhelawa-'), 'Auhelawa');
  assert.equal(normalizeLanguageName('Chin, Falam: Khualshim.'), 'Chin, Falam: Khualshim');
});

test('trailing tracker notes in braces and editorial notes are removed', () => {
  assert.equal(normalizeLanguageName('Mangala {Delete}'), 'Mangala');
  assert.equal(normalizeLanguageName('Bhatri {Delete}1'), 'Bhatri');
  assert.equal(normalizeLanguageName('Loma: Bunde {Delete}'), 'Loma: Bunde');
  assert.equal(normalizeLanguageName('Tunen (change to tvu)'), 'Tunen');
  assert.equal(normalizeLanguageName('Foo: {Delete}'), 'Foo');
});

test('whitespace runs collapse and the ends are trimmed', () => {
  assert.equal(normalizeLanguageName('  Yir   Yoront. '), 'Yir Yoront');
  assert.equal(normalizeLanguageName('Tok  Pisin'), 'Tok Pisin');
});

test('real name punctuation and qualifiers are kept', () => {
  for (const name of [
    'Yoruba',
    "K'iche'",
    "'Are'are",
    '/=Haba',
    'Kxoe: [[Xo-Kxoe',
    '!Xóõ',
    'Buru [Nigeria]',
    'Gbaya (Central African Republic)',
    'Nepali (macrolanguage)',
    'Chin, Falam',
    'Aeta of Panay Is.',
    'Malagasy, T.',
  ]) {
    assert.equal(normalizeLanguageName(name), name);
  }
});

test('a name made only of noise keeps its text rather than becoming empty', () => {
  assert.equal(normalizeLanguageName('{Delete}'), '{Delete}');
  assert.equal(normalizeLanguageName('.  '), '.');
});
