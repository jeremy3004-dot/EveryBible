import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDeviceLanguageCode, resolveDeviceInterfaceLanguage } from './deviceLanguage';

// Shapes are what expo-localization's getLocales() returns. On Android, languageCode comes
// from java.util.Locale#getLanguage(), which still reports the withdrawn ISO 639 codes
// ("in" for Indonesian, "iw" for Hebrew); languageTag comes from toLanguageTag() and uses
// the current ones.

test('an Android Indonesian device, which reports the legacy "in" code, gets the Indonesian interface', () => {
  assert.equal(
    resolveDeviceInterfaceLanguage([{ languageCode: 'in', languageTag: 'id-ID' }]),
    'id'
  );
});

test('the legacy code is mapped even when the language tag is missing', () => {
  assert.equal(resolveDeviceInterfaceLanguage([{ languageCode: 'in', languageTag: null }]), 'id');
});

test('regional and script variants resolve to their base interface language', () => {
  assert.equal(
    resolveDeviceInterfaceLanguage([{ languageCode: 'pt', languageTag: 'pt-BR' }]),
    'pt'
  );
  assert.equal(
    resolveDeviceInterfaceLanguage([{ languageCode: 'es', languageTag: 'es-419' }]),
    'es'
  );
  assert.equal(
    resolveDeviceInterfaceLanguage([{ languageCode: 'zh', languageTag: 'zh-Hant-TW' }]),
    'zh'
  );
});

test('an unsupported first language falls through to the next preferred device language', () => {
  assert.equal(
    resolveDeviceInterfaceLanguage([
      { languageCode: 'sw', languageTag: 'sw-KE' },
      { languageCode: 'fr', languageTag: 'fr-FR' },
    ]),
    'fr'
  );
});

test('a device with no supported language resolves to nothing, leaving the caller to default', () => {
  assert.equal(
    resolveDeviceInterfaceLanguage([
      { languageCode: 'sr', languageTag: 'sr-Latn-RS' },
      { languageCode: 'he', languageTag: 'he-IL' },
    ]),
    null
  );
  assert.equal(resolveDeviceInterfaceLanguage([]), null);
});

test('the language code is case-insensitive and falls back to the tag when absent', () => {
  assert.equal(
    resolveDeviceInterfaceLanguage([{ languageCode: 'DE', languageTag: 'DE-de' }]),
    'de'
  );
  assert.equal(
    resolveDeviceInterfaceLanguage([{ languageCode: null, languageTag: 'ko-KR' }]),
    'ko'
  );
});

test('normalizeDeviceLanguageCode returns the current ISO code for any device language, supported or not', () => {
  assert.equal(normalizeDeviceLanguageCode({ languageCode: 'in', languageTag: 'id-ID' }), 'id');
  assert.equal(normalizeDeviceLanguageCode({ languageCode: 'iw', languageTag: null }), 'he');
  assert.equal(normalizeDeviceLanguageCode({ languageCode: 'sw', languageTag: 'sw-KE' }), 'sw');
  assert.equal(normalizeDeviceLanguageCode(undefined), null);
});
