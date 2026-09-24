import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import localeCatalog from '../../data/localeCatalog.json';

// The shared engine is a module-level singleton, so it gets its own file: the
// first access here is the one that builds it. __DEV__ is read when it builds.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

test('the shared engine is built once, on first use, and logs its init timing in development', async () => {
  const log = mock.method(console, 'log', () => {});
  const { prewarmLocaleSearchEngine, localeSearchEngine } = await import('./localeSelection');

  assert.equal(log.mock.callCount(), 0, 'importing the module must not build the engine');

  prewarmLocaleSearchEngine();
  prewarmLocaleSearchEngine();
  void localeSearchEngine.countries;
  log.mock.restore();

  assert.deepEqual(
    log.mock.calls.map((call) => call.arguments[0]),
    ['[EB-T] locale:engine-init-start', '[EB-T] locale:engine-init-done']
  );
});

test('the shared engine answers every lookup from the bundled locale catalog', async () => {
  const { localeSearchEngine } = await import('./localeSelection');

  assert.equal(localeSearchEngine.countries.length, localeCatalog.countries.length);
  assert.equal(localeSearchEngine.languages.length, localeCatalog.languages.length);
  assert.equal(localeSearchEngine.getCountryByCode('us')?.code, 'US');
  assert.equal(localeSearchEngine.getCountryDisplayName('DE', 'es'), 'Alemania');
  assert.equal(localeSearchEngine.getLanguageByCode('eng')?.code, 'en');
  assert.equal(localeSearchEngine.getLanguageByName('english')?.code, 'en');
  assert.equal(localeSearchEngine.searchCountries('nepal')[0]?.code, 'NP');
  assert.deepEqual(
    localeSearchEngine.getRecommendedLanguages('US').map((language) => language.code),
    ['en']
  );
  assert.equal(localeSearchEngine.searchLanguages('English', 'US').recommended[0]?.code, 'en');
  assert.equal(
    localeSearchEngine.mapLanguageToAppLanguage(localeSearchEngine.getLanguageByCode('es')),
    'es'
  );
});

test('the shared engine returns the same cached instances on every access', async () => {
  const { localeSearchEngine } = await import('./localeSelection');

  assert.equal(localeSearchEngine.countries, localeSearchEngine.countries);
  assert.equal(localeSearchEngine.languages, localeSearchEngine.languages);
});
