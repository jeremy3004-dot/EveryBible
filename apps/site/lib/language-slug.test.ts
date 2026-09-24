import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasLanguagePage,
  isLanguageSlug,
  languagePagePath,
  languageShard,
  languageSlug,
  slugifyLanguageName,
} from './language-slug';

test('names become lowercase ASCII words joined by hyphens', () => {
  assert.equal(slugifyLanguageName('Yoruba'), 'yoruba');
  assert.equal(slugifyLanguageName("'Are'are"), 'areare');
  assert.equal(slugifyLanguageName('!Gã!ne'), 'gane');
  assert.equal(slugifyLanguageName('Berom: Fan'), 'berom-fan');
  assert.equal(slugifyLanguageName('Ajyíninka Apurucayali'), 'ajyininka-apurucayali');
  assert.equal(slugifyLanguageName('Kyrgyz (Northern)'), 'kyrgyz-northern');
  assert.equal(slugifyLanguageName('Ǆuǆa'), 'dzudza');
  assert.equal(slugifyLanguageName('Ελληνικά'), '');
});

test('long names are trimmed on a word boundary-safe length without trailing hyphens', () => {
  const slug = slugifyLanguageName('A '.repeat(80) + 'Language');
  assert.ok(slug.length <= 60);
  assert.doesNotMatch(slug, /-$/);
});

test('each record id contributes a stable, collision-safe code', () => {
  assert.equal(languageSlug({ id: 'iso:yor', name: 'Yoruba' }), 'yoruba-yor');
  assert.equal(languageSlug({ id: 'glottolog:gane1238', name: '!Gã!ne' }), 'gane-gane1238');
  assert.equal(
    languageSlug({ id: 'el:15876f53-dff0-437e-8a2c-50a90c22e3f5', name: '!O!ung' }),
    'oung-el-15876f53'
  );
  assert.equal(languageSlug({ id: 'source-code:ABC_1', name: 'Test' }), 'test-source-code-abc-1');
  // A name with no Latin letters still gets a usable, unique slug.
  assert.equal(languageSlug({ id: 'iso:ell', name: 'Ελληνικά' }), 'ell');
});

test('slugs survive a round trip through the URL and validation', () => {
  for (const slug of ['yoruba-yor', 'oung-el-15876f53', 'ell']) {
    assert.equal(isLanguageSlug(slug), true);
    assert.equal(languagePagePath(slug), `/languages/${slug}`);
    assert.equal(encodeURIComponent(slug), slug);
  }
  for (const value of ['', 'Yoruba', '../index', 'a--b', '-a', 'a-', 'a b', 'x'.repeat(121)]) {
    assert.equal(isLanguageSlug(value), false, value);
  }
});

test('shards are deterministic, in range and spread slugs across files', () => {
  assert.equal(languageShard('yoruba-yor', 64), languageShard('yoruba-yor', 64));
  const counts = new Array(16).fill(0);
  for (let index = 0; index < 1600; index++) {
    const shard = languageShard(`language-${index}`, 16);
    assert.ok(Number.isInteger(shard) && shard >= 0 && shard < 16);
    counts[shard]++;
  }
  assert.ok(Math.min(...counts) > 50, `uneven shards: ${counts.join(',')}`);
});

const elOnly = (name: string) => ({
  name,
  sourceIds: ['everylanguage'],
  iso6393: null,
  glottocode: null,
  rolvCode: null,
});

test('placeholder and test records from the project tracker get no language page', () => {
  for (const name of [
    'Test 6a',
    'test 2',
    'test7',
    'TESTY bislama',
    'Test language 簡化字',
    'Test ROLV',
    'Loma: Bunde {Delete}',
    'MISTAKES',
    'Needs Verification',
    'Pray 3',
    'Southern Betsimisaraka Malagasy (retired)',
  ]) {
    assert.equal(hasLanguagePage(elOnly(name)), false, name);
  }
  // Real languages, including ones that start with "Test" or have no codes.
  for (const name of ['Tip', 'Teste', 'Testo', 'Tesaka', 'Yoruba']) {
    assert.equal(hasLanguagePage(elOnly(name)), true, name);
  }
  // A registry-backed record is never treated as a placeholder.
  assert.equal(hasLanguagePage({ ...elOnly('Test 5'), iso6393: 'tst' }), true);
  assert.equal(hasLanguagePage({ ...elOnly('Test 5'), sourceIds: ['glottolog'] }), true);
});
