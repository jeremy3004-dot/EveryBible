import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { BSB, JOHN_3, installReaderRenderFixture } from './BibleReaderScreen.renderFixture';
import type { Verse } from '../../types';

const reader = installReaderRenderFixture(mock);
const { bibleStore, chapterResponses, chapterRequests, renderReader, navigateReader, t } = reader;
const WEB = { ...BSB, id: 'web', abbreviation: 'WEB', name: 'World English Bible' };
const freshVerses = (label: string) =>
  JOHN_3.map((verse) => ({ ...verse, text: `${label} verse ${verse.verse}` }));
const deferred = () => {
  let resolve!: (verses: Verse[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Verse[]>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
async function waitForChapter(key: string) {
  for (let i = 0; i < 200 && !chapterRequests.includes(key); i++) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
  assert.ok(chapterRequests.includes(key), `chapter service entered for ${key}`);
}
async function skeletons(view: Awaited<ReturnType<typeof renderReader>>) {
  const { VersesSkeleton } = await import('../../components/skeleton/VersesSkeleton');
  return view.root.findAllByType(VersesSkeleton);
}

test('translation replacement hides retained BSB text until the WEB chapter lands', async () => {
  const view = await renderReader();
  assert.ok(view.getByText(/Now there was a Pharisee/));
  const pending = deferred();
  chapterResponses.set('web:JHN:3', pending.promise);
  await act(async () =>
    bibleStore.setState({ currentTranslation: 'web', translations: [BSB, WEB] })
  );
  await waitForChapter('web:JHN:3');
  await view.flush();
  const retainedTextVisible = view.queryByText(/Now there was a Pharisee/) !== null;
  const loadingCount = (await skeletons(view)).length;
  assert.ok(view.getByRole('button', { name: 'WEB' }));
  await act(async () => pending.resolve(freshVerses('WEB')));
  await view.flush();

  assert.equal(retainedTextVisible, false, 'BSB Scripture cannot appear under the WEB label');
  assert.equal(loadingCount, 1);
  assert.ok(view.getByText(/WEB verse 1/));
  assert.equal((await skeletons(view)).length, 0);
});

test('same-translation chapter navigation retains text without a loading skeleton', async () => {
  const view = await renderReader();
  const pending = deferred();
  chapterResponses.set('bsb:JHN:4', pending.promise);
  await navigateReader(view, { chapter: 4 });
  await waitForChapter('bsb:JHN:4');
  assert.ok(view.getByText(/Now there was a Pharisee/));
  assert.equal((await skeletons(view)).length, 0);
  await act(async () => pending.resolve(freshVerses('Next chapter')));
  await view.flush();
  assert.ok(view.getByText(/Next chapter verse 1/));
});

test('missing-pack fallback hides old WEB Scripture while the BSB replacement loads', async () => {
  bibleStore.setState({ currentTranslation: 'web', translations: [BSB, WEB] });
  chapterResponses.set('web:JHN:3', Promise.resolve(freshVerses('WEB')));
  const view = await renderReader();
  assert.ok(view.getByText(/WEB verse 1/));
  const missing = deferred();
  const fallback = deferred();
  chapterResponses.set('web:JHN:4', missing.promise);
  chapterResponses.set('bsb:JHN:4', fallback.promise);
  const recovered: string[] = [];
  const originalRecovery = bibleStore.getState().recoverMissingInstalledPack;
  bibleStore.setState({
    recoverMissingInstalledPack: async (translationId: string) => {
      recovered.push(translationId);
      bibleStore.setState({ currentTranslation: 'bsb' });
    },
  });
  try {
    await navigateReader(view, { chapter: 4 });
    await waitForChapter('web:JHN:4');
    await act(async () =>
      missing.reject(
        Object.assign(new Error('Pack vanished'), { name: 'MissingInstalledDatabaseError' })
      )
    );
    await waitForChapter('bsb:JHN:4');
    await view.flush();
    const retainedTextVisible = view.queryByText(/WEB verse 1/) !== null;
    const loadingCount = (await skeletons(view)).length;
    assert.ok(view.getByRole('button', { name: 'BSB' }));
    await act(async () => fallback.resolve(freshVerses('Recovered BSB')));
    await view.flush();

    assert.deepEqual(recovered, ['web']);
    assert.equal(
      retainedTextVisible,
      false,
      'old WEB text cannot be relabelled BSB during recovery'
    );
    assert.equal(loadingCount, 1);
    assert.ok(view.getByText(/Recovered BSB verse 1/));
    assert.equal((await skeletons(view)).length, 0);
  } finally {
    bibleStore.setState({ recoverMissingInstalledPack: originalRecovery });
  }
});

test('a failed translation switch stops loading and retry displays only the selected translation', async () => {
  const view = await renderReader();
  const pending = deferred();
  chapterResponses.set('web:JHN:3', pending.promise);
  await act(async () =>
    bibleStore.setState({ currentTranslation: 'web', translations: [BSB, WEB] })
  );
  await waitForChapter('web:JHN:3');
  await act(async () => pending.reject(new Error('database is locked')));
  await view.flush();
  assert.ok(view.getByText(t('bible.failedToLoad')));
  assert.equal(view.queryByText(/Now there was a Pharisee/), null);
  assert.equal((await skeletons(view)).length, 0);
  chapterResponses.set('web:JHN:3', Promise.resolve(freshVerses('Retried WEB')));
  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();
  assert.ok(view.getByText(/Retried WEB verse 1/));
  assert.ok(view.getByRole('button', { name: 'WEB' }));
  assert.equal((await skeletons(view)).length, 0);
});
