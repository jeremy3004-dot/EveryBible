import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { create } from 'zustand';
import { installRenderHarness } from '../../testing/render';
import { mockModule, sourcePath } from '../../testing/mockModules';

const harness = installRenderHarness(mock);

// The shared refresh the screen must go through: resolved by the test, so the
// loading state can be observed before the catalog lands.
const refresh = { calls: 0, resolve: () => {} };
mockModule(mock, sourcePath('services/translations/runtimeCatalogRefresh.ts'), {
  refreshRuntimeCatalog: () => {
    refresh.calls += 1;
    return new Promise<void>((resolve) => {
      refresh.resolve = resolve;
    });
  },
});

// The shared picker renders as a host element carrying its props.
mockModule(mock, sourcePath('screens/bible/TranslationPickerList.tsx'), {
  TranslationPickerList: (props: Record<string, unknown>) =>
    createElement('TranslationPickerList', props),
});

// A Supabase-only catalog apply would wipe the additively applied Every Language
// rows. Record any attempt through the store or the catalog service.
const bypasses: string[] = [];
const useBibleStore = create(() => ({
  translations: [],
  applyRuntimeCatalog: () => {
    bypasses.push('applyRuntimeCatalog');
  },
}));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
mockModule(mock, sourcePath('services/translations/translationService.ts'), {
  listAvailableTranslations: async () => {
    bypasses.push('listAvailableTranslations');
    return { success: true, data: [] };
  },
});

const t = (key: string) => harness.i18n.t(key);

afterEach(() => {
  refresh.calls = 0;
  bypasses.length = 0;
});

async function renderBrowser() {
  const { TranslationBrowserScreen } = await import('./TranslationBrowserScreen');
  return harness.render(<TranslationBrowserScreen />);
}

async function finishRefresh(view: Awaited<ReturnType<typeof renderBrowser>>) {
  refresh.resolve();
  await view.flush();
}

test('the screen shows a spinner while the shared catalog refresh runs, then the shared picker', async () => {
  const view = await renderBrowser();

  assert.equal(refresh.calls, 1, 'the catalog is refreshed through the shared helper once');
  assert.equal(view.queryAllByType('ActivityIndicator').length, 1);
  assert.equal(view.queryAllByType('TranslationPickerList').length, 0);

  await finishRefresh(view);

  assert.equal(view.queryAllByType('ActivityIndicator').length, 0);
  assert.equal(view.queryAllByType('TranslationPickerList').length, 1);
  assert.ok(view.getByRole('header', { name: t('translations.title') }));
});

test('the screen is only the shared picker: no reading, comparison or audio preference rows', async () => {
  const view = await renderBrowser();
  await finishRefresh(view);

  for (const retired of [
    'settings.reading',
    'translations.secondary',
    'translations.audioPreference',
  ]) {
    assert.equal(view.queryByText(t(retired)), null, `${t(retired)} is not offered here`);
  }
  assert.deepEqual(
    view.getAllByRole('button').map((button) => button.props.accessibilityLabel),
    [t('common.back')],
    'the only control outside the picker is Back'
  );
});

test('activating a translation in the picker returns to the previous screen', async () => {
  const view = await renderBrowser();
  await finishRefresh(view);

  const [picker] = view.queryAllByType('TranslationPickerList');
  await view.fire(picker, 'onTranslationActivated', { id: 'bsb' });

  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('opening the screen never fetches or applies a Supabase-only catalog itself', async () => {
  const view = await renderBrowser();
  await finishRefresh(view);

  assert.deepEqual(bypasses, []);
  assert.equal(refresh.calls, 1);
});
