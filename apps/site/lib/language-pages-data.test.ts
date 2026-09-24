import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { getLanguageIndex, getLanguagePage, getLanguagePagesMeta } from './language-pages-data';
import { shouldPrerenderLanguage } from './language-pages';

const root = fileURLToPath(new URL('..', import.meta.url));

test('a language page is read from its shard by slug', async () => {
  const page = await getLanguagePage('yoruba-yor', root);
  assert.equal(page?.name, 'Yoruba');
  assert.equal(page?.status, 'bible');
  assert.ok(page?.countries.some((country) => country.name === 'Nigeria'));
  // Nepali's reference location names Nepal, so it is listed first.
  assert.equal(
    (await getLanguagePage('nepali-individual-language-npi', root))?.countries[0].name,
    'Nepal'
  );
});

test('unknown, malformed and prototype slugs are not found', async () => {
  for (const slug of ['not-a-language-zzz', '../meta', 'Yoruba-YOR', 'constructor', '__proto__']) {
    assert.equal(await getLanguagePage(slug, root), null, slug);
  }
});

test('the index lists every language, and the prerendered subset stays small', async () => {
  const [meta, index] = await Promise.all([getLanguagePagesMeta(root), getLanguageIndex(root)]);
  assert.equal(index.length, meta.languageCount);
  const prerendered = index.filter(shouldPrerenderLanguage).length;
  assert.ok(prerendered > 800 && prerendered < 3500, `${prerendered} prerendered pages`);
});
