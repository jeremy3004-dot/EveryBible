import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { hostAncestors } from '../../testing/render';
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
};
Object.assign(harness.rn.AccessibilityInfo, {
  isScreenReaderEnabled: () =>
    query.deferred
      ? new Promise<boolean>((resolve) => {
          query.pending = resolve;
        })
      : Promise.resolve(query.answer),
});

afterEach(() => {
  query.answer = true;
  query.pending = null;
  query.deferred = false;
});

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
