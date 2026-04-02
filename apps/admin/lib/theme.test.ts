import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMIN_THEME_STORAGE_KEY, getAdminThemeScript, normalizeAdminTheme } from './theme';

test('normalizeAdminTheme defaults to light', () => {
  assert.equal(normalizeAdminTheme(undefined), 'light');
  assert.equal(normalizeAdminTheme(null), 'light');
  assert.equal(normalizeAdminTheme('unexpected'), 'light');
});

test('normalizeAdminTheme preserves light mode', () => {
  assert.equal(normalizeAdminTheme('light'), 'light');
});

test('getAdminThemeScript bootstraps the storage key and light default', () => {
  const script = getAdminThemeScript();

  assert.match(script, new RegExp(ADMIN_THEME_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(script, /theme='light'/);
  assert.match(script, /dataset\.theme=theme/);
});
