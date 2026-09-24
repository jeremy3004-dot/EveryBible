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

// The reader calls useFontSize, so a theme or reminder write re-rendered the chapter.
test('useFontSize does not re-render when an unrelated preference changes', async () => {
  const { useFontSize } = await import('./useFontSize');
  const renders = await renderCounting(useFontSize);
  const before = renders.count;

  await setPreferences({ theme: 'dark' });
  await setPreferences({ language: 'fr' });
  await setPreferences({ notificationsEnabled: true, reminderTime: '07:30' });

  assert.equal(renders.count, before);
});

test('useFontSize re-renders with the new size when the font size preference changes', async () => {
  const { useFontSize } = await import('./useFontSize');
  const renders = await renderCounting(useFontSize);
  const before = renders.count;

  await setPreferences({ fontSize: 'large' });

  assert.ok(renders.count > before);
  assert.equal((renders.latest as { fontSize: string }).fontSize, 'large');
});

// ThemeProvider sits at the app root; it recomputes only when the theme or palette changes.
test('the theme provider value does not recompute when an unrelated preference changes', async () => {
  const { useThemeContextValue } = await import('../contexts/ThemeContext');
  const renders = await renderCounting(useThemeContextValue);
  const before = renders.count;

  await setPreferences({ fontSize: 'large' });
  await setPreferences({ language: 'fr' });
  await setPreferences({ onboardingCompleted: false });

  assert.equal(renders.count, before);
});

test('the theme provider value follows theme and palette changes', async () => {
  const { useThemeContextValue } = await import('../contexts/ThemeContext');
  const renders = await renderCounting(useThemeContextValue);

  await setPreferences({ theme: 'dark' });
  assert.equal((renders.latest as { isDark: boolean }).isDark, true);

  const before = renders.count;
  await setPreferences({ appearancePalette: 'el-blue-brand' });
  assert.ok(renders.count > before);
  assert.equal(
    (renders.latest as { appearancePalette: string }).appearancePalette,
    'el-blue-brand'
  );
});
