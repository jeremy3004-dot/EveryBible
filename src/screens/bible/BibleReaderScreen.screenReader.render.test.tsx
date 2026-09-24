import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { useEffect } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { flattenStyle, isHiddenFromAccessibility } from '../../testing/render';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// With VoiceOver or TalkBack on, scrolling (a three-finger swipe) must not slide the
// reader's Back/Search chrome and the tab bar away: those controls would vanish from
// the screen reader's swipe order mid-chapter.
const reader = installReaderRenderFixture(mock);
const { harness, renderReader, scrollReader } = reader;

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
