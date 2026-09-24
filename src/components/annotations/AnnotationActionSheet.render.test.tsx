import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import { act } from 'react-test-renderer';
import { mockBarrel } from '../../testing/mockModules';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../testing/render';

// A small phone (iPhone SE: 375x667pt, 20pt status bar, no home indicator), the
// window where the sheet is likeliest to outgrow the screen at large text.
const WINDOW = { width: 375, height: 667 };
const harness = installRenderHarness(mock, {
  os: 'android',
  ...WINDOW,
  insets: { top: 20, bottom: 0 },
});
mockBarrel(mock, 'utils/index.ts', { real: ['hexWithAlpha'] });

const t = (key: string) => harness.i18n.t(key);

/** Deliver a hardware back press inside act; true when a handler consumed it. */
async function pressBack(): Promise<boolean> {
  let consumed = false;
  await act(async () => {
    consumed = harness.rn.BackHandler.press();
  });
  return consumed;
}

type Props = ComponentProps<typeof import('./AnnotationActionSheet').AnnotationActionSheet>;

function sheetProps(onClose: () => void, overrides: Partial<Props> = {}): Props {
  const noop = () => {};
  return {
    visible: true,
    referenceLabel: 'John 3:16',
    selectedText: 'For God so loved the world',
    canAnnotate: true,
    closeButtonAccessibilityLabel: 'Close verse actions',
    activeHighlightColors: [],
    onCopy: noop,
    onShare: noop,
    onShareImage: noop,
    onShareAudio: noop,
    onHighlight: noop,
    onNote: noop,
    onRemoveHighlight: noop,
    onClose,
    ...overrides,
  };
}

test('the Android back button closes the open sheet instead of leaving the reader', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  let closed = 0;
  const onClose = () => (closed += 1);
  const view = await harness.render(<AnnotationActionSheet {...sheetProps(onClose)} />);

  // Start a note so the close also has to reset the sheet.
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  assert.ok(view.getByLabelText(t('annotations.noteHint')));

  assert.equal(await pressBack(), true, 'the sheet consumes the back press');
  assert.equal(closed, 1);
  assert.equal(view.queryByLabelText(t('annotations.noteHint')), null, 'back to the actions');
});

test('once the sheet is hidden, the back button falls through to the reader again', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  let closed = 0;
  const onClose = () => (closed += 1);
  const view = await harness.render(<AnnotationActionSheet {...sheetProps(onClose)} />);

  await view.rerender(<AnnotationActionSheet {...sheetProps(onClose, { visible: false })} />);
  assert.equal(view.queryByRole('button', { name: 'Close verse actions' }), null);
  assert.equal(await pressBack(), false, 'the handler was removed');
  assert.equal(closed, 0);
});

test('opening and closing the sheet repeatedly leaves no back handlers behind', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const onClose = () => {};
  const baseline = harness.rn.BackHandler.listenerCount();
  const view = await harness.render(<AnnotationActionSheet {...sheetProps(onClose)} />);

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await view.rerender(<AnnotationActionSheet {...sheetProps(onClose, { visible: false })} />);
    await view.rerender(<AnnotationActionSheet {...sheetProps(onClose)} />);
    assert.equal(harness.rn.BackHandler.listenerCount(), baseline + 1);
  }
  await view.unmount();

  assert.equal(harness.rn.BackHandler.listenerCount(), baseline);
});

test('the sheet is drawn inline, not in a modal, so the Bible stays tappable around it', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const view = await harness.render(<AnnotationActionSheet {...sheetProps(() => {})} />);

  assert.equal(view.queryAllByType('Modal').length, 0);
  const [overlay] = view.queryAllByType('KeyboardAvoidingView');
  assert.equal(
    overlay.props.pointerEvents,
    'box-none',
    'touches outside the sheet reach the Bible'
  );
  assert.ok(view.getByRole('button', { name: 'Close verse actions' }));
});

// Unnamed, Android derives each pill's name from its children, and the Ionicons
// glyph is a private-use icon-font character: TalkBack got ", Note"
// (seen on the Android release build).
test('each verse action is named by its label alone, not by its icon glyph', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const view = await harness.render(<AnnotationActionSheet {...sheetProps(() => {})} />);

  for (const key of [
    'annotations.note',
    'annotations.copy',
    'groups.share',
    'bible.shareVerseImage',
    'bible.shareChapterAudio',
  ]) {
    const pill = view.getByRole('button', { name: t(key) });
    assert.equal(pill.props.accessibilityLabel, t(key), key);
  }
});

test('a wrapped sheet title stays clear of the close button pinned beside it', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const view = await harness.render(
    <AnnotationActionSheet
      {...sheetProps(() => {}, { referenceLabel: '1 Thessalonians 5:16-18' })}
    />
  );

  const close = view.getByRole('button', { name: 'Close verse actions' });
  const closeStyle =
    flattenStyle(
      typeof close.props.style === 'function'
        ? close.props.style({ pressed: false })
        : close.props.style
    ) ?? {};
  assert.equal(closeStyle.position, 'absolute');
  const title = view.getByText(`${t('annotations.selected')}: 1 Thessalonians 5:16-18`);
  const titleStyle = flattenStyle(title.props.style) ?? {};
  const inset = Number(titleStyle.paddingHorizontal ?? titleStyle.paddingRight ?? 0);
  assert.ok(
    inset >= Number(closeStyle.width) + Number(closeStyle.right ?? 0),
    `a ${inset}pt inset keeps a two-line title out from under the ${closeStyle.width}pt button`
  );
});

type View = Awaited<ReturnType<typeof harness.render>>;

const isScrollView = (node: ReactTestInstance) => (node.type as unknown) === 'ScrollView';
const scrollViewAbove = (node: ReactTestInstance) => hostAncestors(node).find(isScrollView);

/** The sheet surface: the view that carries the height cap, around the title. */
function sheetSurface(view: View, title: string) {
  const surface = hostAncestors(view.getByText(title)).find(
    (node) => flattenStyle(node.props.style)?.maxHeight != null
  );
  assert.ok(surface, 'the sheet surface bounds its height');
  return surface;
}

// Room left above an SE keyboard with its suggestion bar (216 + 44pt) and the status bar.
const ROOM_ABOVE_KEYBOARD = WINDOW.height - 20 - 260;

test('at large text on a small phone the sheet stays below the status bar and its actions scroll', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  harness.setFontScale(2);
  const view = await harness.render(<AnnotationActionSheet {...sheetProps(() => {})} />);

  // The overlay fills the reader, which draws under the status bar.
  const [overlay] = view.queryAllByType('KeyboardAvoidingView');
  assert.equal(flattenStyle(overlay.props.style)?.paddingTop, harness.insets.top);

  const title = `${t('annotations.selected')}: John 3:16`;
  const surface = sheetSurface(view, title);
  const style = flattenStyle(surface.props.style) ?? {};
  const maxHeight = Number(style.maxHeight);
  const available = WINDOW.height - harness.insets.top;
  assert.ok(maxHeight > available / 2 && maxHeight < available, `cap ${maxHeight}`);
  assert.equal(style.flexShrink, 1, 'the keyboard can squeeze the sheet further');

  // The colours and action pills scroll; the title and close button stay put.
  const scroll = scrollViewAbove(view.getByRole('button', { name: t('annotations.copy') }));
  assert.ok(scroll, 'the actions sit in a scroll view');
  assert.ok(hostAncestors(scroll).includes(surface));
  assert.ok(scrollViewAbove(view.getByRole('button', { name: t('annotations.colors.red') })));
  assert.equal(scrollViewAbove(view.getByText(title)), undefined, 'the title does not scroll');
  assert.equal(
    scrollViewAbove(view.getByRole('button', { name: 'Close verse actions' })),
    undefined,
    'the close button does not scroll'
  );
});

test('in note mode at large text the note field and Done stay pinned above the keyboard while the preview scrolls', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  harness.setFontScale(2);
  const notes: string[] = [];
  const view = await harness.render(
    <AnnotationActionSheet
      {...sheetProps(() => {}, {
        selectedText: 'For God so loved the world, that he gave his only Son. '.repeat(4),
        onNote: (text) => {
          notes.push(text);
        },
      })}
    />
  );
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  const surface = sheetSurface(view, `${t('annotations.selected')}: John 3:16`);
  const preview = scrollViewAbove(view.getByText(/^For God so loved/));
  assert.ok(preview, 'the verse preview scrolls');
  assert.ok(hostAncestors(preview).includes(surface));
  assert.equal(preview.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(flattenStyle(preview.props.style)?.flexShrink, 1, 'the preview gives up room first');

  const input = view.getByLabelText(t('annotations.noteHint'));
  const done = view.getByRole('button', { name: t('common.done') });
  for (const node of [input, done]) {
    assert.equal(scrollViewAbove(node), undefined, 'pinned, never scrolled out of reach');
    assert.ok(hostAncestors(node).includes(surface));
  }

  // A long note scrolls inside the field instead of pushing Done off the screen:
  // the field's cap plus Done fit in well under half the room above the keyboard.
  const inputStyle = flattenStyle(input.props.style) ?? {};
  const inputMaxHeight = Number(inputStyle.maxHeight);
  assert.ok(inputMaxHeight >= Number(inputStyle.minHeight), `field cap ${inputMaxHeight}`);
  const doneStyle =
    flattenStyle(
      typeof done.props.style === 'function'
        ? done.props.style({ pressed: false })
        : done.props.style
    ) ?? {};
  assert.ok(
    inputMaxHeight + Number(doneStyle.minHeight) < ROOM_ABOVE_KEYBOARD / 2,
    `${inputMaxHeight} + ${doneStyle.minHeight} fits above the keyboard`
  );

  await view.changeText(input, 'Remember this.');
  await view.press(done);
  assert.deepEqual(notes, ['Remember this.']);
});
