import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { within } from '../../testing/render';
import { mockPackage } from '../../testing/mockModules';
import { installReaderRenderFixture, JOHN_3 } from './BibleReaderScreen.renderFixture';
import { assertDefined } from '../../utils/assertDefined';

// Android's Modal never reports onDismiss, so the verse-image share waits for the
// picker's close interaction instead (see the iOS cases in shareImage.render.test).
const { t, renderReader, harness } = installReaderRenderFixture(mock, { os: 'android' });

const sheets: string[] = [];
const captureFiles = new Set<string>();
const releases: string[] = [];
let releaseFailure: Error | null = null;
let pendingShare: Promise<void> | null = null;
let shareStarted = () => {};
let pendingCapture: Promise<string> | null = null;
let captureStarted = () => {};
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: async () => true,
  shareAsync: async (uri: string) => {
    sheets.push(uri);
    shareStarted();
    await pendingShare;
  },
});
mockPackage(mock, 'react-native-view-shot', {
  releaseCapture: (uri: string) => {
    releases.push(uri);
    if (releaseFailure) throw releaseFailure;
    captureFiles.delete(uri);
  },
  captureRef: async () => {
    captureStarted();
    const uri = await (pendingCapture ?? 'file:///tmp/verse.png');
    captureFiles.add(uri);
    return uri;
  },
});

afterEach(async () => {
  // Loaded here, after the module mocks are installed.
  (await import('./reader/useVerseImageShare')).forgetLastSharedVerseImage();
});

test('on Android the image is shared once the picker has closed, without an onDismiss', async () => {
  const view = await renderReader();
  await view.press(
    view.getByText(new RegExp(assertDefined(JOHN_3[1], 'JOHN_3[1]').text.slice(0, 20)))
  );
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
    await view.press(
      view.getByText(new RegExp(assertDefined(JOHN_3[1], 'JOHN_3[1]').text.slice(0, 20)))
    );
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

test('Cancel during Android image capture shares nothing and reopening permits a fresh share', async () => {
  sheets.length = 0;
  let release!: (uri: string) => void;
  pendingCapture = new Promise<string>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captureStarted = resolve;
  });
  const view = await renderReader();
  await view.press(
    view.getByText(new RegExp(assertDefined(JOHN_3[1], 'JOHN_3[1]').text.slice(0, 20)))
  );
  await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));
  const sheet = view
    .queryAllByType('Modal')
    .find((node) => within(node).queryByText(t('bible.chooseVerseImageBackground')));
  assert.ok(sheet);
  await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
  await started;
  await view.press(within(sheet).getByRole('button', { name: t('common.cancel') }));
  assert.equal(view.queryByText(t('bible.chooseVerseImageBackground')), null);
  await act(async () => release('file:///cancelled-capture.png'));
  await view.flush();
  assert.deepEqual(sheets, [], 'Cancel must invalidate the pending capture');
  assert.deepEqual(harness.rn.__recorded.shares, []);

  pendingCapture = null;
  captureStarted = () => {};
  await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));
  const reopened = view
    .queryAllByType('Modal')
    .find((node) => within(node).queryByText(t('bible.chooseVerseImageBackground')));
  assert.ok(reopened);
  await view.press(within(reopened).getByRole('button', { name: t('groups.share') }));
  await view.flush();
  assert.deepEqual(sheets, ['file:///tmp/verse.png']);
});

for (const cleanupFails of [false, true]) {
  test(`a stale capture releases only its own image while a fresh share is pending${cleanupFails ? ', even when cleanup throws' : ''}`, async () => {
    sheets.length = 0;
    captureFiles.clear();
    releases.length = 0;
    releaseFailure = cleanupFails ? new Error('temporary file cleanup unavailable') : null;
    let releaseOldCapture!: (uri: string) => void;
    pendingCapture = new Promise<string>((resolve) => {
      releaseOldCapture = resolve;
    });
    const oldCaptureStarted = new Promise<void>((resolve) => {
      captureStarted = resolve;
    });
    let finishShare!: () => void;
    pendingShare = new Promise<void>((resolve) => {
      finishShare = resolve;
    });
    const currentShareStarted = new Promise<void>((resolve) => {
      shareStarted = resolve;
    });
    const view = await renderReader();
    await view.press(
      view.getByText(new RegExp(assertDefined(JOHN_3[1], 'JOHN_3[1]').text.slice(0, 20)))
    );
    const openPicker = async () => {
      await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));
      const sheet = view
        .queryAllByType('Modal')
        .find((node) => within(node).queryByText(t('bible.chooseVerseImageBackground')));
      assert.ok(sheet);
      return sheet;
    };
    try {
      const first = await openPicker();
      await view.press(within(first).getByRole('button', { name: t('groups.share') }));
      await oldCaptureStarted;
      await view.press(within(first).getByRole('button', { name: t('common.cancel') }));
      pendingCapture = null;
      const fresh = await openPicker();
      await view.press(within(fresh).getByRole('button', { name: t('groups.share') }));
      await currentShareStarted;
      await act(async () => releaseOldCapture('file:///tmp/abandoned.png'));
      await view.flush();

      assert.deepEqual(releases, ['file:///tmp/abandoned.png']);
      assert.ok(captureFiles.has('file:///tmp/verse.png'), 'the presented image stays available');
      assert.equal(captureFiles.has('file:///tmp/abandoned.png'), cleanupFails);
      assert.deepEqual(sheets, ['file:///tmp/verse.png']);
      assert.deepEqual(harness.rn.__recorded.shares, []);
      // The old cleanup must not clear the new request, even if cleanup failed.
      const reopened = await openPicker();
      await view.press(within(reopened).getByRole('button', { name: t('groups.share') }));
      await view.flush();
      assert.deepEqual(sheets, ['file:///tmp/verse.png']);
    } finally {
      finishShare();
      await view.flush();
      pendingShare = null;
      pendingCapture = null;
      releaseFailure = null;
      captureStarted = () => {};
      shareStarted = () => {};
    }
    assert.ok(captureFiles.has('file:///tmp/verse.png'), 'a handed-off image is never released');
  });
}
