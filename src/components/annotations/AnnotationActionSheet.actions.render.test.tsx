import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import { act } from 'react-test-renderer';
import { mockBarrel } from '../../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../testing/render';

// What each control on the verse action sheet does: highlight colours, the
// action pills, the note composer, and closing.
const harness = installRenderHarness(mock, { os: 'ios' });
mockBarrel(mock, 'utils/index.ts', { real: ['hexWithAlpha'] });

const t = (key: string) => harness.i18n.t(key);

type Props = ComponentProps<typeof import('./AnnotationActionSheet').AnnotationActionSheet>;

const RED = '#D95B57';
const BLUE = '#4A90E2';

function recordingProps(overrides: Partial<Props> = {}) {
  const calls: string[] = [];
  // Pills hand their handler the press event; only a colour or note is recorded.
  const record = (name: string) => (value?: unknown) => {
    calls.push(typeof value === 'string' ? `${name}:${value}` : name);
  };
  const props: Props = {
    visible: true,
    referenceLabel: 'John 3:16',
    selectedText: 'For God so loved the world',
    canAnnotate: true,
    activeHighlightColors: [],
    onCopy: record('copy'),
    onShare: record('share'),
    onShareImage: record('shareImage'),
    onShareAudio: record('shareAudio'),
    onHighlight: record('highlight'),
    onNote: record('note'),
    onRemoveHighlight: record('removeHighlight'),
    onClose: record('close'),
    ...overrides,
  };
  return { props, calls };
}

async function renderSheet(overrides: Partial<Props> = {}) {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const { props, calls } = recordingProps(overrides);
  const view = await harness.render(<AnnotationActionSheet {...props} />);
  const rerender = (next: Partial<Props>) =>
    view.rerender(<AnnotationActionSheet {...props} {...next} />);
  return { view, calls, props, rerender };
}

type SheetView = Awaited<ReturnType<typeof renderSheet>>['view'];

const colorDot = (view: SheetView, id: string) =>
  view.getByRole('button', { name: t(`annotations.colors.${id}`) });

const sheetHeader = (view: SheetView) =>
  view.getByRole('header', { name: `${t('annotations.selected')}: John 3:16` });

/** The dot's visible circle, the view that springs larger once its colour is applied. */
const dotCircle = (dot: ReturnType<typeof colorDot>) => {
  const circle = within(dot)
    .queryAllByType('View')
    .find((node) => flattenStyle(node.props.style)?.borderRadius != null);
  assert.ok(circle, 'the dot draws a circle');
  return circle;
};

test('a closed sheet draws no sheet, only its empty overlay that lets touches through', async () => {
  const { view } = await renderSheet({ visible: false });

  assert.equal(view.queryByRole('header'), null);
  assert.equal(view.queryAllByType('Pressable').length, 0);
  const [overlay] = view.queryAllByType('KeyboardAvoidingView');
  assert.equal(overlay.props.pointerEvents, 'box-none');
});

// Apple's sheets title themselves with the thing itself, not a status label; the
// "Selected" context stays for VoiceOver, which cannot see the dashed underline.
test('the sheet is titled with the reference alone, and screen readers hear it as the selection', async () => {
  const { view } = await renderSheet();

  assert.ok(sheetHeader(view));
  assert.equal(view.getByText('John 3:16').props.accessibilityRole, 'header');
  assert.equal(view.queryByText(`${t('annotations.selected')}: John 3:16`), null);
});

// Tapping outside the sheet or the verse again closes it, and so does one close
// button (see AnnotationActionSheet.render.test.tsx). It does not drag, so it has no
// grab handle, and no separate Done button.
test('the sheet has one close button and no drag handle', async () => {
  const { view } = await renderSheet();

  assert.equal(view.queryByRole('button', { name: t('common.done') }), null);
  assert.equal(view.getAllByRole('button', { name: t('interface.close') }).length, 1);
  const handles = view
    .queryAllByType('View')
    .filter((node) => flattenStyle(node.props.style)?.height === 4);
  assert.deepEqual(handles, []);
});

test('the chapter audio action shows a short label but keeps its full name for screen readers', async () => {
  const { view } = await renderSheet();

  const audio = view.getByRole('button', { name: t('bible.shareChapterAudio') });
  assert.ok(within(audio).getByText(t('annotations.audio')));
  assert.equal(within(audio).queryByText(t('bible.shareChapterAudio')), null);
});

test('each action pill runs its own action', async () => {
  const { view, calls } = await renderSheet();

  for (const key of ['annotations.copy', 'groups.share', 'bible.shareVerseImage']) {
    await view.press(view.getByRole('button', { name: t(key) }));
  }
  await view.press(view.getByRole('button', { name: t('bible.shareChapterAudio') }));

  assert.deepEqual(calls, ['copy', 'share', 'shareImage', 'shareAudio']);
});

test('the five highlight colours apply their colour, and an applied one removes it', async () => {
  const { view, calls } = await renderSheet({ activeHighlightColors: [BLUE] });

  const blue = colorDot(view, 'blue');
  assert.deepEqual(blue.props.accessibilityState, { selected: true, disabled: false });
  assert.equal(within(blue).queryAllByType('Icon').length, 1, 'an applied colour shows its check');
  assert.deepEqual(colorDot(view, 'red').props.accessibilityState, {
    selected: false,
    disabled: false,
  });
  assert.equal(within(colorDot(view, 'red')).queryAllByType('Icon').length, 0);
  for (const id of ['yellow', 'orange', 'green']) assert.ok(colorDot(view, id));

  await view.press(colorDot(view, 'red'));
  await view.flush();
  await view.press(colorDot(view, 'blue'));
  await view.flush();

  assert.deepEqual(calls, [`highlight:${RED}`, `removeHighlight:${BLUE}`]);
});

test('picking a colour taps a selection haptic, and clearing one a softer tap', async () => {
  const { view } = await renderSheet({ activeHighlightColors: [BLUE] });

  await view.press(colorDot(view, 'red'));
  await view.flush();
  assert.deepEqual(harness.haptics, [{ kind: 'selection' }]);

  await view.press(colorDot(view, 'blue'));
  await view.flush();
  assert.deepEqual(harness.haptics, [{ kind: 'selection' }, { kind: 'impact', style: 'soft' }]);
});

test('a colour that cannot be applied gives no haptic', async () => {
  const { view } = await renderSheet({ canAnnotate: false });

  await view.press(colorDot(view, 'red'));
  assert.deepEqual(harness.haptics, []);
});

test('an applied colour springs a little larger and its check fades in', async () => {
  const { view } = await renderSheet({ activeHighlightColors: [BLUE] });

  const springs = harness.animations.filter((call) => call.kind === 'spring');
  assert.ok(
    springs.some((call) => Number(call.toValue) > 1),
    'the applied dot springs up past its resting size'
  );
  assert.ok(
    harness.animations.some((call) => call.kind === 'timing' && call.toValue === 1),
    'the check fades in'
  );
  const blue = flattenStyle(dotCircle(colorDot(view, 'blue')).props.style) ?? {};
  const red = flattenStyle(dotCircle(colorDot(view, 'red')).props.style) ?? {};
  assert.equal(blue.width, red.width, 'the dots share one size; only the scale grows');
});

test('with reduced motion an applied colour is sized and checked without animating', async () => {
  harness.setReduceMotion(true);
  await renderSheet({ activeHighlightColors: [BLUE] });

  assert.deepEqual(harness.animations, []);
});

test('the sheet rises with a spring and slides away when it closes', async () => {
  const { view } = await renderSheet();

  const surface = hostAncestors(sheetHeader(view)).find((node) => node.props.entering);
  assert.ok(surface, 'the sheet surface animates in');
  assert.equal(surface.props.entering.__layoutAnimation, 'SlideInDown');
  assert.equal(surface.props.exiting.__layoutAnimation, 'SlideOutDown');
});

// Reanimated animates only the outermost removed view, so the sheet surface must be
// what closing removes; removing its overlay too made the sheet vanish in one frame.
test('closing removes only the animated sheet, leaving its overlay in place', async () => {
  const { view, rerender } = await renderSheet();
  const [overlay] = view.queryAllByType('KeyboardAvoidingView');
  const surface = hostAncestors(sheetHeader(view)).find((node) => node.props.exiting);
  assert.ok(surface);
  assert.ok(hostAncestors(surface).includes(overlay), 'the sheet sits inside the overlay');

  await rerender({ visible: false });
  assert.equal(view.queryAllByType('KeyboardAvoidingView').length, 1, 'the overlay stays');
  assert.equal(view.queryByRole('header'), null, 'the sheet is gone');
});

test('with reduced motion the sheet fades in and out instead of sliding', async () => {
  harness.setReduceMotion(true);
  const { view } = await renderSheet();

  const surface = hostAncestors(sheetHeader(view)).find((node) => node.props.entering);
  assert.ok(surface);
  assert.equal(surface.props.entering.__layoutAnimation, 'FadeIn');
  assert.equal(surface.props.exiting.__layoutAnimation, 'FadeOut');
});

test('a second colour tap while one is still saving is ignored', async () => {
  let finish: () => void = () => {};
  const highlighted: string[] = [];
  const { view } = await renderSheet({
    onHighlight: (color) => {
      highlighted.push(color);
      return new Promise<void>((resolve) => (finish = resolve));
    },
  });

  await view.press(colorDot(view, 'red'));
  await view.press(colorDot(view, 'green'));
  assert.deepEqual(highlighted, [RED]);
  assert.equal(
    view.getByRole('button', { name: t('annotations.note') }).props.disabled,
    true,
    'Note waits for the save too'
  );

  await act(async () => finish());
  await view.press(colorDot(view, 'green'));
  assert.deepEqual(highlighted, [RED, '#6FBF7A']);
});

test('without permission to annotate, colours and Note are disabled but sharing still works', async () => {
  const { view, calls } = await renderSheet({ canAnnotate: false });

  const red = colorDot(view, 'red');
  assert.deepEqual(red.props.accessibilityState, { selected: false, disabled: true });
  await view.press(red);
  const note = view.getByRole('button', { name: t('annotations.note') });
  assert.equal(note.props.disabled, true);
  await view.press(note);
  assert.equal(view.queryByLabelText(t('annotations.noteHint')), null);

  await view.press(view.getByRole('button', { name: t('annotations.copy') }));
  assert.deepEqual(calls, ['copy']);
});

test('Note opens a composer under the verse preview, prefilled with the existing note', async () => {
  const { view } = await renderSheet({ existingNote: 'Remember this' });

  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  assert.ok(sheetHeader(view), 'the title still names the reference');
  assert.ok(view.getByText('For God so loved the world'));
  const input = view.getByLabelText(t('annotations.noteHint'));
  assert.equal(input.props.value, 'Remember this');
  assert.equal(input.props.autoFocus, true);
  assert.equal(input.props.maxLength, 1000);
  assert.equal(view.queryByRole('button', { name: t('annotations.copy') }), null);
});

test('Done saves the trimmed note and closes the sheet', async () => {
  const { view, calls } = await renderSheet();
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  await view.changeText(view.getByLabelText(t('annotations.noteHint')), '  Remember this  ');
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(calls, ['note:Remember this', 'close']);
});

test('Done on a blank note closes without saving', async () => {
  const { view, calls } = await renderSheet();
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  await view.changeText(view.getByLabelText(t('annotations.noteHint')), '   ');
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(calls, ['close']);
});

test('Done on a cleared existing note asks the reader to remove it', async () => {
  const { view, calls } = await renderSheet({ existingNote: 'Remember this' });
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  await view.changeText(view.getByLabelText(t('annotations.noteHint')), '  ');
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(calls, ['note:', 'close']);
});

test('Done on a note opened and left unchanged closes without saving it again', async () => {
  // A re-save marks the note edited now, moving it to the top of My Notes & Highlights.
  const { view, calls } = await renderSheet({ existingNote: 'Remember this' });
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();

  assert.deepEqual(calls, ['close']);
});

test('Cancel returns to the actions and keeps the draft for the next Note', async () => {
  const { view, calls } = await renderSheet();
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Draft');

  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  assert.ok(view.getByRole('button', { name: t('annotations.copy') }));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Draft');
  assert.deepEqual(calls, []);
});

test('escaping the sheet closes it and drops an unsaved draft', async () => {
  const { view, calls, rerender } = await renderSheet({ existingNote: 'Saved' });
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Unsaved');

  await view.fire(sheetHeader(view), 'onAccessibilityEscape');
  assert.deepEqual(calls, ['close']);
  assert.ok(view.getByRole('button', { name: t('annotations.copy') }), 'back to the actions');

  // The parent keeps the sheet up (for example, another verse was selected).
  await rerender({});
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Saved');
});

test('hiding and reopening the sheet starts fresh in the actions', async () => {
  const { view, rerender } = await renderSheet();
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Draft');

  await rerender({ visible: false });
  await rerender({ visible: true });

  assert.ok(view.getByRole('button', { name: t('annotations.copy') }));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, '');
});

test('the sheet leaves room for the home indicator below its controls', async () => {
  const { view } = await renderSheet({ bottomInset: 34 });

  const surface = view
    .queryAllByType('View')
    .find((node) => flattenStyle(node.props.style)?.maxHeight != null);
  assert.ok(surface);
  assert.equal(flattenStyle(surface.props.style)?.paddingBottom, 24 + 34);
});

// The Bible stays tappable around the sheet, so a selection can grow onto a verse
// that already has a note while the sheet is up. The field kept the note of the
// first selection (none), and Done then saved over the existing note unseen.
test('a note the selection gains while the sheet is open is the one Note shows', async () => {
  const { view, rerender } = await renderSheet();

  await rerender({ existingNote: 'Saved on verse 17' });
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Saved on verse 17');
});

test('a note arriving while one is being written does not overwrite the draft', async () => {
  const { view, rerender } = await renderSheet();
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Draft');

  await rerender({ existingNote: 'Saved on verse 17' });

  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Draft');
});

test('cancelling after selecting different verses does not carry the old draft into their Note', async () => {
  const { view, rerender } = await renderSheet();
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Draft for verse 16');
  await rerender({ referenceLabel: 'John 3:17', selectedText: 'For God did not send His Son' });

  await view.press(view.getByRole('button', { name: t('common.cancel') }));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));

  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, '');
});

test('a closed save cannot close or clear busy state for a newer save in the retained sheet', async () => {
  const pending: ((result: boolean) => void)[] = [];
  const { view, calls, rerender } = await renderSheet({
    onNote: () => new Promise<boolean>((resolve) => pending.push(resolve)),
  });
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'First draft');
  await view.press(view.getByRole('button', { name: t('common.done') }));

  await view.fire(sheetHeader(view), 'onAccessibilityEscape');
  await rerender({ referenceLabel: 'John 3:17', selectedText: 'Another verse' });
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'New draft');
  await view.press(view.getByRole('button', { name: t('common.done') }));
  assert.equal(pending.length, 2);

  await act(async () => pending[0]?.(true));
  assert.deepEqual(calls, ['close']);
  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'New draft');
  assert.equal(view.getByRole('button', { name: t('common.done') }).props.disabled, true);

  await act(async () => pending[1]?.(true));
  assert.deepEqual(calls, ['close', 'close']);
  assert.ok(view.getByRole('button', { name: t('annotations.copy') }));
});
