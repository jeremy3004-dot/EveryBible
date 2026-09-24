// Hermes has no JIT, and collating text there (localeCompare builds ICU state per call) is
// slow. The Bible language list must build one collator on first use, not when the onboarding
// module is evaluated, and reuse it after that.
import test from 'node:test';
import assert from 'node:assert/strict';

const RealCollator = Intl.Collator;
let collatorsBuilt = 0;
const countingCollator = function (...args: ConstructorParameters<typeof Intl.Collator>) {
  collatorsBuilt += 1;
  return new RealCollator(...args);
};
Object.defineProperty(Intl, 'Collator', {
  value: countingCollator,
  configurable: true,
  writable: true,
});

const translations = [
  { id: 'npiulb', name: 'Nepali Bible', language: 'Nepali' },
  { id: 'web', name: 'World English Bible', language: 'English' },
  { id: 'bsb', name: 'Berean Standard Bible', language: 'English' },
  { id: 'ewo', name: 'Bible Éwondo', language: 'Éwondo' },
];

test('the Bible language list builds its collator lazily and once, and never calls localeCompare', async (t) => {
  const { buildInitialOnboardingLanguageOptions } = await import('./localeSetupModel');
  assert.equal(collatorsBuilt, 0, 'importing the module must not build a collator');

  const localeCompare = t.mock.method(String.prototype, 'localeCompare');
  const first = buildInitialOnboardingLanguageOptions(translations);
  const second = buildInitialOnboardingLanguageOptions(translations);

  assert.equal(collatorsBuilt, 1);
  assert.equal(localeCompare.mock.callCount(), 0);
  assert.deepEqual(
    first.map((option) => option.label),
    ['English', 'Éwondo', 'Nepali / नेपाली']
  );
  assert.deepEqual(
    first.map((option) => option.translations.map((translation) => translation.id)),
    [['bsb', 'web'], ['ewo'], ['npiulb']]
  );
  assert.deepEqual(describe(second), describe(first));
});

function describe(options: Array<{ label: string; primaryTranslation: { id: string } }>) {
  return options.map((option) => `${option.label}:${option.primaryTranslation.id}`);
}
