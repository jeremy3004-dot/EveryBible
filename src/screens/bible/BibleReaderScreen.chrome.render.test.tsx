import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import {
  flattenStyle,
  hostAncestors,
  isHiddenFromAccessibility,
  within,
} from '../../testing/render';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader's floating top chrome, its sheets and the read/listen layout frame.
const reader = installReaderRenderFixture(mock);
const { harness, t, renderReader, chapters } = reader;

const design = () => import('../../design/system');

type View = Awaited<ReturnType<typeof renderReader>>;

/** The top bar's action buttons, left to right. */
const topActionLabels = (view: View) =>
  within(reader.topChrome(view))
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel);

const iconNames = (node: ReactTestInstance) =>
  within(node)
    .queryAllByType('Icon')
    .map((icon) => icon.props.name);

const isOpenModal = (node: ReactTestInstance) => (node.type as string) === 'Modal';

/** The Modal host that contains `node`. */
function modalOf(node: ReactTestInstance): ReactTestInstance {
  let current: ReactTestInstance | null = node;
  while (current && !isOpenModal(current)) current = current.parent;
  assert.ok(current, 'inside a modal');
  return current;
}

// ---- Top chrome -----------------------------------------------------------------

test('the top chrome carries the reference pill, then audio, search and the overflow menu', async () => {
  const view = await renderReader();

  assert.deepEqual(topActionLabels(view), [
    'John 3',
    'BSB',
    t('audio.nowPlaying'),
    t('common.search'),
    t('bible.chapterOptions'),
  ]);
  assert.notEqual(
    t('bible.chapterOptions'),
    t('tabs.more'),
    'the overflow menu is not named like the More tab a screen reader also reaches'
  );
  assert.equal(view.queryAllByRole('button', { name: t('tabs.more') }).length, 0);
  assert.deepEqual(iconNames(reader.topChrome(view)), [
    'volume-medium-outline',
    'search',
    'ellipsis-horizontal',
  ]);
  // No legacy back arrow, header icon row, duplicate translation chip or glass blur.
  assert.equal(view.getAllByRole('button', { name: 'BSB' }).length, 1);
  assert.equal(view.queryAllByType('BlurView').length, 0);
  assert.equal(
    view.queryAllByType('Icon').filter((icon) => icon.props.name === 'arrow-back').length,
    0
  );
});

test('the reference pill opens the book picker and the translation segment the translation sheet', async () => {
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: 'John 3' }));
  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'push',
    args: ['BiblePicker', { initialBookId: 'JHN' }],
  });

  assert.equal(view.queryAllByType('TranslationPickerList').length, 0);
  await view.press(view.getByRole('button', { name: 'BSB' }));
  assert.equal(view.queryAllByType('TranslationPickerList').length, 1);
  assert.ok(view.getByText(t('bible.selectTranslation')));
});

test('a current translation missing from the list is labelled by its own id, not as BSB', async () => {
  // Only BSB itself gets the Berean label; any other id the store has no entry for
  // (a removed or not-yet-synced translation) is named by its id, as the browser does.
  reader.bibleStore.setState({ currentTranslation: 'kjv' });
  const view = await renderReader();

  assert.ok(view.getByRole('button', { name: 'KJV' }));
  assert.equal(view.queryByRole('button', { name: 'BSB' }), null);
});

test('search opens the Bible browser focused on searching the current book', async () => {
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('common.search') }));

  assert.deepEqual(harness.navigation.calls.at(-1), {
    method: 'navigate',
    args: ['BibleBrowser', { initialBookId: 'JHN', focusSearch: true }],
  });
});

test('the reference pill keeps a full touch target around its compact segments', async () => {
  const { layout } = await design();
  const view = await renderReader();

  const bookSegment = view.getByRole('button', { name: 'John 3' });
  const pill = bookSegment.parent?.parent;
  assert.ok(pill);
  const pillStyle = flattenStyle(pill.props.style) ?? {};
  assert.equal(pillStyle.height, layout.minTouchTarget);
  assert.equal(pillStyle.maxWidth, 212);
  const translationSegment = view.getByRole('button', { name: 'BSB' });
  assert.equal(flattenStyle(translationSegment.props.style)?.paddingHorizontal, 12);

  // The hairline between the segments is shorter than the pill and centred on it.
  const divider = within(pill)
    .queryAllByType('View')
    .find((node) => flattenStyle(node.props.style)?.height === 32);
  assert.ok(divider, 'divider');
  assert.equal(flattenStyle(divider.props.style)?.alignSelf, 'center');
});

test('the top chrome and the text start at the same offsets in read and listen', async () => {
  const { layout, spacing } = await design();
  const chromeTop = harness.insets.top + spacing.xs;
  const contentTop = chromeTop + layout.minTouchTarget + spacing.xl;

  const read = await renderReader();
  assert.equal(flattenStyle(reader.topChrome(read).props.style)?.top, chromeTop);
  assert.equal(
    flattenStyle(reader.readerList(read).props.contentContainerStyle)?.paddingTop,
    contentTop
  );
  await read.unmount();

  chapters.set('JHN:3', []); // audio-only: the listen player
  const listen = await renderReader();
  assert.equal(flattenStyle(reader.topChrome(listen).props.style)?.top, chromeTop);
  const [scroll] = listen.queryAllByType('ScrollView');
  assert.equal(flattenStyle(scroll.props.contentContainerStyle)?.paddingTop, contentTop);
});

test('read mode masks the status-bar strip above the floating chrome; listen mode does not', async () => {
  const { spacing } = await design();
  const isMask = (node: ReactTestInstance) => {
    const style = flattenStyle(node.props.style) ?? {};
    return node.props.pointerEvents === 'none' && style.position === 'absolute' && style.top === 0;
  };

  const read = await renderReader();
  const [mask] = read.queryAllByType('View').filter(isMask);
  assert.ok(mask, 'read mode draws a mask');
  const style = flattenStyle(mask.props.style) ?? {};
  assert.equal(style.height, harness.insets.top + spacing.xs);
  assert.equal(style.zIndex, 29, 'above the text, below the floating chrome');
  assert.equal(
    style.backgroundColor,
    flattenStyle(read.root.findAllByType('View' as never)[0].props.style)?.backgroundColor
  );
  await read.unmount();

  chapters.set('JHN:3', []);
  const listen = await renderReader();
  assert.equal(listen.queryAllByType('View').filter(isMask).length, 0);
});

/** The status-bar mask the reader draws only in read mode (see the test above). */
const readModeMasks = (view: View) =>
  view.queryAllByType('View').filter((node) => {
    const style = flattenStyle(node.props.style) ?? {};
    return node.props.pointerEvents === 'none' && style.position === 'absolute' && style.top === 0;
  });

test('stepping from a text chapter to an audio-only one in the same translation settles in listen mode', async () => {
  chapters.set('JHN:4', []); // this chapter has only audio
  const view = await renderReader();
  assert.equal(readModeMasks(view).length, 1, 'John 3 opens in read mode');

  await reader.navigateReader(view, { chapter: 4 });

  assert.equal(view.queryAllByType('FlatList').length, 0, 'the read list is gone');
  assert.equal(readModeMasks(view).length, 0, 'the listen page is in listen mode, not read mode');
});

test('stepping from an audio-only chapter to a text chapter returns to read mode', async () => {
  chapters.set('JHN:3', []);
  chapters.set('JHN:4', [verseOf(1, 'Jesus learned that the Pharisees had heard.', {}, 'JHN', 4)]);
  const view = await renderReader();
  assert.equal(readModeMasks(view).length, 0, 'the audio-only chapter opens in listen mode');

  await reader.navigateReader(view, { chapter: 4 });

  assert.ok(view.getByText(/Jesus learned that the Pharisees/));
  assert.equal(readModeMasks(view).length, 1, 'the text chapter is read in read mode');
});

// ---- Overflow menu and its sheets -------------------------------------------

test('the overflow menu names the chapter and offers fonts, translation and chapter actions', async () => {
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));

  const sheet = modalOf(view.getByRole('header', { name: 'John 3' }));
  assert.equal(sheet.props.statusBarTranslucent, true);
  const labels = within(sheet)
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel);
  assert.deepEqual(labels.slice(0, 2), [
    t('bible.readerFontsAndSettings'),
    t('bible.selectTranslation'),
  ]);
  assert.ok(labels.includes(t('bible.shareChapterAudio')));
});

test('fonts and settings opens a sheet with the size steppers, themes and all settings', async () => {
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  await view.press(view.getByRole('button', { name: t('bible.readerFontsAndSettings') }));

  const title = view.getByRole('header', { name: t('bible.fontsAndSettings') });
  const sheet = modalOf(title);
  assert.equal(sheet.props.statusBarTranslucent, true);
  assert.ok(within(sheet).getByRole('button', { name: t('learn.decreaseTextSize') }));
  assert.ok(within(sheet).getByRole('button', { name: t('learn.increaseTextSize') }));
  assert.ok(within(sheet).getByRole('button', { name: t('bible.allSettings') }));
  // The overflow sheet closed behind it.
  assert.equal(view.queryByRole('header', { name: 'John 3' }), null);
});

test('the reader text size steppers are one adjustable control that speaks the new size', async () => {
  harness.authStore.getState().setPreferences({ fontSize: 'medium' });
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  await view.press(view.getByRole('button', { name: t('bible.readerFontsAndSettings') }));

  const stepper = () => view.getByRole('adjustable', { name: t('settings.fontSize') });
  assert.deepEqual(stepper().props.accessibilityValue, { text: t('settings.fontSizeMedium') });
  await view.fire(stepper(), 'onAccessibilityAction', { nativeEvent: { actionName: 'increment' } });

  assert.equal(harness.authStore.getState().preferences.fontSize, 'large');
  assert.deepEqual(stepper().props.accessibilityValue, { text: t('settings.fontSizeLarge') });
});

test('the font sheet closes from its labelled backdrop and from the system back gesture', async () => {
  const openSheet = async (view: View) => {
    await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
    await view.press(view.getByRole('button', { name: t('bible.readerFontsAndSettings') }));
    return view.getByRole('header', { name: t('bible.fontsAndSettings') });
  };
  const view = await renderReader();

  // No visible Close button, so the backdrop is the way out and must be named.
  const title = await openSheet(view);
  const backdrop = within(modalOf(title)).getByRole('button', { name: t('interface.close') });
  await view.press(backdrop);
  assert.equal(view.queryByRole('header', { name: t('bible.fontsAndSettings') }), null);

  const again = await openSheet(view);
  await view.fire(modalOf(again), 'onRequestClose');
  assert.equal(view.queryByRole('header', { name: t('bible.fontsAndSettings') }), null);
});

test('translation selection from the overflow menu shows the shared picker in a fixed-height sheet', async () => {
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: t('bible.chapterOptions') }));
  await view.press(view.getByRole('button', { name: t('bible.selectTranslation') }));

  const [picker] = view.queryAllByType('TranslationPickerList');
  assert.ok(picker, 'the shared TranslationPickerList');
  const [body] = hostAncestors(picker);
  const style = flattenStyle(body.props.style) ?? {};
  assert.equal(style.height, '78%', 'a fixed body so the picker list has room to render');
  assert.equal(style.overflow, 'hidden');

  const close = within(body).getByRole('button', { name: t('interface.close') });
  assertCloseTarget(close);
  await view.press(close);
  assert.equal(view.queryAllByType('TranslationPickerList').length, 0);
});

// Release QA measured the close control at 22pt, the glyph's own size. The target
// grows to the 44pt floor while the 22pt glyph and the header height stay put.
function assertCloseTarget(close: ReactTestInstance) {
  const style = flattenStyle(close.props.style) ?? {};
  assert.equal(style.width, 44);
  assert.equal(style.height, 44);
  assert.equal(
    style.marginVertical,
    -11,
    'lays out at the glyph height, so the header is unchanged'
  );
  assert.equal(style.marginEnd, -11, 'the glyph keeps its place at the header edge');
  const [glyph] = within(close).queryAllByType('Icon');
  assert.equal(glyph.props.size, 22);
}

test('the translation sheet title caps its scaling so a word never breaks at AX sizes', async () => {
  const { DISPLAY_TEXT_MAX_FONT_SCALE } = await import('../../design/largeTextLayout');
  harness.setFontScale(3.12);
  const view = await renderReader();
  await view.press(view.getByRole('button', { name: 'BSB' }));

  const title = view.getByRole('header', { name: t('bible.selectTranslation') });
  assert.equal(title.props.maxFontSizeMultiplier, DISPLAY_TEXT_MAX_FONT_SCALE);
  assert.equal(flattenStyle(title.props.style)?.flexShrink, 1, 'wraps beside the close button');
});

// ---- Audio sheet ------------------------------------------------------------

test('the top audio button opens the Audio sheet, including chapter audio sharing', async () => {
  const view = await renderReader();

  await view.press(view.getByRole('button', { name: t('audio.nowPlaying') }));

  const sheet = modalOf(view.getByRole('header', { name: t('audio.sheetTitle') }));
  const controls = within(sheet);
  assert.deepEqual(
    controls.getAllByRole('header').map((header) => header.props.children),
    [
      t('audio.sheetTitle'),
      t('audio.soundSection'),
      t('audio.speed'),
      t('audio.sleepTimer'),
      t('audio.repeat'),
    ]
  );
  // It describes the chapter on screen, and carries no transport of its own.
  assert.ok(controls.getByText('John 3'));
  assert.equal(controls.queryByRole('button', { name: t('interface.playChapterAudio') }), null);

  // Sharing moves on to the chapter audio share sheet.
  await view.press(controls.getByRole('button', { name: t('bible.shareChapterAudio') }));
  assert.equal(view.queryByRole('header', { name: t('audio.sheetTitle') }), null);
  assert.ok(view.getByRole('button', { name: t('common.cancel') }));
});

// ---- Backdrops and the screen reader ------------------------------------------

test('sheet backdrops that duplicate a visible Close are hidden from the screen reader', async () => {
  const view = await renderReader();

  // Translation sheet.
  await view.press(view.getByRole('button', { name: 'BSB' }));
  const [picker] = view.queryAllByType('TranslationPickerList');
  const translationModal = modalOf(picker);
  const [translationBackdrop] = within(translationModal).queryAllByType('TouchableOpacity');
  assert.equal(translationBackdrop.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(isHiddenFromAccessibility(translationBackdrop), true);
  assert.equal(translationModal.props.statusBarTranslucent, true);
});

test('the chrome stays reachable while nothing has collapsed it', async () => {
  const view = await renderReader();

  const chrome = reader.topChrome(view);
  assert.equal(chrome.props.pointerEvents, 'box-none');
  assert.equal(isHiddenFromAccessibility(chrome), false);
});
