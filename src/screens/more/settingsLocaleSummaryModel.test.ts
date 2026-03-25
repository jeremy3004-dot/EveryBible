import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocaleSummary, type LocaleSummaryInput } from './settingsLocaleSummaryModel';

const noopResolve = () => '';

const baseInput: LocaleSummaryInput = {
  countryCode: null,
  countryName: null,
  contentLanguageNativeName: null,
  currentLanguage: 'en',
  resolveCountryDisplayName: noopResolve,
  fallbackLabel: 'Not set',
};

test('shows the localized country name combined with the content language when both are available', () => {
  assert.equal(
    resolveLocaleSummary({
      ...baseInput,
      countryCode: 'NP',
      contentLanguageNativeName: 'नेपाली',
      resolveCountryDisplayName: (code) => (code === 'NP' ? 'Nepal' : ''),
    }),
    'Nepal • नेपाली'
  );
});

test('uses the stored country name when no country code is available', () => {
  assert.equal(
    resolveLocaleSummary({
      ...baseInput,
      countryName: 'India',
      contentLanguageNativeName: 'हिन्दी',
    }),
    'India • हिन्दी'
  );
});

test('shows only the country when content language has not been selected', () => {
  assert.equal(
    resolveLocaleSummary({
      ...baseInput,
      countryCode: 'DE',
      resolveCountryDisplayName: (_code, lang) => (lang === 'es' ? 'Alemania' : 'Germany'),
      currentLanguage: 'es',
    }),
    'Alemania'
  );
});

test('shows only the content language when no country is available', () => {
  assert.equal(
    resolveLocaleSummary({
      ...baseInput,
      contentLanguageNativeName: 'Español',
    }),
    'Español'
  );
});

test('falls back to the provided label when nothing is configured', () => {
  assert.equal(resolveLocaleSummary(baseInput), 'Not set');
});

test('prefers the localized country name over the stored country name', () => {
  assert.equal(
    resolveLocaleSummary({
      ...baseInput,
      countryCode: 'GB',
      countryName: 'United Kingdom',
      contentLanguageNativeName: 'English',
      resolveCountryDisplayName: (_code, lang) =>
        lang === 'es' ? 'Reino Unido' : 'United Kingdom',
      currentLanguage: 'es',
    }),
    'Reino Unido • English'
  );
});
