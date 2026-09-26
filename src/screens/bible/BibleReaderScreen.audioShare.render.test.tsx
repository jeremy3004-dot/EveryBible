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
mockModule(mock, sourcePath('screens/bible/reader/audioShareDependencies.ts'), {
  loadAudioShareDependencies: async () => ({ prepareChapterAudioShareAsset: () => prepare() }),
  loadVideoTrimDependencies: async () => {
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
      shares.push(uri);
    },
  }),
});
afterEach(() => {
  shares.length = 0;
  prepare = async () => asset;
  trim = async () => 'file:///clip.mp3';
  trimLoadFails = false;
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
  assert.equal(
    view.queryByRole('header', { name: t('bible.shareAudioPortion') }),
    null,
    'clip modal waits for chooser dismissal'
  );
  await act(async () => onDismiss());
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
