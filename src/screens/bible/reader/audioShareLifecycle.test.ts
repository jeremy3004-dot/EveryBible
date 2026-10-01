import assert from 'node:assert/strict';
import test, { afterEach, before, mock } from 'node:test';
import { createReactHookRuntime } from '../../../testing/reactHookRuntime';
import { mockModule, mockPackage, sourcePath } from '../../../testing/mockModules';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const alerts: unknown[][] = [];
const shares: string[] = [];
const platform = { OS: 'android' };
mockModule(mock, 'react-native', {
  Alert: { alert: (...args: unknown[]) => alerts.push(args) },
  Platform: platform,
  Share: {
    share: async () => {
      shares.push('text');
    },
  },
  InteractionManager: {
    runAfterInteractions: (done: () => void) => {
      queueMicrotask(done);
      return { cancel: () => {} };
    },
  },
});
mockPackage(mock, 'react-i18next', { useTranslation: () => ({ t: (key: string) => key }) });
mockModule(mock, sourcePath('services/analytics/bibleExperienceAnalytics.ts'), {
  trackBibleExperienceEvent: () => {},
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const asset = {
  uri: 'file:///john-3.mp3',
  fileExtension: 'mp3',
  mimeType: 'audio/mpeg',
  isTemporary: true,
};
let prepare = async () => asset;
let prepareCalls = 0;
let trimCalls = 0;
const trimArguments: unknown[][] = [];
let trim = async (...args: unknown[]) => {
  trimCalls += 1;
  trimArguments.push(args);
  return 'file:///clip.mp3';
};
const trimDependencies = {
  VideoTrimModule: {},
  isValidTrimMediaFile: async () => ({ isValid: true, duration: 60_000 }),
  trimAudioMedia: (...args: unknown[]) => trim(...args),
};
let loadTrim = async () => trimDependencies;
let sharingAvailable = true;
mockModule(mock, sourcePath('screens/bible/reader/audioShareDependencies.ts'), {
  loadAudioShareDependencies: async () => ({
    prepareChapterAudioShareAsset: () => {
      prepareCalls += 1;
      return prepare();
    },
  }),
  loadVideoTrimDependencies: () => loadTrim(),
  tryLoadSharing: async () => ({
    isAvailableAsync: async () => sharingAvailable,
    shareAsync: async (uri: string) => {
      shares.push(uri);
    },
  }),
});

let useChapterAudioShare: typeof import('./useChapterAudioShare').useChapterAudioShare;
let useAudioPortionShare: typeof import('./useAudioPortionShare').useAudioPortionShare;
before(async () => {
  ({ useChapterAudioShare } = await import('./useChapterAudioShare'));
  ({ useAudioPortionShare } = await import('./useAudioPortionShare'));
});
afterEach(() => {
  runtime.unmountAll();
  alerts.length = 0;
  shares.length = 0;
  platform.OS = 'android';
  trimCalls = 0;
  prepareCalls = 0;
  trimArguments.length = 0;
  trim = async (...args: unknown[]) => {
    trimCalls += 1;
    trimArguments.push(args);
    return 'file:///clip.mp3';
  };
  sharingAvailable = true;
  prepare = async () => asset;
  loadTrim = async () => trimDependencies;
});

const audioPositionRef = { current: { currentPosition: 0, duration: 60_000 } };
const portionInput = () => ({
  audioPositionRef,
  bookId: 'JHN',
  chapter: 3,
  chapterShareTitle: 'John 3',
  currentTranslation: 'bsb',
  isCurrentAudioChapter: true,
  resetFollowAlongClamp: () => {},
  seekTo: async () => {},
  status: 'paused' as 'paused' | 'loading' | 'playing',
  togglePlayPause: async () => {},
});
const draft = () => ({ ...asset, durationMs: 60_000 });
const chapterInput = (writes: unknown[] = []) => ({
  audioPositionRef,
  bookId: 'JHN',
  chapter: 3,
  chapterShareTitle: 'John 3',
  currentTranslation: 'bsb',
  isCurrentAudioChapter: true,
  setAudioPortionEndMs: (value: unknown) => writes.push(['end', value]),
  setAudioPortionShareDraft: (value: unknown) => writes.push(['draft', value]),
  setAudioPortionStartMs: (value: unknown) => writes.push(['start', value]),
  setShowAudioOptionsSheet: () => {},
  setShowChapterActionsSheet: () => {},
});
const mountChapter = (writes: unknown[] = []) => {
  const view = runtime.mount(useChapterAudioShare, chapterInput(writes));
  view.flushEffects();
  return view;
};
const mountPortion = () => {
  const view = runtime.mount(useAudioPortionShare, portionInput());
  view.flushEffects();
  view.result.setAudioPortionShareDraft({
    sourceUri: asset.uri,
    fileExtension: 'mp3',
    mimeType: 'audio/mpeg',
    durationMs: 60_000,
  });
  view.result.setAudioPortionEndMs(30_000);
  view.rerender();
  view.flushEffects();
  return view;
};

test('a chapter download completed after the reader unmounts cannot present a native share sheet', async () => {
  const download = deferred<typeof asset>();
  const started = deferred<void>();
  prepare = () => {
    started.resolve();
    return download.promise;
  };
  const view = runtime.mount(useChapterAudioShare, {
    audioPositionRef,
    bookId: 'JHN',
    chapter: 3,
    chapterShareTitle: 'John 3',
    currentTranslation: 'bsb',
    isCurrentAudioChapter: true,
    setAudioPortionEndMs: () => {},
    setAudioPortionShareDraft: () => {},
    setAudioPortionStartMs: () => {},
    setShowAudioOptionsSheet: () => {},
    setShowChapterActionsSheet: () => {},
  });
  view.flushEffects();
  const sharing = view.result.handleShareFullChapterAudio();
  await started.promise;
  // Privacy lock and navigating back both tear down the reader while download runs.
  view.unmount();
  download.resolve(asset);
  await sharing;

  assert.deepEqual(shares, []);
  assert.deepEqual(alerts, []);
});

test('an unavailable audio trim module reports a recoverable error instead of rejecting the button handler', async () => {
  loadTrim = async () => {
    throw new Error('Native trim module unavailable');
  };
  const view = mountPortion();

  await assert.doesNotReject(() => view.result.handleConfirmAudioPortionShare());

  assert.equal(alerts.length, 1);
  assert.equal(view.rerender().isSharingAudioPortion, false);
  loadTrim = async () => trimDependencies;
  await view.result.handleConfirmAudioPortionShare();
  assert.deepEqual(shares, ['file:///clip.mp3'], 'the same draft can be retried');
});

test('a second confirmation while the audio trim module loads cannot trim and share twice', async () => {
  const loading = deferred<typeof trimDependencies>();
  loadTrim = () => loading.promise;
  const view = mountPortion();
  const first = view.result.handleConfirmAudioPortionShare();
  const second = view.result.handleConfirmAudioPortionShare();
  assert.equal(view.rerender().isSharingAudioPortion, true);
  loading.resolve(trimDependencies);
  await Promise.all([first, second]);

  assert.equal(trimCalls, 1);
  assert.deepEqual(shares, ['file:///clip.mp3']);
});

for (const available of [true, false]) {
  test(`full chapter sharing ${available ? 'shares the prepared file' : 'falls back to the chapter link'}`, async () => {
    sharingAvailable = available;
    const view = mountChapter();
    await view.result.handleShareFullChapterAudio();
    assert.deepEqual(shares, [available ? asset.uri : 'text']);
    assert.equal(view.rerender().pendingChapterAudioShareAction, null);
    assert.deepEqual(alerts, []);
  });

  test(`clip sharing ${available ? 'shares the trimmed file' : 'falls back to the chapter link'}`, async () => {
    sharingAvailable = available;
    const view = mountPortion();
    await view.result.handleConfirmAudioPortionShare();
    assert.deepEqual(shares, [available ? 'file:///clip.mp3' : 'text']);
    assert.equal((trimArguments[0]?.[1] as { startTime: number; endTime: number }).startTime, 0);
    assert.equal((trimArguments[0]?.[1] as { endTime: number }).endTime, 30_000);
    assert.equal(view.rerender().audioPortionShareDraft, null);
    assert.equal(view.result.isSharingAudioPortion, false);
    assert.deepEqual(alerts, []);
  });
}

test('portion preparation opens a validated draft with the chosen range', async () => {
  const writes: unknown[] = [];
  const view = mountChapter(writes);
  await view.result.handleShareAudioPortion();
  assert.deepEqual(writes, [
    [
      'draft',
      { sourceUri: asset.uri, fileExtension: 'mp3', mimeType: 'audio/mpeg', durationMs: 60_000 },
    ],
    ['start', 0],
    ['end', 30_000],
  ]);
  assert.deepEqual(shares, []);
  assert.equal(view.rerender().pendingChapterAudioShareAction, null);
});

test('same-tick chapter share presses prepare only one asset', async () => {
  const view = mountChapter();
  const first = view.result.handleShareFullChapterAudio();
  const second = view.result.handleShareAudioPortion();
  await Promise.all([first, second]);
  assert.equal(prepareCalls, 1);
  assert.deepEqual(shares, [asset.uri]);
});

for (const action of ['full', 'portion'] as const) {
  test(`a stale ${action} preparation failure leaves the new chapter request busy`, async () => {
    const previous = deferred<typeof asset>();
    const current = deferred<typeof asset>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    prepare = () => {
      if (prepareCalls === 1) {
        firstStarted.resolve();
        return previous.promise;
      }
      secondStarted.resolve();
      return current.promise;
    };
    const writes: unknown[] = [];
    const view = mountChapter(writes);
    const first =
      action === 'full'
        ? view.result.handleShareFullChapterAudio()
        : view.result.handleShareAudioPortion();
    await firstStarted.promise;
    view.rerender({ ...chapterInput(writes), chapter: 4 });
    view.flushEffects();
    const second = view.result.handleShareFullChapterAudio();
    await secondStarted.promise;
    previous.reject(new Error('old download failed'));
    await first;
    assert.deepEqual(alerts, []);
    assert.deepEqual(writes, []);
    assert.equal(view.rerender().pendingChapterAudioShareAction, 'full');
    current.resolve(asset);
    await second;
    assert.deepEqual(shares, [asset.uri]);
  });
}

test('a late clip trim failure after unmount has no alert or draft writes', async () => {
  const trimming = deferred<string>();
  const started = deferred<void>();
  trim = () => {
    started.resolve();
    return trimming.promise;
  };
  const view = mountPortion();
  const before = view.result.audioPortionShareDraft;
  const sharing = view.result.handleConfirmAudioPortionShare();
  await started.promise;
  view.unmount();
  trimming.reject(new Error('trim failed'));
  await sharing;
  assert.deepEqual(alerts, []);
  assert.deepEqual(shares, []);
  assert.equal(view.rerender().audioPortionShareDraft, before);
});

test('cancelling a draft while native dependencies load prevents trimming and sharing', async () => {
  const loading = deferred<typeof trimDependencies>();
  loadTrim = () => loading.promise;
  const view = mountPortion();
  const sharing = view.result.handleConfirmAudioPortionShare();
  view.result.setAudioPortionShareDraft(null);
  loading.resolve(trimDependencies);
  await sharing;
  assert.equal(trimCalls, 0);
  assert.deepEqual(shares, []);
  assert.equal(view.rerender().isSharingAudioPortion, false);
});

test('an old draft failure cannot clear the busy state of its replacement share', async () => {
  const previous = deferred<typeof trimDependencies>();
  const current = deferred<typeof trimDependencies>();
  let loads = 0;
  loadTrim = () => (++loads === 1 ? previous.promise : current.promise);
  const view = mountPortion();
  const first = view.result.handleConfirmAudioPortionShare();
  view.result.setAudioPortionShareDraft({ ...draft(), sourceUri: 'file:///replacement.mp3' });
  view.rerender();
  const second = view.result.handleConfirmAudioPortionShare();
  previous.reject(new Error('old module failure'));
  await first;
  assert.equal(view.rerender().isSharingAudioPortion, true);
  assert.deepEqual(alerts, []);
  current.resolve(trimDependencies);
  await second;
  assert.equal(trimArguments[0]?.[0], 'file:///replacement.mp3');
  assert.deepEqual(shares, ['file:///clip.mp3']);
});

test('translation replacement discards the existing draft and its pending trim', async () => {
  const loading = deferred<typeof trimDependencies>();
  loadTrim = () => loading.promise;
  const view = mountPortion();
  const sharing = view.result.handleConfirmAudioPortionShare();
  view.rerender({ ...portionInput(), currentTranslation: 'web' });
  view.flushEffects();
  loading.resolve(trimDependencies);
  await sharing;
  assert.equal(trimCalls, 0);
  assert.equal(view.rerender().audioPortionShareDraft, null);
  assert.deepEqual(shares, []);
});

test('a failed chapter preparation releases ownership for a normal retry', async () => {
  prepare = async () => {
    throw new Error('download failed');
  };
  const view = mountChapter();
  await view.result.handleShareFullChapterAudio();
  assert.equal(alerts.length, 1);
  assert.equal(view.rerender().pendingChapterAudioShareAction, null);
  prepare = async () => asset;
  await view.result.handleShareFullChapterAudio();
  assert.deepEqual(shares, [asset.uri]);
});

test('a completed clip trim after unmount cannot share or clear its draft', async () => {
  const trimming = deferred<string>();
  const started = deferred<void>();
  trim = () => {
    started.resolve();
    return trimming.promise;
  };
  const view = mountPortion();
  const before = view.result.audioPortionShareDraft;
  const sharing = view.result.handleConfirmAudioPortionShare();
  await started.promise;
  view.unmount();
  trimming.resolve('file:///old-clip.mp3');
  await sharing;
  assert.deepEqual(shares, []);
  assert.deepEqual(alerts, []);
  assert.equal(view.rerender().audioPortionShareDraft, before);
});

test('same-chapter translation replacement prevents a late full-chapter share', async () => {
  const download = deferred<typeof asset>();
  const started = deferred<void>();
  prepare = () => {
    started.resolve();
    return download.promise;
  };
  const view = mountChapter();
  const sharing = view.result.handleShareFullChapterAudio();
  await started.promise;
  view.rerender({ ...chapterInput(), currentTranslation: 'web' });
  view.flushEffects();
  download.resolve(asset);
  await sharing;
  assert.deepEqual(shares, []);
  assert.deepEqual(alerts, []);
});

test('unmount resolves a clip dismissal wait without presenting native sharing', async () => {
  platform.OS = 'ios';
  const view = mountPortion();
  const sharing = view.result.handleConfirmAudioPortionShare();
  await view.commit();
  assert.equal(view.rerender().audioPortionShareDraft, null, 'the clip modal is closing');
  assert.deepEqual(shares, []);
  view.unmount();
  await sharing;
  assert.deepEqual(shares, []);
});

test('unmount resolves a chooser dismissal wait without starting preparation', async () => {
  platform.OS = 'ios';
  const view = mountChapter();
  view.result.handleOpenChapterAudioShareSheet();
  view.rerender();
  const sharing = view.result.handleShareFullChapterAudio();
  view.unmount();
  await sharing;
  assert.equal(prepareCalls, 0);
  assert.deepEqual(shares, []);
});

test('previewing a clip from a paused player keeps the preview while playback starts', () => {
  const view = mountPortion();
  const toggles: string[] = [];
  const input = (status: 'paused' | 'loading' | 'playing') => ({
    ...portionInput(),
    status,
    togglePlayPause: async () => {
      toggles.push('toggle');
    },
  });
  view.rerender(input('paused'));
  view.flushEffects();

  view.result.handleToggleAudioPortionPreview();
  // Starting playback moves the player through "loading" before it reports "playing".
  view.rerender(input('loading'));
  view.flushEffects();
  assert.equal(view.rerender(input('loading')).isPreviewingAudioPortion, true);

  view.rerender(input('playing'));
  view.flushEffects();
  const playing = view.rerender(input('playing'));
  assert.equal(playing.isPreviewingAudioPortion, true);
  assert.equal(playing.isWatchingAudioPortionPreview, true, 'the end of the range is watched');
  assert.deepEqual(toggles, ['toggle']);

  // Pausing from outside the clip sheet still ends the preview.
  view.rerender(input('paused'));
  view.flushEffects();
  assert.equal(view.rerender(input('paused')).isPreviewingAudioPortion, false);
});
