import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { hostAncestors } from '../../testing/render';
import {
  clearScreenReaderTrace,
  getScreenReaderTrace,
} from '../../services/diagnostics/screenReaderTrace';
import { installReaderRenderFixture, JOHN_3 } from './BibleReaderScreen.renderFixture';

// TalkBack on at a cold start. On Android `isScreenReaderEnabled()` answers with the
// native module's cached `isTouchExplorationEnabled`, over the bridge; on a busy cold
// start that answer can land after the chapter has already painted its prose paragraph
// as one flowing Text. The paragraph must still be redrawn as one button per verse.
const reader = installReaderRenderFixture(mock, { os: 'android' });
const { harness, renderReader } = reader;

const query = {
  answer: true,
  pending: null as ((enabled: boolean) => void) | null,
  deferred: false,
  listeners: new Set<(enabled: boolean) => void>(),
};
const stockAddEventListener = harness.rn.AccessibilityInfo.addEventListener;
Object.assign(harness.rn.AccessibilityInfo, {
  addEventListener: (event: string, listener: (enabled: boolean) => void) => {
    if (event !== 'screenReaderChanged') return stockAddEventListener();
    query.listeners.add(listener);
    return { remove: () => query.listeners.delete(listener) };
  },
  isScreenReaderEnabled: () =>
    query.deferred
      ? new Promise<boolean>((resolve) => {
          query.pending = resolve;
        })
      : Promise.resolve(query.answer),
});

// The diagnostics trace writes one logcat line per change; keep test output quiet.
mock.method(console, 'info', () => {});

afterEach(() => {
  clearScreenReaderTrace();
  query.answer = true;
  query.pending = null;
  query.deferred = false;
  query.listeners.clear();
});

/** What AccessibilityInfoModule emits as `touchExplorationDidChange`. */
async function emitTouchExploration(enabled: boolean) {
  await act(async () => {
    for (const listener of query.listeners) listener(enabled);
  });
}

const verseLabel = (verse: (typeof JOHN_3)[number]) => `${verse.verse}\u00A0${verse.text}`;

type View = Awaited<ReturnType<typeof renderReader>>;

function assertOneButtonPerVerse(view: View) {
  const buttons = JOHN_3.map((verse) => view.getByRole('button', { name: verseLabel(verse) }));
  assert.equal(new Set(buttons).size, JOHN_3.length, 'one accessible element per verse');
  for (const button of buttons) {
    assert.deepEqual(button.props.accessibilityState, { selected: false });
    assert.notEqual(hostAncestors(button)[0]?.type, 'Text', 'not a span inside the paragraph');
  }
}

function inlineSpans(view: View) {
  return view.queryAllByType('Text').filter((node) => typeof node.props.onPress === 'function');
}

test('android: TalkBack reported on at cold start draws every prose verse as its own button', async () => {
  const view = await renderReader();
  await view.flush();

  assertOneButtonPerVerse(view);
  assert.equal(inlineSpans(view).length, 0, 'no inline verse spans remain');
});

test('android: a TalkBack answer that lands after the first paint redraws the painted paragraph', async () => {
  query.deferred = true;
  const view = await renderReader();
  await view.flush();
  // Painted before the answer: the sighted layout, one Text with a span per verse.
  assert.equal(inlineSpans(view).length, JOHN_3.length);
  assert.equal(view.queryByRole('button', { name: verseLabel(JOHN_3[0]) }), null);
  assert.ok(query.pending, 'the reader asked whether a screen reader is running');

  await act(async () => {
    query.pending?.(true);
  });
  await view.flush();

  assertOneButtonPerVerse(view);
  assert.equal(inlineSpans(view).length, 0, 'no inline verse spans remain');
});

test('android: the diagnostics trace shows the TalkBack answer and the layout it produced', async () => {
  query.deferred = true;
  const view = await renderReader();
  await view.flush();
  await act(async () => {
    query.pending?.(true);
  });
  await view.flush();

  assert.deepEqual(
    getScreenReaderTrace().map((entry) =>
      entry.kind === 'signal'
        ? `signal:${entry.source}:${entry.enabled}`
        : `layout:${entry.layout}:virtualized=${entry.virtualized}:sr=${entry.screenReaderEnabled}`
    ),
    [
      'layout:inlineParagraphs:virtualized=true:sr=false',
      'signal:query:true',
      'layout:perVerse:virtualized=true:sr=true',
    ]
  );
});

// `adb shell uiautomator dump` connects UiAutomation without
// FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES, so TalkBack is unbound for the dump and
// touch exploration reads off, then on again once it disconnects. The reader follows
// that faithfully, which is why a dump shows the sighted paragraph: it is the
// suppressed state, not a reader that missed TalkBack.
test('android: touch exploration switched off and back on (a uiautomator dump) ends per verse', async () => {
  const view = await renderReader();
  await view.flush();
  assertOneButtonPerVerse(view);

  await emitTouchExploration(false);
  await view.flush();
  assert.equal(inlineSpans(view).length, JOHN_3.length, 'suppressed: the sighted paragraph');

  await emitTouchExploration(true);
  await view.flush();
  assertOneButtonPerVerse(view);
  assert.equal(inlineSpans(view).length, 0, 'no inline verse spans remain');
  assert.deepEqual(
    getScreenReaderTrace()
      .filter((entry) => entry.kind === 'signal')
      .map((entry) => `${entry.source}:${entry.enabled}`),
    ['query:true', 'event:false', 'event:true']
  );
});
