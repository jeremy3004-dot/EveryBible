import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { useEffect } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { flattenStyle, hostAncestors, isHiddenFromAccessibility } from '../../testing/render';
import { installReaderRenderFixture, JOHN_3 } from './BibleReaderScreen.renderFixture';

// With VoiceOver or TalkBack on, scrolling (a three-finger swipe) must not slide the
// reader's Back/Search chrome and the tab bar away: those controls would vanish from
// the screen reader's swipe order mid-chapter.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, scrollReader } = reader;

const screenReader = { enabled: false, listeners: new Set<(enabled: boolean) => void>() };
const accessibilityInfo = harness.rn.AccessibilityInfo;
const stockAccessibilityInfo = { ...accessibilityInfo };
Object.assign(accessibilityInfo, {
  isScreenReaderEnabled: async () => screenReader.enabled,
  addEventListener: (event: string, listener: (enabled: boolean) => void) => {
    if (event !== 'screenReaderChanged') return stockAccessibilityInfo.addEventListener();
    screenReader.listeners.add(listener);
    return { remove: () => screenReader.listeners.delete(listener) };
  },
});

afterEach(() => {
  screenReader.enabled = false;
  screenReader.listeners.clear();
});

async function setScreenReader(enabled: boolean) {
  screenReader.enabled = enabled;
  await act(async () => {
    for (const listener of screenReader.listeners) listener(enabled);
  });
}

/** Reads the shared (root tab bar) collapse value the reader publishes to. */
async function tabBarProgress() {
  const { useReaderChromeProgress } = await import('../../stores/readerChromeStore');
  const values: { progress?: SharedValue<number> } = {};
  function Probe() {
    const progress = useReaderChromeProgress();
    useEffect(() => {
      values.progress = progress;
    });
    return null;
  }
  await harness.render(<Probe />);
  assert.ok(values.progress);
  return values.progress;
}

type View = Awaited<ReturnType<typeof renderReader>>;

function assertChromeExpanded(view: View) {
  const chrome = reader.topChrome(view);
  assert.equal(flattenStyle(chrome.props.style)?.opacity, 1);
  assert.notEqual(chrome.props.pointerEvents, 'none');
  assert.equal(isHiddenFromAccessibility(chrome), false);
}

test('with a screen reader on, scrolling keeps the top chrome and the tab bar expanded', async () => {
  screenReader.enabled = true;
  const progress = await tabBarProgress();
  const view = await renderReader();
  await view.flush();

  await scrollReader(view, 400);
  await scrollReader(view, 900);

  assertChromeExpanded(view);
  assert.equal(progress.value, 0, 'the root tab bar stays up');
});

test('turning a screen reader on brings collapsed chrome back, and off lets scrolling collapse it again', async () => {
  const progress = await tabBarProgress();
  const view = await renderReader();

  await scrollReader(view, 400);
  assert.equal(flattenStyle(reader.topChrome(view).props.style)?.opacity, 0);
  assert.equal(progress.value, 1);

  await setScreenReader(true);
  assertChromeExpanded(view);
  assert.equal(progress.value, 0);
  await scrollReader(view, 900);
  assertChromeExpanded(view);

  await setScreenReader(false);
  await scrollReader(view, 1400);
  assert.equal(flattenStyle(reader.topChrome(view).props.style)?.opacity, 0);
  assert.equal(progress.value, 1);
});

// ---- Verse selection ----------------------------------------------------------------

// A prose paragraph is one Text with a tappable span per verse, and a screen reader
// only lands on the whole paragraph: no verse could be picked to select or share.
const verseLabel = (verse: (typeof JOHN_3)[number]) => `${verse.verse}\u00A0${verse.text}`;

test('with a screen reader on, every verse of a prose paragraph is its own selectable button', async () => {
  screenReader.enabled = true;
  const view = await renderReader();
  await view.flush();

  const buttons = JOHN_3.map((verse) => view.getByRole('button', { name: verseLabel(verse) }));
  assert.equal(new Set(buttons).size, JOHN_3.length, 'one element per verse');
  for (const button of buttons) {
    assert.deepEqual(button.props.accessibilityState, { selected: false });
  }

  await view.press(buttons[1]);
  assert.ok(view.getByText(new RegExp(`${t('annotations.selected')}: John 3:2`)));
  assert.deepEqual(
    view.getByRole('button', { name: verseLabel(JOHN_3[1]) }).props.accessibilityState,
    { selected: true }
  );
  assert.deepEqual(
    view.getByRole('button', { name: verseLabel(JOHN_3[0]) }).props.accessibilityState,
    { selected: false }
  );
});

test('the paragraph goes back to one flowing Text when the screen reader turns off', async () => {
  screenReader.enabled = true;
  const view = await renderReader();
  await view.flush();
  assert.ok(view.getByRole('button', { name: verseLabel(JOHN_3[0]) }));

  await setScreenReader(false);
  assert.equal(view.queryByRole('button', { name: verseLabel(JOHN_3[0]) }), null);
  const spans = view
    .queryAllByType('Text')
    .filter((node) => typeof node.props.onPress === 'function');
  assert.equal(spans.length, JOHN_3.length, 'inline tappable spans');
  const [paragraph] = hostAncestors(spans[0]);
  assert.equal(paragraph.type, 'Text', 'inside one paragraph Text');
  assert.equal(hostAncestors(spans[1])[0], paragraph);
});
