import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialOnboardingLanguageOptions, getLocaleSetupSteps } from './localeSetupModel';

test('initial onboarding asks for interface language before Bible language', () => {
  assert.deepEqual(getLocaleSetupSteps('initial'), ['interfaceLanguage', 'translation']);
});

test('settings locale flow stays focused on nation and Bible language', () => {
  assert.deepEqual(getLocaleSetupSteps('settings'), ['country', 'contentLanguage']);
});

test('initial onboarding groups Bible languages alphabetically', () => {
  const options = buildInitialOnboardingLanguageOptions([
    { id: 'npiulb', name: 'Nepali Bible', abbreviation: 'NPB', language: 'Nepali' },
    { id: 'hincv', name: 'Hindi Contemporary Version', abbreviation: 'HCV', language: 'Hindi' },
    { id: 'bsb', name: 'Berean Standard Bible', abbreviation: 'BSB', language: 'English' },
  ]);

  assert.deepEqual(
    options.map((option) => option.groupLabel),
    ['E', 'H', 'N']
  );
  assert.deepEqual(
    options.map((option) => option.label),
    ['English', 'Hindi / हिन्दी', 'Nepali / नेपाली']
  );
});

test('initial onboarding maps English to BSB when multiple English Bibles exist', () => {
  const [englishOption] = buildInitialOnboardingLanguageOptions([
    {
      id: 'asv',
      name: 'American Standard Version',
      abbreviation: 'ASV',
      language: 'English',
      isDownloaded: true,
      hasText: true,
    },
    {
      id: 'bsb',
      name: 'Berean Standard Bible',
      abbreviation: 'BSB',
      language: 'English',
      isDownloaded: true,
      hasText: true,
      hasAudio: true,
    },
  ]);

  assert.equal(englishOption?.primaryTranslation.id, 'bsb');
});
