import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { mockModule, sourcePath } from '../testing/mockModules';

/**
 * readerThemePreviews reads its colours from the real theme palettes in
 * ThemeContext. ThemeContext also imports authStore purely for the provider
 * component, which drags the Supabase and expo auth stack into Node — stubbing
 * that one module is enough to load the real palettes.
 */
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: () => undefined,
});

const HEX = /^#[0-9A-Fa-f]{6}$/;

const load = async () => {
  const previews = (await import('./readerThemePreviews')).readerThemePreviews;
  const theme = await import('../contexts/ThemeContext');
  const themeMode = await import('./themeMode');
  const en = (await import('../i18n/locales/en')).en;
  return { previews, theme, themeMode, en };
};

const lookupTranslation = (en: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    );

test('the appearance rail offers exactly the theme modes the app still ships', async () => {
  const { previews, themeMode } = await load();
  assert.deepEqual(
    previews.map((preview) => preview.mode),
    ['light', 'dark'],
    'the rail is vellum first, then Field dark'
  );
  assert.deepEqual(
    [...previews.map((preview) => preview.mode)].sort(),
    [...themeMode.THEME_MODES].sort()
  );
});

test('no theme mode is offered twice', async () => {
  const { previews } = await load();
  const modes = previews.map((preview) => preview.mode);
  assert.deepEqual(modes, [...new Set(modes)]);
});

test('the light tile is drawn from the real vellum palette', async () => {
  const { previews, theme } = await load();
  const light = previews.find((preview) => preview.mode === 'light');
  assert.ok(light);
  assert.deepEqual(light.background, [
    theme.lightColors.bibleElevatedSurface,
    theme.lightColors.bibleBackground,
  ]);
  assert.equal(light.paper, theme.lightColors.bibleSurface);
  assert.equal(light.line, theme.lightColors.biblePrimaryText);
});

test('the dark tile is drawn from the real Field dark palette', async () => {
  const { previews, theme } = await load();
  const dark = previews.find((preview) => preview.mode === 'dark');
  assert.ok(dark);
  assert.deepEqual(dark.background, [
    theme.darkColors.bibleElevatedSurface,
    theme.darkColors.bibleBackground,
  ]);
  assert.equal(dark.paper, theme.darkColors.bibleSurface);
  assert.equal(dark.line, theme.darkColors.biblePrimaryText);
});

test('every preview colour is a six-digit hex, as the tile renderer assumes', async () => {
  const { previews } = await load();
  for (const preview of previews) {
    for (const colour of [...preview.background, preview.paper, preview.line]) {
      assert.match(colour, HEX, `${preview.mode} tile has a non-hex colour ${colour}`);
    }
  }
});

test('each tile has visible contrast between its ink and its paper', async () => {
  const { previews } = await load();
  for (const preview of previews) {
    assert.notEqual(preview.line, preview.paper, `${preview.mode} ink matches its paper`);
    assert.notEqual(
      preview.background[0],
      preview.background[1],
      `${preview.mode} wash has no gradient`
    );
  }
});

test('every tile label resolves to an English string', async () => {
  const { previews, en } = await load();
  for (const preview of previews) {
    assert.equal(
      typeof lookupTranslation(en, preview.labelKey),
      'string',
      `missing English translation for ${preview.labelKey}`
    );
  }
});

test('tapping a tile can only select a mode the theme resolver keeps', async () => {
  const { previews, themeMode } = await load();
  for (const preview of previews) {
    assert.equal(themeMode.resolveThemeMode(preview.mode), preview.mode);
    assert.ok(themeMode.isThemeMode(preview.mode));
  }
});
