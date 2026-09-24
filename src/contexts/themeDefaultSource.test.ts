import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME_MODE, resolveThemeMode } from '../design/themeMode';
import {
  defaultAuthPreferences,
  sanitizeUserPreferences,
} from '../stores/persistedStateSanitizers';

test('new installs default to vellum, the canonical EL scope', () => {
  assert.equal(
    DEFAULT_THEME_MODE,
    'light',
    'the EL redesign makes warm paper the front door; Field dark is opt-in'
  );
});

test('the preferences a new install gets carry the resolver default theme', () => {
  // These two drifting apart is exactly how a "default theme" change fails to
  // reach new installs: the resolver says vellum while the preferences object
  // that new users actually get still says dark.
  assert.equal(defaultAuthPreferences.theme, DEFAULT_THEME_MODE);
  assert.equal(sanitizeUserPreferences(undefined).theme, DEFAULT_THEME_MODE);
  assert.equal(resolveThemeMode(undefined), defaultAuthPreferences.theme);
});
