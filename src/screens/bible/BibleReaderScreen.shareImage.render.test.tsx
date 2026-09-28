import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { within } from '../../testing/render';
import { mockModule, mockPackage, sourcePath } from '../../testing/mockModules';
import { installReaderRenderFixture, JOHN_3 } from './BibleReaderScreen.renderFixture';

// Sharing selected verses as an image from the background picker. On iOS the share
// sheet is presented from the top view controller; while the picker Modal is still
// fading out that is the closing Modal, the presentation is dropped ("whose view is
// not in the window hierarchy") and expo-sharing's promise never settles. The fake
// below models that: a share requested before the picker reported its dismissal
// never completes.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader } = reader;

const sharing = {
  /** Whether the picker Modal has reported onDismiss since it last opened. */
  pickerDismissed: false,
  /** Shares requested while the picker was still on screen: iOS drops them. */
  dropped: [] as string[],
  /** Share sheets actually presented. */
  sheets: [] as Array<{ uri: string; options: unknown }>,
  /** How a presented sheet ends: the user shares or cancels (both resolve), or it fails. */
  outcome: 'shared' as 'shared' | 'cancelled' | 'rejected',
  error: new Error('Failed to share the file'),
  captures: 0,
  releases: [] as string[],
};
let pendingShare: Promise<void> | null = null;
let pendingCapture: Promise<string> | null = null;
let pendingAvailability: Promise<boolean> | null = null;
let availabilityStarted = () => {};
let captureStarted = () => {};
mockPackage(mock, 'expo-sharing', {
  isAvailableAsync: async () => {
    availabilityStarted();
    return pendingAvailability ?? true;
  },
  shareAsync: (uri: string, options: unknown) => {
    if (!sharing.pickerDismissed) {
      sharing.dropped.push(uri);
      return new Promise<void>(() => {});
    }
    sharing.sheets.push({ uri, options });
    return (
      pendingShare ??
      (sharing.outcome === 'rejected' ? Promise.reject(sharing.error) : Promise.resolve())
    );
  },
});
mockPackage(mock, 'react-native-view-shot', {
  releaseCapture: (uri: string) => {
    sharing.releases.push(uri);
  },
  captureRef: async () => {
    sharing.captures += 1;
    captureStarted();
    return pendingCapture ?? `file:///tmp/verse-${sharing.captures}.png`;
  },
});
const reported: Array<[string, unknown]> = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reported.push([source, error]);
  },
});

afterEach(() => {
  sharing.pickerDismissed = false;
  sharing.dropped.length = 0;
  sharing.sheets.length = 0;
  sharing.outcome = 'shared';
  sharing.captures = 0;
  sharing.releases.length = 0;
  pendingShare = null;
  pendingCapture = null;
  pendingAvailability = null;
  availabilityStarted = () => {};
  captureStarted = () => {};
  reported.length = 0;
});

type View = Awaited<ReturnType<typeof renderReader>>;

/** Select a verse and open the image picker; returns the picker Modal. */
async function openPicker(view: View) {
  if (!view.queryByRole('button', { name: t('bible.shareVerseImage') })) {
    await view.press(view.getByText(new RegExp(JOHN_3[1].text.slice(0, 20))));
  }
  await view.press(view.getByRole('button', { name: t('bible.shareVerseImage') }));
  sharing.pickerDismissed = false;
  return picker(view);
}

function picker(view: View): ReactTestInstance {
  const sheet = view
    .queryAllByType('Modal')
    .find((node) => within(node).queryAllByText(t('bible.chooseVerseImageBackground')).length > 0);
  assert.ok(sheet, 'the verse image picker is open');
  return sheet;
}

const shareButton = (sheet: ReactTestInstance) =>
  within(sheet).getByRole('button', { name: t('groups.share') });

test('image-share thumbnails request resized Android decodes without reducing preview quality', async () => {
  const view = await renderReader();
  const sheet = await openPicker(view);
  const rail = within(sheet)
    .queryAllByType('ScrollView')
    .find((node) => node.props.horizontal === true);
  assert.ok(rail, 'the background thumbnail rail is present');
  const thumbnails = within(rail).queryAllByType('ImageBackground');
  assert.ok(thumbnails.length > 1, 'the rail offers multiple backgrounds');
  for (const thumbnail of thumbnails) {
    assert.equal(thumbnail.props.resizeMethod, 'resize', 'thumbnails decode to their view size');
  }

  const preview = within(sheet)
    .queryAllByType('ImageBackground')
    .find((node) => !thumbnails.includes(node));
  assert.ok(preview, 'the full-size share preview is present');
  assert.equal(
    preview.props.resizeMethod,
    undefined,
    'the captured preview keeps its original decode'
  );
});

/** What the native Modal does once its close animation ends (iOS only). */
async function finishDismissal(view: View, onDismiss: unknown) {
  sharing.pickerDismissed = true;
  if (typeof onDismiss === 'function') {
    await act(async () => {
      (onDismiss as () => void)();
    });
  }
  await view.flush();
}

/** Tap Share in the picker and let the native Modal finish closing. */
async function shareFromPicker(view: View) {
  const sheet = await openPicker(view);
  const { onDismiss } = sheet.props as { onDismiss?: unknown };
  await view.press(shareButton(sheet));
  await view.flush();
  await finishDismissal(view, onDismiss);
}

test('the image share sheet is presented only after the picker has finished closing', async () => {
  const view = await renderReader();
  const sheet = await openPicker(view);
  const { onDismiss } = sheet.props as { onDismiss?: unknown };
  assert.equal(typeof onDismiss, 'function', 'the picker Modal reports its dismissal');

  await view.press(shareButton(sheet));
  await view.flush();

  assert.equal(sharing.captures, 1, 'the card is captured while the picker still shows it');
  assert.equal(
    view.queryAllByType('Modal').some((node) => node === sheet),
    false,
    'tapping Share closes the picker'
  );
  assert.deepEqual(sharing.dropped, [], 'nothing is presented over the closing picker');
  assert.equal(sharing.sheets.length, 0);

  await finishDismissal(view, onDismiss);

  assert.deepEqual(sharing.dropped, []);
  assert.equal(sharing.sheets.length, 1);
  assert.equal(sharing.sheets[0].uri, 'file:///tmp/verse-1.png');
  assert.deepEqual(harness.rn.__recorded.shares, [], 'no text share on the image path');
  assert.deepEqual(reported, []);
});

test('a cancelled image share leaves the Share button ready for another try', async () => {
  sharing.outcome = 'cancelled';
  const view = await renderReader();

  await shareFromPicker(view);
  assert.equal(sharing.sheets.length, 1);

  const again = await openPicker(view);
  const button = shareButton(again);
  assert.notEqual(button.props.accessibilityState?.busy, true, 'the Share button is not spinning');
  assert.notEqual(button.props.disabled, true);

  const { onDismiss } = again.props as { onDismiss?: unknown };
  await view.press(button);
  await view.flush();
  await finishDismissal(view, onDismiss);

  assert.equal(sharing.sheets.length, 2, 'the second tap presents the share sheet again');
  assert.deepEqual(reported, [], 'a cancel is not an error');
});

test('an image share that fails is reported, falls back to text, and does not wedge the button', async () => {
  sharing.outcome = 'rejected';
  const view = await renderReader();

  await shareFromPicker(view);

  assert.deepEqual(reported, [['reader.shareImage', sharing.error]]);
  const [textShare] = harness.rn.__recorded.shares as Array<{ message: string }>;
  assert.ok(textShare?.message.includes(JOHN_3[1].text), 'the verse is still shared as text');

  const again = await openPicker(view);
  const button = shareButton(again);
  assert.notEqual(button.props.accessibilityState?.busy, true, 'the Share button is not spinning');

  sharing.outcome = 'shared';
  const { onDismiss } = again.props as { onDismiss?: unknown };
  await view.press(button);
  await view.flush();
  await finishDismissal(view, onDismiss);

  assert.equal(sharing.sheets.length, 2, 'the second tap presents the share sheet');
});

test('a failed native image share cannot open fallback text sharing after privacy-lock unmount', async () => {
  let rejectShare!: (error: Error) => void;
  pendingShare = new Promise<void>((_resolve, reject) => {
    rejectShare = reject;
  });
  const view = await renderReader();
  await shareFromPicker(view);
  assert.equal(sharing.sheets.length, 1, 'the native image sheet has started');
  await view.unmount();
  await act(async () => {
    rejectShare(sharing.error);
  });
  assert.deepEqual(harness.rn.__recorded.shares, [], 'no new native sheet may open over the lock');
});

test('a reader unmounted while its image picker closes cannot present a native share sheet', async () => {
  const view = await renderReader();
  const sheet = await openPicker(view);
  const onDismiss = sheet.props.onDismiss;
  await view.press(shareButton(sheet));
  await view.flush();
  assert.equal(sharing.captures, 1);
  assert.equal(sharing.sheets.length, 0);
  await view.unmount();
  await finishDismissal(view, onDismiss);
  assert.deepEqual(sharing.sheets, [], 'late dismissal cannot share after reader unmount');
});

for (const captureFails of [false, true]) {
  test(`Cancel during iOS capture that later ${captureFails ? 'fails' : 'finishes'} prevents sharing and permits reopening`, async () => {
    let release!: (uri: string) => void;
    let reject!: (error: Error) => void;
    pendingCapture = new Promise<string>((resolve, fail) => {
      release = resolve;
      reject = fail;
    });
    const started = new Promise<void>((resolve) => {
      captureStarted = resolve;
    });
    const view = await renderReader();
    const sheet = await openPicker(view);
    const onDismiss = sheet.props.onDismiss;
    await view.press(shareButton(sheet));
    await started;
    await view.press(within(sheet).getByRole('button', { name: t('common.cancel') }));
    await finishDismissal(view, onDismiss);
    await act(async () => {
      if (captureFails) reject(new Error('capture failed after Cancel'));
      else release('file:///cancelled.png');
    });
    await view.flush();
    assert.deepEqual(sharing.sheets, []);
    assert.deepEqual(harness.rn.__recorded.shares, []);
    assert.deepEqual(reported, []);

    pendingCapture = null;
    captureStarted = () => {};
    const reopened = await openPicker(view);
    const reopenedDismissal = reopened.props.onDismiss;
    assert.equal(shareButton(reopened).props.disabled, false, 'Cancel must clear busy state');
    await view.press(shareButton(reopened));
    await finishDismissal(view, reopenedDismissal);
    assert.equal(sharing.sheets.length, 1, 'a fresh share can still present');
  });
}

test('user dismissal during the iOS close wait resolves it without native image or text sharing', async () => {
  const view = await renderReader();
  const sheet = await openPicker(view);
  const { onDismiss, onRequestClose } = sheet.props;
  await view.press(shareButton(sheet));
  await view.flush();
  assert.equal(sharing.captures, 1);
  assert.deepEqual(sharing.sheets, []);
  await act(async () => onRequestClose());
  await finishDismissal(view, onDismiss);
  assert.deepEqual(sharing.sheets, []);
  assert.deepEqual(harness.rn.__recorded.shares, []);
  assert.deepEqual(sharing.releases, ['file:///tmp/verse-1.png']);
});

test('an image handed to native sharing is not released after a later reader unmount', async () => {
  let finishShare!: () => void;
  pendingShare = new Promise<void>((resolve) => {
    finishShare = resolve;
  });
  const view = await renderReader();
  await shareFromPicker(view);
  assert.equal(sharing.sheets.length, 1);
  await view.unmount();
  await act(async () => finishShare());
  assert.deepEqual(sharing.releases, []);
});

test('a same-tick second Share press cannot capture and share the image twice', async () => {
  const view = await renderReader();
  const sheet = await openPicker(view);
  const onDismiss = sheet.props.onDismiss;
  const onPress = shareButton(sheet).props.onPress as () => void;
  await act(async () => {
    onPress();
    onPress();
  });
  await view.flush();
  await finishDismissal(view, onDismiss);
  assert.equal(sharing.captures, 1);
  assert.equal(sharing.sheets.length, 1);
});

test('a capture completed after translation replacement cannot share or fall back', async () => {
  let finishCapture!: (uri: string) => void;
  pendingCapture = new Promise<string>((resolve) => {
    finishCapture = resolve;
  });
  const view = await renderReader();
  const sheet = await openPicker(view);
  const onDismiss = sheet.props.onDismiss;
  await view.press(shareButton(sheet));
  await view.flush();
  assert.equal(sharing.captures, 1);
  await act(async () => reader.bibleStore.setState({ currentTranslation: 'web' }));
  await view.flush();
  await act(async () => finishCapture('file:///old-translation.png'));
  await finishDismissal(view, onDismiss);
  assert.deepEqual(sharing.sheets, []);
  assert.deepEqual(harness.rn.__recorded.shares, []);
  assert.deepEqual(reported, []);
});

test('availability resolving after unmount cannot begin capturing the verse image', async () => {
  let finishAvailability!: (available: boolean) => void;
  pendingAvailability = new Promise<boolean>((resolve) => {
    finishAvailability = resolve;
  });
  const started = new Promise<void>((resolve) => {
    availabilityStarted = resolve;
  });
  const view = await renderReader();
  const sheet = await openPicker(view);
  await view.press(shareButton(sheet));
  await started;
  await view.unmount();
  await act(async () => finishAvailability(true));
  await view.flush();
  assert.equal(sharing.captures, 0);
  assert.deepEqual(sharing.sheets, []);
  assert.deepEqual(harness.rn.__recorded.shares, []);
});

test('an iOS picker dismissal timeout cannot present the native image sheet', async () => {
  const view = await renderReader();
  const sheet = await openPicker(view);
  const onDismiss = sheet.props.onDismiss;
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await view.press(shareButton(sheet));
    await view.flush();
    assert.equal(sharing.captures, 1);
    await act(async () => mock.timers.tick(2_000));
    await view.flush();
    assert.deepEqual(sharing.dropped, [], 'elapsed time cannot replace native dismissal');
    assert.deepEqual(sharing.sheets, []);
    await finishDismissal(view, onDismiss);
    assert.equal(sharing.sheets.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('an old image failure cannot clear a replacement selection share or launch its fallback', async () => {
  let rejectOldShare!: (error: Error) => void;
  pendingShare = new Promise<void>((_resolve, reject) => {
    rejectOldShare = reject;
  });
  const view = await renderReader();
  await shareFromPicker(view);
  await view.press(view.getByText(new RegExp(JOHN_3[0].text.slice(0, 20))));
  let finishCapture!: (uri: string) => void;
  pendingCapture = new Promise<string>((resolve) => {
    finishCapture = resolve;
  });
  const sheet = await openPicker(view);
  const onDismiss = sheet.props.onDismiss;
  await view.press(shareButton(sheet));
  await view.flush();
  assert.equal(sharing.captures, 2);
  await act(async () => rejectOldShare(sharing.error));
  await view.flush();
  const currentButton = shareButton(picker(view));
  assert.equal(currentButton.props.accessibilityState?.busy, true);
  assert.equal(currentButton.props.disabled, true);
  assert.deepEqual(harness.rn.__recorded.shares, []);
  assert.deepEqual(reported, []);
  pendingShare = null;
  await act(async () => finishCapture('file:///new-selection.png'));
  await finishDismissal(view, onDismiss);
  assert.equal(sharing.sheets.at(-1)?.uri, 'file:///new-selection.png');
});
