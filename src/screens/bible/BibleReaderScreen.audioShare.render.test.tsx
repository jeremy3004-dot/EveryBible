import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { within } from '../../testing/render';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

const reader = installReaderRenderFixture(mock);
const { t, renderReader } = reader;
const asset = {
  uri: 'file:///john-3.mp3',
  fileExtension: 'mp3',
  mimeType: 'audio/mpeg',
  isTemporary: false,
};
const shares: string[] = [];
let prepare = async () => asset;
let trim = async () => 'file:///clip.mp3';
let trimLoadFails = false;
let shareFails = false;
let beforeTrimLoad: (() => Promise<void>) | null = null;
mockModule(mock, sourcePath('screens/bible/reader/audioShareDependencies.ts'), {
  loadAudioShareDependencies: async () => ({ prepareChapterAudioShareAsset: () => prepare() }),
  releaseStaleAudioShares: async () => {},
  deleteSharedAudioFile: async () => {},
  loadVideoTrimDependencies: async () => {
    await beforeTrimLoad?.();
    if (trimLoadFails) throw new Error('trim module unavailable');
    return {
      VideoTrimModule: {},
      isValidTrimMediaFile: async () => ({ isValid: true, duration: 60_000 }),
      trimAudioMedia: () => trim(),
    };
  },
  tryLoadSharing: async () => ({
    isAvailableAsync: async () => true,
    shareAsync: async (uri: string) => {
      if (shareFails) throw new Error('another share is still open');
      shares.push(uri);
    },
  }),
});
afterEach(() => {
  shares.length = 0;
  prepare = async () => asset;
  trim = async () => 'file:///clip.mp3';
  trimLoadFails = false;
  shareFails = false;
  beforeTrimLoad = null;
});

type View = Awaited<ReturnType<typeof renderReader>>;
async function openAudioShare(view: View): Promise<ReactTestInstance> {
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  await view.press(view.getByRole('button', { name: t('bible.shareChapterAudio') }));
  const sheet = view
    .queryAllByType('Modal')
    .find((modal) => within(modal).queryByRole('button', { name: t('bible.shareAudioPortion') }));
  assert.ok(sheet);
  return sheet;
}

async function openPortion(view: View): Promise<ReactTestInstance> {
  const chooser = await openAudioShare(view);
  const onDismiss = chooser.props.onDismiss as () => void;
  await view.press(within(chooser).getByRole('button', { name: t('bible.shareAudioPortion') }));
  await view.flush();
  if (reader.harness.rn.Platform.OS === 'ios') {
    assert.equal(
      view.queryByRole('header', { name: t('bible.shareAudioPortion') }),
      null,
      'clip modal waits for chooser dismissal'
    );
    await act(async () => onDismiss());
  }
  await view.flush();
  const sheet = view
    .queryAllByType('Modal')
    .find((modal) => within(modal).queryByRole('header', { name: t('bible.shareAudioPortion') }));
  assert.ok(sheet, 'clip modal opens after chooser dismissal');
  return sheet;
}

test('full audio sharing waits for the iOS chooser dismissal before presenting another native sheet', async () => {
  const view = await renderReader();
  const sheet = await openAudioShare(view);
  const onDismiss = sheet.props.onDismiss as (() => void) | undefined;
  await view.press(within(sheet).getByRole('button', { name: t('bible.shareChapterAudio') }));
  await view.flush();

  assert.deepEqual(shares, [], 'native sharing must wait while the chooser is still dismissing');
  assert.equal(typeof onDismiss, 'function');
  await act(async () => onDismiss?.());
  await view.flush();
  assert.deepEqual(shares, [asset.uri]);
});

test('a share sheet failure after the audio is ready is not reported as a failed download', async () => {
  shareFails = true;
  const view = await renderReader();
  const sheet = await openAudioShare(view);
  const onDismiss = sheet.props.onDismiss as (() => void) | undefined;
  await view.press(within(sheet).getByRole('button', { name: t('bible.shareChapterAudio') }));
  await act(async () => onDismiss?.());
  await view.flush();

  assert.deepEqual(
    reader.harness.rn.__recorded.alerts.map((alert) => alert.message),
    [t('common.somethingWentWrong')]
  );
});

test('a chapter whose audio cannot be prepared is reported as a failed download', async () => {
  prepare = async () => {
    throw new Error('network down');
  };
  const view = await renderReader();
  const sheet = await openAudioShare(view);
  const onDismiss = sheet.props.onDismiss as (() => void) | undefined;
  await view.press(within(sheet).getByRole('button', { name: t('bible.shareChapterAudio') }));
  await act(async () => onDismiss?.());
  await view.flush();

  assert.deepEqual(
    reader.harness.rn.__recorded.alerts.map((alert) => alert.message),
    [t('bible.audioDownloadFailed')]
  );
});

test('a chapter download resolving after privacy-lock unmount cannot open native sharing', async () => {
  let finish!: (value: typeof asset) => void;
  const download = new Promise<typeof asset>((resolve) => {
    finish = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  prepare = () => {
    markStarted();
    return download;
  };
  const view = await renderReader();
  const sheet = await openAudioShare(view);
  const onDismiss = sheet.props.onDismiss as (() => void) | undefined;
  await view.press(within(sheet).getByRole('button', { name: t('bible.shareChapterAudio') }));
  await act(async () => onDismiss?.());
  await started;
  await view.unmount();
  await act(async () => {
    finish(asset);
  });

  assert.deepEqual(shares, []);
});

test('clip sharing waits for its own iOS modal dismissal before native sharing', async () => {
  const view = await renderReader();
  const sheet = await openPortion(view);
  const onDismiss = sheet.props.onDismiss as () => void;
  await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
  await view.flush();
  assert.deepEqual(shares, []);
  assert.equal(view.queryByRole('header', { name: t('bible.shareAudioPortion') }), null);
  await act(async () => onDismiss());
  await view.flush();
  assert.deepEqual(shares, ['file:///clip.mp3']);
});

test('clip confirmation reports module load failure and allows retry from the same draft', async () => {
  const view = await renderReader();
  let sheet = await openPortion(view);
  trimLoadFails = true;
  await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
  await view.flush();
  assert.equal(reader.harness.rn.__recorded.alerts.length, 1);
  sheet = view
    .queryAllByType('Modal')
    .find((modal) => within(modal).queryByRole('header', { name: t('bible.shareAudioPortion') }))!;
  const retry = within(sheet).getByRole('button', { name: t('groups.share') });
  const onDismiss = sheet.props.onDismiss as () => void;
  assert.equal(retry.props.disabled, false);
  trimLoadFails = false;
  await view.press(retry);
  await view.flush();
  await act(async () => onDismiss());
  await view.flush();
  assert.deepEqual(shares, ['file:///clip.mp3']);
});

test('translation replacement closes the clip draft and discards its pending trim', async () => {
  let finishTrim!: (uri: string) => void;
  const pending = new Promise<string>((resolve) => {
    finishTrim = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  trim = () => {
    markStarted();
    return pending;
  };
  const view = await renderReader();
  const sheet = await openPortion(view);
  await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
  await started;
  await act(async () => reader.bibleStore.setState({ currentTranslation: 'web' }));
  await view.flush();
  assert.equal(view.queryByRole('header', { name: t('bible.shareAudioPortion') }), null);
  await act(async () => finishTrim('file:///old-clip.mp3'));
  await view.flush();
  assert.deepEqual(shares, []);
  assert.deepEqual(reader.harness.rn.__recorded.alerts, []);
});

for (const platform of ['android', 'ios'] as const) {
  for (const pendingStage of ['dependencies', 'trim']) {
    test(`${platform} dismissal during pending clip ${pendingStage} prevents sharing and permits a fresh clip`, async () => {
      reader.harness.rn.Platform.OS = platform;
      let finish!: () => void;
      let markStarted!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const view = await renderReader();
      let sheet = await openPortion(view);
      if (pendingStage === 'dependencies') {
        beforeTrimLoad = () => {
          markStarted();
          return pending;
        };
      } else {
        trim = async () => {
          markStarted();
          await pending;
          return 'file:///dismissed-clip.mp3';
        };
      }

      await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
      await started;
      assert.equal(
        within(sheet).getByRole('button', { name: t('common.cancel') }).props.disabled,
        true,
        'the footer still prevents a second action during native preparation'
      );
      await act(async () => {
        if (platform === 'android') sheet.props.onRequestClose();
        else {
          const overlay = sheet.find(
            (node) => typeof node.props.onAccessibilityEscape === 'function'
          );
          overlay.props.onAccessibilityEscape();
        }
      });
      await view.flush();
      const dismissed = view.queryByRole('header', { name: t('bible.shareAudioPortion') }) === null;
      assert.equal(dismissed, true, 'Back or escape must close the clip composer');
      beforeTrimLoad = null;
      let finishFresh!: () => void;
      let markFreshStarted!: () => void;
      const freshPending = new Promise<void>((resolve) => {
        finishFresh = resolve;
      });
      const freshStarted = new Promise<void>((resolve) => {
        markFreshStarted = resolve;
      });
      trim = async () => {
        markFreshStarted();
        await freshPending;
        return 'file:///fresh-clip.mp3';
      };
      sheet = await openPortion(view);
      const onDismiss = sheet.props.onDismiss as () => void;
      await view.press(within(sheet).getByRole('button', { name: t('groups.share') }));
      await freshStarted;
      await act(async () => finish());
      await view.flush();
      assert.deepEqual(shares, [], 'dismissed work must not present a native share');
      assert.deepEqual(reader.harness.rn.__recorded.alerts, []);
      assert.equal(
        within(sheet).getByRole('button', { name: t('groups.share') }).props.disabled,
        true,
        'late completion must leave the fresh clip busy'
      );
      await act(async () => finishFresh());
      await view.flush();
      if (platform === 'ios') await act(async () => onDismiss());
      await view.flush();
      assert.deepEqual(shares, ['file:///fresh-clip.mp3']);
    });
  }
}
