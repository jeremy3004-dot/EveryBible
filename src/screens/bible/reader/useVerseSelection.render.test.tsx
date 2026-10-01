import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockMmkvStorage, mockModule, mockPackage, sourcePath } from '../../../testing/mockModules';
import { installRenderHarness } from '../../../testing/render';
import type { Verse } from '../../../types';

mockMmkvStorage(mock);
const harness = installRenderHarness(mock);

const clipboard = { fail: false, copied: [] as string[] };
mockPackage(mock, 'expo-clipboard', {
  setStringAsync: async (text: string) => {
    if (clipboard.fail) throw new Error('clipboard unavailable');
    clipboard.copied.push(text);
    return true;
  },
});
const handledErrors: Array<{ scope: string; error: unknown }> = [];
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (scope: string, error: unknown) => handledErrors.push({ scope, error }),
});
mockModule(mock, sourcePath('services/annotations/annotationService.ts'), {
  getAnnotationsForChapter: async () => ({ success: true, data: [] }),
  softDeleteAnnotation: async () => ({ success: true }),
  subscribeToAnnotationChanges: () => () => {},
  upsertAnnotation: async () => ({ success: true }),
});

const alerts: unknown[][] = [];
const rnAlert = (harness.rn as { Alert?: { alert: (...args: unknown[]) => void } }).Alert;
assert.ok(rnAlert, 'the render harness provides Alert');
rnAlert.alert = (...args: unknown[]) => {
  alerts.push(args);
};
const rnShare = harness.rn.Share as { share: (content: unknown) => Promise<unknown> };

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
process.on('unhandledRejection', onUnhandled);

afterEach(() => {
  clipboard.fail = false;
  clipboard.copied.length = 0;
  handledErrors.length = 0;
  alerts.length = 0;
  unhandled.length = 0;
});

const VERSES: Verse[] = [
  { id: 43_003_016, bookId: 'JHN', chapter: 3, verse: 16, text: 'For God so loved the world.' },
];

async function mountSelection() {
  const { useVerseSelection } = await import('./useVerseSelection');
  const box: { result?: ReturnType<typeof useVerseSelection> } = {};
  const capture = (result: ReturnType<typeof useVerseSelection>) => {
    box.result = result;
  };
  const selectedVerses = [16];
  function Probe() {
    capture(
      useVerseSelection({
        annotations: [],
        bookId: 'JHN',
        chapter: 3,
        currentTranslation: 'bsb',
        dismissSelectedVerseSelection: () => {},
        isSharingVerseImage: false,
        isShowingRouteChapter: true,
        selectedVerses,
        setAnnotations: () => {},
        setIsSharingVerseImage: () => {},
        setSelectedVerseImageBackgroundIndex: () => {},
        setSelectedVerses: () => {},
        setShowVerseImageSheet: () => {},
        translationShareLabel: 'BSB',
        verseImageSharePreviewRef: { current: null },
        verses: VERSES,
      })
    );
    return null;
  }
  const view = await harness.render(<Probe />);
  const selection = box.result;
  assert.ok(selection);
  return { selection, view };
}

async function settleRejections(view: { flush: () => Promise<void> }) {
  await view.flush();
  await new Promise((resolve) => setImmediate(resolve));
}

test('a clipboard failure while copying verses is reported instead of left unhandled', async () => {
  const { selection, view } = await mountSelection();
  clipboard.fail = true;

  void selection.handleCopySelectedVerses();
  await settleRejections(view);

  assert.deepEqual(unhandled, []);
  assert.equal(handledErrors.length, 1);
  assert.equal(handledErrors[0]?.scope, 'reader.copyVerses');
  assert.equal(alerts.length, 1);
});

test('a failing share sheet is reported instead of left unhandled', async () => {
  const { selection, view } = await mountSelection();
  const originalShare = rnShare.share;
  rnShare.share = async () => {
    throw new Error('share unavailable');
  };
  try {
    void selection.handleShareSelectedVerses();
    await settleRejections(view);
  } finally {
    rnShare.share = originalShare;
  }

  assert.deepEqual(unhandled, []);
  assert.equal(handledErrors.length, 1);
  assert.equal(handledErrors[0]?.scope, 'reader.shareVerses');
  assert.equal(alerts.length, 1);
});

test('copying verses still reaches the clipboard when nothing fails', async () => {
  const { selection, view } = await mountSelection();

  await selection.handleCopySelectedVerses();
  await settleRejections(view);

  assert.equal(clipboard.copied.length, 1);
  assert.match(clipboard.copied[0] ?? '', /For God so loved the world\./);
  assert.deepEqual(unhandled, []);
  assert.deepEqual(handledErrors, []);
  assert.deepEqual(alerts, []);
});
