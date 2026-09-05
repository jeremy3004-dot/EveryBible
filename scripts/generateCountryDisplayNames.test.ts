import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORTED_LANGUAGES } from '../src/constants/languages';
import catalog from '../src/data/localeCatalog.json';
import saved from '../src/data/countryDisplayNames.generated.json';
import { generateCountryDisplayNames } from './generate-country-display-names';

test('offline country labels cover every catalog country in every supported interface locale', () => {
  assert.deepEqual(
    Object.keys(saved.names).sort(),
    SUPPORTED_LANGUAGES.map(({ code }) => code).sort()
  );
  const countries = catalog.countries.map(({ code }) => code).sort();
  for (const [locale, names] of Object.entries(saved.names)) {
    assert.deepEqual(Object.keys(names).sort(), countries, locale);
    for (const [country, label] of Object.entries(names)) {
      assert.ok(label.trim() && label !== country, `${locale}.${country} must have a country name`);
      assert.doesNotMatch(label, /\uFFFD|\u200B/, `${locale}.${country}`);
    }
  }
  assert.equal(saved.metadata.resolvedLocales.zh, 'zh-Hans');
  assert.equal(saved.metadata.resolvedLocales.pa, 'pa-Guru');
  for (const field of ['node', 'icu', 'cldr', 'unicode'] as const) {
    assert.ok(saved.metadata[field], `Generation provenance must include ${field}`);
  }
});

test('country name generation is deterministic and uses the requested CLDR scripts', () => {
  const generated = generateCountryDisplayNames();
  assert.deepEqual(generateCountryDisplayNames(), generated);
  assert.equal(generated.names.fr.US, 'États-Unis');
  assert.equal(generated.names.zh.US, '美国');
  assert.match(generated.names.pa.US, /ਸੰਯੁਕਤ ਰਾਜ/);
  assert.equal(generated.metadata.resolvedLocales.pa, 'pa-Guru');
  assert.equal(generated.metadata.resolvedLocales.zh, 'zh-Hans');
  assert.deepEqual(Object.keys(generated.names), Object.keys(saved.names));
  for (const [locale, names] of Object.entries(generated.names)) {
    assert.deepEqual(
      Object.keys(names),
      Object.keys(saved.names[locale as keyof typeof saved.names])
    );
  }
});
