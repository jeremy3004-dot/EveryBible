import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import { act } from 'react-test-renderer';
import { mockBarrel } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock, { os: 'android' });
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
