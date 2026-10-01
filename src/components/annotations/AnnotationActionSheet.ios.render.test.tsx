import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentProps } from 'react';
import { act } from 'react-test-renderer';
import { mockBarrel } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';

// Platform.OS is read at render time, but one harness is one OS, so the iOS-only
// VoiceOver behaviour lives in its own file.
const harness = installRenderHarness(mock, { os: 'ios', insets: { top: 20, bottom: 0 } });
mockBarrel(mock, 'utils/index.ts', { real: ['hexWithAlpha'] });

type Props = ComponentProps<typeof import('./AnnotationActionSheet').AnnotationActionSheet>;

function sheetProps(overrides: Partial<Props> = {}): Props {
  const noop = () => {};
  return {
    visible: true,
    referenceLabel: 'John 3:16',
    selectedText: 'For God so loved the world',
    canAnnotate: true,
    activeHighlightColors: [],
    onCopy: noop,
    onShare: noop,
    onShareImage: noop,
    onShareAudio: noop,
    onHighlight: noop,
    onNote: noop,
    onRemoveHighlight: noop,
    onClose: noop,
    ...overrides,
  };
}

const isModal = (view: Awaited<ReturnType<typeof harness.render>>) =>
  view.queryAllByType('KeyboardAvoidingView').some((node) => node.props.accessibilityViewIsModal);

test('an open tray is a modal region, so VoiceOver stays off the verses behind it', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const view = await harness.render(<AnnotationActionSheet {...sheetProps()} />);
  await act(async () => {});

  assert.equal(isModal(view), true);
});

test('a closed tray is not modal, so the reader behind it stays reachable', async () => {
  const { AnnotationActionSheet } = await import('./AnnotationActionSheet');
  const view = await harness.render(<AnnotationActionSheet {...sheetProps({ visible: false })} />);
  await act(async () => {});

  assert.equal(isModal(view), false);
});
