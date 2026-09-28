import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { BSB, installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

const reader = installReaderRenderFixture(mock);
const { t, renderReader, bibleStore, bibleExperienceEvents, harness } = reader;

const downloadEvents = () =>
  bibleExperienceEvents.filter(
    (event) => event.name === 'library_action' && event.detail === 'download'
  );

async function startReaderDownload() {
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  const press = view.press(view.getByRole('button', { name: t('bible.downloadBookAudio') }));
  return { view, press };
}

test('cancelled book audio never reports a saved offline book or download success', async () => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  // The real store resolves a cancelled audio request without adding its book.
  bibleStore.setState({ downloadAudioForBook: async () => pending });
  const { view, press } = await startReaderDownload();
  assert.deepEqual(harness.rn.__recorded.alerts, []);

  complete();
  await press;
  assert.deepEqual(bibleStore.getState().translations[0].downloadedAudioBooks, []);
  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(downloadEvents(), []);
  await view.unmount();
});

test('a completed book audio download still confirms the saved book', async () => {
  bibleStore.setState({
    downloadAudioForBook: async () => {
      bibleStore.setState((state) => ({
        translations: state.translations.map((translation) =>
          translation.id === 'bsb'
            ? { ...translation, downloadedAudioBooks: ['JHN'] }
            : translation
        ),
      }));
    },
  });
  const { view, press } = await startReaderDownload();
  await press;

  assert.equal(harness.rn.__recorded.alerts.at(-1)?.message, t('bible.audioSavedOffline'));
  assert.deepEqual(downloadEvents().map((event) => [event.bookId, event.chapter]), [['JHN', 3]]);
  await view.unmount();
});

test('an already cached book still confirms offline availability', async () => {
  bibleStore.setState((state) => ({
    translations: state.translations.map((translation) =>
      translation.id === 'bsb'
        ? { ...translation, downloadedAudioBooks: ['JHN'] }
        : translation
    ),
  }));
  const { view, press } = await startReaderDownload();
  await press;

  assert.equal(harness.rn.__recorded.alerts.at(-1)?.message, t('bible.audioSavedOffline'));
  assert.equal(downloadEvents().length, 1);
  await view.unmount();
});

test('a failed current download still reports the error', async () => {
  bibleStore.setState({
    downloadAudioForBook: async () => {
      throw new Error('offline');
    },
  });
  const { view, press } = await startReaderDownload();
  await press;

  assert.equal(harness.rn.__recorded.alerts.at(-1)?.title, t('common.error'));
  assert.deepEqual(downloadEvents(), []);
  await view.unmount();
});

test('a completed download after leaving the reader does not interrupt the next screen', async () => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  bibleStore.setState({
    downloadAudioForBook: async () => {
      await pending;
      bibleStore.setState((state) => ({
        translations: state.translations.map((translation) =>
          translation.id === 'bsb'
            ? { ...translation, downloadedAudioBooks: ['JHN'] }
            : translation
        ),
      }));
    },
  });
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  // A native press starts this async handler without awaiting its download. The
  // render harness's press helper awaits it, which would defer unmount cleanup.
  let press!: Promise<void>;
  act(() => {
    press = view.getByRole('button', { name: t('bible.downloadBookAudio') }).props.onPress();
  });
  await view.unmount();
  await act(async () => {
    complete();
    await press;
  });

  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(downloadEvents(), []);
});

test('a completed old-chapter download does not alert over a newly opened chapter', async () => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  bibleStore.setState({
    downloadAudioForBook: async () => {
      await pending;
      bibleStore.setState((state) => ({
        translations: state.translations.map((translation) =>
          translation.id === 'bsb'
            ? { ...translation, downloadedAudioBooks: ['JHN'] }
            : translation
        ),
      }));
    },
  });
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  let press!: Promise<void>;
  act(() => {
    press = view.getByRole('button', { name: t('bible.downloadBookAudio') }).props.onPress();
  });
  await reader.navigateReader(view, { chapter: 4 });
  await act(async () => {
    complete();
    await press;
  });

  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(downloadEvents(), []);
  await view.unmount();
});

test('a completed old-translation download does not alert after translation changes', async () => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  bibleStore.setState({
    translations: [BSB, { ...BSB, id: 'web', abbreviation: 'WEB' }],
    downloadAudioForBook: async () => {
      await pending;
      bibleStore.setState((state) => ({
        translations: state.translations.map((translation) =>
          translation.id === 'bsb'
            ? { ...translation, downloadedAudioBooks: ['JHN'] }
            : translation
        ),
      }));
    },
  });
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  let press!: Promise<void>;
  act(() => {
    press = view.getByRole('button', { name: t('bible.downloadBookAudio') }).props.onPress();
  });
  await act(async () => {
    bibleStore.setState({ currentTranslation: 'web' });
  });
  await view.flush();
  await act(async () => {
    complete();
    await press;
  });

  assert.deepEqual(harness.rn.__recorded.alerts, []);
  assert.deepEqual(downloadEvents(), []);
  await view.unmount();
});
