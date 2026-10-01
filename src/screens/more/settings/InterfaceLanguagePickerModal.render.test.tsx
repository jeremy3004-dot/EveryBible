import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../../testing/render';
import type { LanguageCode } from '../../../constants/languages';

const harness = installRenderHarness(mock);

async function renderPicker(currentLanguage: LanguageCode) {
  const { InterfaceLanguagePickerModal } = await import('./InterfaceLanguagePickerModal');
  return harness.render(
    <InterfaceLanguagePickerModal
      visible
      currentLanguage={currentLanguage}
      onSelect={() => {}}
      onClose={() => {}}
    />
  );
}

const SELECTED_ROW_TOP = 1180;

test('the list opens scrolled to the selected language, not at the top', async () => {
  const view = await renderPicker('ar');
  const row = view.getByRole('button', { name: /^العربية/, selected: true });

  await view.fire(row, 'onLayout', {
    nativeEvent: { layout: { x: 0, y: SELECTED_ROW_TOP, width: 300, height: 90 } },
  });

  const scrolls = harness.refCalls.filter((call) => call.method === 'scrollTo');
  assert.equal(scrolls.length, 1);
  const [options] = scrolls[0]?.args as [{ y: number; animated: boolean }];
  assert.equal(options.animated, false);
  assert.ok(options.y > 0 && options.y <= SELECTED_ROW_TOP, 'the chosen row is in view');
});

test('a list whose selected language is first has nothing to scroll past', async () => {
  const view = await renderPicker('en');
  const row = view.getByRole('button', { name: /^English/, selected: true });

  await view.fire(row, 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 90 } },
  });

  const [call] = harness.refCalls.filter((entry) => entry.method === 'scrollTo');
  assert.equal((call?.args[0] as { y: number } | undefined)?.y ?? 0, 0);
});
