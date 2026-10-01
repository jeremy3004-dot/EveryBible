import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { mockModule, mockReactNative } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
mockReactNative(mock, { os: 'ios' });

afterEach(() => runtime.unmountAll());

async function load() {
  const { useModalContentPresence } = await import('./useModalContentPresence');
  return useModalContentPresence;
}

test('a modal that has never been shown builds no content', async () => {
  const useModalContentPresence = await load();
  const view = runtime.mount(useModalContentPresence, false, undefined, 'ios');

  assert.equal(view.result.isContentPresent, false);
});

test('on iOS the content stays through the fade-out until the modal reports it is dismissed', async () => {
  const useModalContentPresence = await load();
  const dismissed: string[] = [];
  const onDismiss = () => dismissed.push('dismissed');
  const view = runtime.mount(useModalContentPresence, true, onDismiss, 'ios');
  assert.equal(view.result.isContentPresent, true);

  view.rerender(false, onDismiss, 'ios');
  assert.equal(view.result.isContentPresent, true, 'the closing frames still draw the sheet');

  view.result.handleDismiss();
  view.rerender(false, onDismiss, 'ios');
  assert.equal(view.result.isContentPresent, false);
  assert.deepEqual(dismissed, ['dismissed'], 'the caller still hears about the dismissal');
});

test('on Android the content goes as soon as the modal is hidden, which removes it at once', async () => {
  const useModalContentPresence = await load();
  const view = runtime.mount(useModalContentPresence, true, undefined, 'android');

  view.rerender(false, undefined, 'android');
  assert.equal(view.result.isContentPresent, false);
  view.rerender(false, undefined, 'android');
  assert.equal(view.result.isContentPresent, false);
});

test('reopening an iOS modal before it finished closing keeps its content', async () => {
  const useModalContentPresence = await load();
  const view = runtime.mount(useModalContentPresence, true, undefined, 'ios');

  view.rerender(false, undefined, 'ios');
  view.rerender(true, undefined, 'ios');
  assert.equal(view.result.isContentPresent, true);
  view.rerender(false, undefined, 'ios');
  assert.equal(view.result.isContentPresent, true);
});
