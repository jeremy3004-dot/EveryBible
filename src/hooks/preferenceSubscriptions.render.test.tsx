import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockModule, sourcePath } from '../testing/mockModules';
import { installRenderHarness } from '../testing/render';

// Hooks that almost every screen calls must subscribe to the preference fields
// they read, not the whole preferences object: a font-size, theme, reminder or
// onboarding write would otherwise re-render every mounted screen that uses them.

const harness = installRenderHarness(mock);

const appliedLanguages: string[] = [];
mockModule(mock, sourcePath('i18n/index.ts'), {
  changeLanguage: async (language: string) => {
    appliedLanguages.push(language);
  },
  getCurrentLanguage: () => 'en',
});
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncPreferences: async () => ({ success: true }),
});

async function setPreferences(patch: Record<string, unknown>) {
  await act(async () => {
    harness.authStore.getState().setPreferences(patch);
  });
}

/** Renders a probe that calls `useHook` and counts its renders. */
async function renderCounting(useHook: () => unknown) {
  const renders = { count: 0, latest: undefined as unknown };
  const record = (value: unknown) => {
    renders.count += 1;
    renders.latest = value;
  };
  function Probe() {
    record(useHook());
    return null;
  }
  await harness.render(<Probe />);
  return renders;
}

test('useI18n does not re-render its screen when an unrelated preference changes', async () => {
  const { useI18n } = await import('./useI18n');
  const renders = await renderCounting(useI18n);
  const before = renders.count;

  await setPreferences({ fontSize: 'large' });
  await setPreferences({ theme: 'dark' });
  await setPreferences({ notificationsEnabled: true, reminderTime: '07:30' });

  assert.equal(renders.count, before);
});

test('useI18n re-renders with the new language when the language preference changes', async () => {
  const { useI18n } = await import('./useI18n');
  const renders = await renderCounting(useI18n);
  const before = renders.count;

  await setPreferences({ language: 'es' });

  assert.ok(renders.count > before);
  assert.equal((renders.latest as { currentLanguage: string }).currentLanguage, 'es');
  assert.deepEqual(appliedLanguages, ['es']);
});
