import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockReactNative, sourcePath } from '../../../testing/mockModules';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';

// Full-text search: a translation with no text (audio-only) has nothing to search, so it says
// so instead of querying the bundled database and reporting "No results".
const runtime = createReactHookRuntime();
mockModule(mock, 'react', {
  ...runtime.react,
  useDeferredValue: <T>(value: T): T => value,
});
mockReactNative(mock, { os: 'ios' });

const searches: Array<{ translationId: string; query: string }> = [];
mockModule(mock, sourcePath('services/bible/bibleService.ts'), {
  searchBible: async (translationId: string, query: string) => {
    searches.push({ translationId, query });
    return [];
  },
});

const t = ((key: string) => key) as unknown as import('i18next').TFunction;
const debounce = () => new Promise((resolve) => setTimeout(resolve, 400));

async function mountSearch(translationId: string, hasText?: boolean) {
  const { useBibleSearch } = await import('./useBibleSearch');
  const view = runtime.mount(useBibleSearch, translationId, 'English', t, hasText);
  await view.commit();
  return view;
}

beforeEach(() => {
  searches.length = 0;
});
afterEach(() => runtime.unmountAll());

test('searching an audio-only translation reports search as unavailable without querying', async () => {
  const view = await mountSearch('audio-only', false);
  view.result.setSearchQuery('shepherd');
  view.rerender();
  await view.commit();
  await debounce();
  view.rerender();

  assert.deepEqual(searches, []);
  assert.equal(view.result.searchError, 'bible.searchUnavailable');
  assert.equal(view.result.hasNoResults, false);
  assert.equal(view.result.isSearching, false);
});

test('a translation with text still runs the full-text search', async () => {
  const view = await mountSearch('bsb', true);
  view.result.setSearchQuery('shepherd');
  view.rerender();
  await view.commit();
  await debounce();
  await view.commit();

  assert.deepEqual(searches, [{ translationId: 'bsb', query: 'shepherd' }]);
  assert.equal(view.result.searchError, null);
});
