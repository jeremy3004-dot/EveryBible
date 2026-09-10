import test, { afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';
import type { UserPreferences } from '../types';
import type { useFontSize as UseFontSize } from './useFontSize';

// ---------------------------------------------------------------------------
// Mocks. There is no renderer here, so `react` is the shared hook runtime and
// every `renderFontSize()` is one render pass reading the current auth state.
// ---------------------------------------------------------------------------

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

// react-i18next resolves to a different file for `import` (dist/es) than for
// the `require` tsx emits for these CJS-compiled sources (dist/commonjs), so the
// bare specifier alone would not intercept it. Mock the CJS entry by path.
const requireFrom = createRequire(import.meta.url);
const translated: Array<string> = [];
mockModule(mock, requireFrom.resolve('react-i18next'), {
  useTranslation: () => ({
    t: (key: string) => {
      translated.push(key);
      return `t:${key}`;
    },
  }),
});

const preferenceWrites: Array<Partial<UserPreferences>> = [];
const authState: {
  preferences: Pick<UserPreferences, 'fontSize'>;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
} = {
  preferences: { fontSize: 'medium' },
  setPreferences: (prefs) => {
    preferenceWrites.push(prefs);
    if (prefs.fontSize) {
      authState.preferences = { ...authState.preferences, fontSize: prefs.fontSize };
    }
  },
};
const useAuthStore = Object.assign(
  <T>(selector: (state: typeof authState) => T): T => selector(authState),
  { getState: () => authState }
);
mockModule(mock, sourcePath('stores/authStore.ts'), { useAuthStore });

let syncPreferenceCalls = 0;
let syncPreferencesResult: () => Promise<unknown> = async () => ({ success: true });
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncPreferences: () => {
    syncPreferenceCalls += 1;
    return syncPreferencesResult();
  },
});

let useFontSize: typeof UseFontSize;

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** One render pass of the hook, as a screen mounting it would do. */
const renderFontSize = () => runtime.mount(useFontSize).result;

before(async () => {
  ({ useFontSize } = await import('./useFontSize'));
});

afterEach(() => {
  runtime.unmountAll();
});

beforeEach(() => {
  authState.preferences = { fontSize: 'medium' };
  preferenceWrites.length = 0;
  translated.length = 0;
  syncPreferenceCalls = 0;
  syncPreferencesResult = async () => ({ success: true });
});

test('the medium preference reads back an unscaled font scale and its own label', () => {
  const fontSize = renderFontSize();

  assert.equal(fontSize.fontSize, 'medium');
  assert.equal(fontSize.scale, 1);
  assert.equal(fontSize.label, 't:settings.fontSizeMedium');
  assert.deepEqual(translated, ['settings.fontSizeMedium']);
});

test('the small preference shrinks the scale and picks the small label', () => {
  authState.preferences = { fontSize: 'small' };

  const fontSize = renderFontSize();

  assert.equal(fontSize.scale, 0.85);
  assert.equal(fontSize.label, 't:settings.fontSizeSmall');
});

test('the large preference grows the scale and picks the large label', () => {
  authState.preferences = { fontSize: 'large' };

  const fontSize = renderFontSize();

  assert.equal(fontSize.scale, 1.2);
  assert.equal(fontSize.label, 't:settings.fontSizeLarge');
});

test('scaleValue rounds the scaled size to a whole point value', () => {
  authState.preferences = { fontSize: 'small' };

  const { scaleValue } = renderFontSize();

  assert.equal(scaleValue(17), 14);
  assert.equal(scaleValue(20), 17);
  assert.equal(scaleValue(0), 0);
});

test('increasing from medium moves one step up and pushes the preference to the cloud', () => {
  renderFontSize().increase();

  assert.deepEqual(preferenceWrites, [{ fontSize: 'large' }]);
  assert.equal(syncPreferenceCalls, 1);
});

test('increasing from small moves to medium rather than skipping a step', () => {
  authState.preferences = { fontSize: 'small' };

  renderFontSize().increase();

  assert.deepEqual(preferenceWrites, [{ fontSize: 'medium' }]);
});

test('increasing at the largest size changes nothing and does not sync', () => {
  authState.preferences = { fontSize: 'large' };

  renderFontSize().increase();

  assert.deepEqual(preferenceWrites, []);
  assert.equal(syncPreferenceCalls, 0);
});

test('decreasing from medium moves one step down and pushes the preference to the cloud', () => {
  renderFontSize().decrease();

  assert.deepEqual(preferenceWrites, [{ fontSize: 'small' }]);
  assert.equal(syncPreferenceCalls, 1);
});

test('decreasing at the smallest size changes nothing and does not sync', () => {
  authState.preferences = { fontSize: 'small' };

  renderFontSize().decrease();

  assert.deepEqual(preferenceWrites, []);
  assert.equal(syncPreferenceCalls, 0);
});

test('setting a size directly stores it and pushes it to the cloud', () => {
  renderFontSize().setSize('large');

  assert.deepEqual(preferenceWrites, [{ fontSize: 'large' }]);
  assert.equal(syncPreferenceCalls, 1);
});

test('setting the size already in use still writes and syncs, so a stale cloud row is corrected', () => {
  renderFontSize().setSize('medium');

  assert.deepEqual(preferenceWrites, [{ fontSize: 'medium' }]);
  assert.equal(syncPreferenceCalls, 1);
});

test('the medium size can be adjusted in both directions', () => {
  const fontSize = renderFontSize();

  assert.equal(fontSize.canIncrease, true);
  assert.equal(fontSize.canDecrease, true);
});

test('the largest size can only be decreased', () => {
  authState.preferences = { fontSize: 'large' };

  const fontSize = renderFontSize();

  assert.equal(fontSize.canIncrease, false);
  assert.equal(fontSize.canDecrease, true);
});

test('the smallest size can only be increased', () => {
  authState.preferences = { fontSize: 'small' };

  const fontSize = renderFontSize();

  assert.equal(fontSize.canIncrease, true);
  assert.equal(fontSize.canDecrease, false);
});

test('a failing preference sync never surfaces as an unhandled rejection', async () => {
  syncPreferencesResult = async () => {
    throw new Error('offline');
  };

  assert.doesNotThrow(() => renderFontSize().setSize('large'));
  await flush();

  assert.deepEqual(preferenceWrites, [{ fontSize: 'large' }]);
});

test('a later render reflects the size the previous one stored', () => {
  renderFontSize().increase();

  assert.equal(renderFontSize().fontSize, 'large');
  assert.equal(renderFontSize().scale, 1.2);
});
