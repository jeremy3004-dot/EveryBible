import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

// There is no renderer under node --test, so `react` is the shared hook runtime
// and `react-i18next` a stub whose language this file drives. `design/fonts`
// imports react-native for its Platform.select serif fallback, so the RN stub
// has to be installed too.
mockReactNative(mock, { os: 'ios' });

const requireFromHere = createRequire(import.meta.url);

/**
 * react-i18next ships separate `import` and `require` entry points, and this
 * repo compiles .ts to CJS (no `"type": "module"`), so the specifier a mock is
 * keyed on and the file the code under test actually loads can differ. Mocking
 * the bare specifier and the resolved CJS path covers both.
 */
function mockDualEntryPackage(specifier: string, exports: Record<string, unknown>): void {
  mockModule(mock, specifier, exports);
  const resolved = requireFromHere.resolve(specifier);
  if (resolved !== specifier) {
    mockModule(mock, resolved, exports);
  }
}

let activeLanguage = 'en';
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

afterEach(() => {
  runtime.unmountAll();
});
mockDualEntryPackage('react-i18next', {
  useTranslation: () => ({ i18n: { language: activeLanguage } }),
});

const BOLD = 'AlteHaasGrotesk-Bold';
const REGULAR = 'AlteHaasGrotesk-Regular';
const FALLBACK = { fontFamily: undefined, letterSpacing: 0, lineHeight: undefined };

const displayFontFor = async (language: string) => {
  activeLanguage = language;
  const { useDisplayFont } = await import('./useDisplayFont');
  return runtime.mount(useDisplayFont).result;
};

test('English gets the Alte Haas display faces at both weights', async () => {
  const font = await displayFontFor('en');

  assert.deepEqual(font, {
    bold: { fontFamily: BOLD },
    regular: { fontFamily: REGULAR },
    isFallback: false,
  });
});

test('a Latin-script language other than English still gets Alte Haas', async () => {
  const font = await displayFontFor('es');

  assert.equal(font.isFallback, false);
  assert.deepEqual(font.bold, { fontFamily: BOLD });
});

test('a regional Latin locale resolves through its base language', async () => {
  const font = await displayFontFor('pt-BR');

  assert.equal(font.isFallback, false);
  assert.deepEqual(font.regular, { fontFamily: REGULAR });
});

test('Devanagari clears the family, tracking and line height so the platform font renders', async () => {
  const font = await displayFontFor('hi');

  assert.deepEqual(font, { bold: FALLBACK, regular: FALLBACK, isFallback: true });
});

test('Cyrillic falls back even though Lora covers it — the display face does not', async () => {
  const font = await displayFontFor('ru');

  assert.equal(font.isFallback, true);
  assert.deepEqual(font.bold, FALLBACK);
});

test('Vietnamese falls back because of its stacked precomposed diacritics', async () => {
  const font = await displayFontFor('vi');

  assert.equal(font.isFallback, true);
});

test('a CJK locale with a script subtag falls back through its base language', async () => {
  const font = await displayFontFor('zh-Hans');

  assert.equal(font.isFallback, true);
  assert.deepEqual(font.regular, FALLBACK);
});

test('an uppercase language tag is normalised before the coverage lookup', async () => {
  const font = await displayFontFor('AR');

  assert.equal(font.isFallback, true);
});

test('an empty language keeps the display face rather than falling back', async () => {
  const font = await displayFontFor('');

  assert.deepEqual(font, {
    bold: { fontFamily: BOLD },
    regular: { fontFamily: REGULAR },
    isFallback: false,
  });
});

test('an unknown language code is assumed to be Latin and keeps the display face', async () => {
  const font = await displayFontFor('xx-YZ');

  assert.equal(font.isFallback, false);
});

test('bold and regular share one fallback shape when the language falls back', async () => {
  const font = await displayFontFor('ta');

  // Both weights must clear the token's line height, not only the family: the EL
  // display tokens set leading below their font size and Tamil vowel signs clip.
  assert.equal(font.bold.lineHeight, undefined);
  assert.equal(font.regular.lineHeight, undefined);
  assert.equal(font.bold.letterSpacing, 0);
});

test('switching the interface language recomputes the overrides', async () => {
  const latin = await displayFontFor('fr');
  const nonLatin = await displayFontFor('ko');

  assert.equal(latin.isFallback, false);
  assert.equal(nonLatin.isFallback, true);
});
