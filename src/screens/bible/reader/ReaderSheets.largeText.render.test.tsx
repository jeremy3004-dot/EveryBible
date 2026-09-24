// The reader's chapter-actions and verse-image sheets at the largest accessibility text size:
// everything they offer has to stay reachable, so their content sits in a vertical scroll
// container inside a sheet that is capped to the screen.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { type ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

// iOS's largest accessibility size (AX5) scales body text by about 3.1.
const AX5_FONT_SCALE = 3.1;

const noop = () => {};
const noopAsync = async () => {};

function assertInside(scroll: ReactTestInstance, nodes: ReactTestInstance[]) {
  assert.ok(nodes.length > 0);
  for (const node of nodes) {
    assert.ok(hostAncestors(node).includes(scroll), 'every control is inside the scroll container');
  }
}

test('at AX5 every chapter action scrolls inside a sheet that stops at the screen edge', async () => {
  harness.setFontScale(AX5_FONT_SCALE);
  const { ChapterActionsSheet } = await import('./ChapterActionsSheet');
  const view = await harness.render(
    <ChapterActionsSheet
      bookId="GEN"
      chapter={1}
      canAdjustFontSize
      canShowTranslationSheet
      chapterFeedbackEnabled
      showInlineChapterFeedbackComposer={false}
      isFavorite={false}
      handleAddToPlaylist={noop}
      handleAddToQueue={noop}
      handleDownloadCurrentBookAudio={noopAsync}
      handleOpenChapterAudioShareSheet={noop}
      handleOpenChapterFeedback={noop}
      handleOpenFontSizeOptions={noop}
      handleOpenTranslationOptions={noop}
      handleShareChapter={noopAsync}
      handleToggleFavorite={noop}
      setShowChapterActionsSheet={noop}
      showChapterActionsSheet
    />
  );

  const scroll = view.getByTestId('chapter-actions-sheet-scroll');
  assert.equal(scroll.type, 'ScrollView');
  assert.equal(flattenStyle(scroll.props.style)?.flexGrow, 0, 'the sheet still hugs short content');
  const actions = within(scroll).getAllByRole('button');
  assert.equal(actions.length, 9);
  assertInside(scroll, [view.getByRole('header'), ...actions]);
  assert.ok(within(scroll).getByRole('button', { name: t('bible.shareChapterReference') }));

  const sheet = hostAncestors(scroll)[0];
  assert.equal(flattenStyle(sheet?.props.style)?.flexShrink, 1, 'the sheet shrinks to the screen');
});

test('at AX5 the verse image sheet scrolls its header, preview, backgrounds and buttons', async () => {
  harness.setFontScale(AX5_FONT_SCALE);
  const { VerseImageShareSheet } = await import('./VerseImageShareSheet');
  const previewRef = { current: null };
  const view = await harness.render(
    <VerseImageShareSheet
      handleSelectVerseImageBackground={noop}
      handleShareSelectedVerseImage={noopAsync}
      isSharingVerseImage={false}
      selectedVerseImageBackground={{ uri: 'background.png' }}
      selectedVerseImageBackgroundIndex={0}
      selectedVerseReferenceLabel="John 3:16"
      selectedVerseText="For God so loved the world"
      setShowVerseImageSheet={noop}
      showVerseImageSheet
      verseImageBackgroundCount={3}
      verseImageSharePreviewRef={previewRef}
    />
  );

  const scroll = view.getByTestId('verse-image-sheet-scroll');
  assert.equal(scroll.type, 'ScrollView');
  assert.notEqual(scroll.props.horizontal, true);
  assert.equal(flattenStyle(scroll.props.style)?.flexGrow, 0);
  assertInside(scroll, [
    view.getByRole('header'),
    view.getByRole('button', { name: t('interface.close') }),
    view.getByText(/For God so loved the world/),
    view.getByRole('button', { name: t('common.cancel') }),
    view.getByRole('button', { name: t('groups.share') }),
  ]);
});
