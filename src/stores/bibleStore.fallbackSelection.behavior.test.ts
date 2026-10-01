/**
 * When a Bible disappears and the store falls back to BSB, that fallback is not something the
 * reader chose. It must not keep the old choice's stamp (reconcilePrimaryTranslationPreference
 * would upload "bsb" as the account's primary with it) or the old translation's language.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';

const CHOSEN_AT = '2026-09-01T10:00:00.000Z';

mockMmkvStorage(mock);
const doubles = installBibleStoreDoubles(mock);

let useBibleStore: typeof import('./bibleStore').useBibleStore;
let defaultTranslations: () => import('../types').BibleTranslation[];
before(async () => {
  defaultTranslations = (await import('./persistedStateSanitizers')).getDefaultBibleTranslations;
  useBibleStore = (await import('./bibleStore')).useBibleStore;
  await flushAsyncWork();
});
beforeEach(async () => {
  await flushAsyncWork();
  doubles.reset();
  useBibleStore.setState(
    {
      ...useBibleStore.getInitialState(),
      translations: [
        ...defaultTranslations(),
        makeRuntimeTranslation({
          id: 'esv1',
          language: 'Spanish',
          isDownloaded: true,
          installState: 'installed',
          textPackLocalPath: 'file:///packs/esv1.db',
        }),
      ],
      currentTranslation: 'esv1',
      currentTranslationChosenAt: CHOSEN_AT,
      preferredTranslationLanguage: 'Spanish',
    },
    true
  );
});
after(() => mock.reset());

test('deleting the selected Bible falls back to BSB without keeping the old choice stamp', async () => {
  await useBibleStore.getState().deleteTranslation('esv1');

  const state = useBibleStore.getState();
  assert.equal(state.currentTranslation, 'bsb');
  assert.equal(state.currentTranslationChosenAt, null);
  assert.equal(state.preferredTranslationLanguage, 'English');
});

test('a missing pack fallback to BSB does not masquerade as a user choice', async () => {
  doubles.fileSystem.setFile('file:///packs/esv1.db', { exists: false, size: 0 });

  await useBibleStore.getState().reconcileTranslationPacks();

  const state = useBibleStore.getState();
  assert.equal(state.currentTranslation, 'bsb');
  assert.equal(state.currentTranslationChosenAt, null);
  assert.equal(state.preferredTranslationLanguage, 'English');
});

test('recovering a vanished pack mid-session clears the stamp too', async () => {
  await useBibleStore.getState().recoverMissingInstalledPack('esv1');

  const state = useBibleStore.getState();
  assert.equal(state.currentTranslation, 'bsb');
  assert.equal(state.currentTranslationChosenAt, null);
});

test('deleting a Bible that is not selected leaves the choice and its stamp alone', async () => {
  useBibleStore.setState({ currentTranslation: 'bsb' });

  await useBibleStore.getState().deleteTranslation('esv1');

  assert.equal(useBibleStore.getState().currentTranslationChosenAt, CHOSEN_AT);
  assert.equal(useBibleStore.getState().preferredTranslationLanguage, 'Spanish');
});
