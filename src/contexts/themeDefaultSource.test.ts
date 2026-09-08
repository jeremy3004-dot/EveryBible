import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THEME_MODE } from '../design/themeMode';

test('new installs default to vellum, the canonical EL scope', () => {
  assert.equal(
    DEFAULT_THEME_MODE,
    'light',
    'the EL redesign makes warm paper the front door; Field dark is opt-in'
  );
});

test('the persisted default theme is the resolver default, not a second copy', () => {
  // These two drifting apart is exactly how a "default theme" change fails to
  // reach new installs: the resolver says vellum while the preferences object
  // that new users actually get still says dark.
  const source = readFileSync(
    fileURLToPath(new URL('../stores/persistedStateSanitizers.ts', import.meta.url).href),
    'utf8'
  );

  assert.match(
    source,
    /defaultAuthPreferences[\s\S]*theme:\s*DEFAULT_THEME_MODE/,
    'defaultAuthPreferences should reference DEFAULT_THEME_MODE rather than hardcoding a mode'
  );
});
