import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness, flattenStyle } from '../../../testing/render';
import { assertDefined } from '../../../utils/assertDefined';

const harness = installRenderHarness(mock);
const noop = () => {};

test('the top chrome row sits on an opaque themed backdrop that reaches the screen top', async () => {
  const { ReaderTopChrome } = await import('./ReaderTopChrome');
  const view = await harness.render(
    <ReaderTopChrome
      useAnimatedChrome={false}
      audioEnabled
      bookId="JHN"
      canShowTranslationSheet
      chapter={3}
      chapterFeedbackEnabled={false}
      compactBookName="John"
      handleExitPlanSession={noop}
      handleOpenBibleSearch={noop}
      handleOpenBookPicker={noop}
      handleOpenChapterFeedback={noop}
      handleOpenTranslationOptions={noop}
      isReadBottomChromeCollapsed={false}
      setShowAudioOptionsSheet={noop}
      setShowChapterActionsSheet={noop}
      setShowFontSizeSheet={noop}
      setShowTranslationSheet={noop}
      sharedTopChromeTop={59}
      showPlanSessionChrome={false}
      topChromeAnimatedStyle={{ opacity: 1, transform: [{ translateY: 0 }] }}
      translationLabel="BSB"
    />
  );

  const backdrop = view.getByTestId('reader-top-chrome-backdrop');
  const style = assertDefined(flattenStyle(backdrop.props.style), 'backdrop style');
  assert.equal(style.position, 'absolute');
  assert.equal(style.top, -59, 'covers the status bar area above the chips');
  assert.ok(typeof style.bottom === 'number' && style.bottom < 0, 'extends below the chips');
  assert.ok(typeof style.left === 'number' && style.left < 0, 'reaches the left edge');
  assert.ok(typeof style.right === 'number' && style.right < 0, 'reaches the right edge');
  assert.match(String(style.backgroundColor), /^#[0-9a-f]{6}$/i, 'opaque, not translucent');
  assert.equal(backdrop.props.pointerEvents, 'none', 'never swallows touches');
});
