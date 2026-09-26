import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { within } from '../../testing/render';
import { mockPackage } from '../../testing/mockModules';
import { installReaderRenderFixture, JOHN_3 } from './BibleReaderScreen.renderFixture';

// Android's Modal never reports onDismiss, so the verse-image share waits for the
// picker's close interaction instead (see the iOS cases in shareImage.render.test).
const { t, renderReader, harness } = installReaderRenderFixture(mock, { os: 'android' });

const sheets: string[] = [];
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: async () => true,
  shareAsync: async (uri: string) => {
    sheets.push(uri);
  },
});
mockPackage(mock, 'react-native-view-shot', {
  captureRef: async () => 'file:///tmp/verse.png',
});

test('on Android the image is shared once the picker has closed, without an onDismiss', async () => {
  const view = await renderReader();
  await view.press(view.getByText(new RegExp(JOHN_3[1].text.slice(0, 20))));
  await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));
  const sheet = view
    .queryAllByType('Modal')
    .find((node) => within(node).queryAllByText(t('bible.chooseVerseImageBackground')).length > 0);
  assert.ok(sheet);

  await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
  await view.flush();

  assert.deepEqual(sheets, ['file:///tmp/verse.png']);
  assert.equal(
    view
      .queryAllByType('Modal')
      .some((node) => within(node).queryAllByText(t('bible.chooseVerseImageBackground')).length),
    false,
    'the picker is closed'
  );
});

test('unmount cancels Android image sharing queued behind the picker close interaction', async () => {
  sheets.length = 0;
  let closeInteraction: (() => void) | undefined;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let cancelled = false;
  const interaction = mock.method(
    harness.rn.InteractionManager,
    'runAfterInteractions',
    (task?: () => void) => {
      closeInteraction = task;
      markStarted();
      const done = Promise.resolve();
      return {
        then: done.then.bind(done),
        done: () => {},
        cancel: () => {
          cancelled = true;
        },
      };
    }
  );
  try {
    const view = await renderReader();
    await view.press(view.getByText(new RegExp(JOHN_3[1].text.slice(0, 20))));
    await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));
    const sheet = view
      .queryAllByType('Modal')
      .find((node) => within(node).queryByText(t('bible.chooseVerseImageBackground')));
    assert.ok(sheet);
    await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
    await started;
    await view.unmount();
    closeInteraction?.();
    assert.equal(cancelled, true);
    assert.deepEqual(sheets, []);
    assert.deepEqual(harness.rn.__recorded.shares, []);
  } finally {
    interaction.mock.restore();
  }
});
