import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { mockBarrel, mockModule, sourcePath } from '../../../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../../testing/render';

const harness = installRenderHarness(mock, { os: 'ios' });
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

const useBibleStore = create<{
  currentTranslation: string;
  translations: { id: string; name: string }[];
  setCurrentTranslation: (id: string) => void;
}>()(() => ({
  currentTranslation: 'bsb',
  translations: [{ id: 'bsb', name: 'Berean Standard Bible' }],
  setCurrentTranslation: () => {},
}));
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore });
mockBarrel(mock, 'services/feedback/index.ts', { real: ['resolveTranslatorCoverageOptions'] });

// iOS's largest accessibility size (AX5) scales body text by about 3.1.
const AX5_FONT_SCALE = 3.1;

test('at AX5 the passcode dialog scrolls its title, keypad and buttons inside a capped card', async () => {
  harness.setFontScale(AX5_FONT_SCALE);
  const { ParticipationAccessModal } = await import('./ParticipationAccessModal');
  const view = await harness.render(
    <ParticipationAccessModal
      visible
      kind="translator"
      passcode="12"
      error={null}
      coverage={null}
      isChecking={false}
      currentTranslation="bsb"
      onPressKey={() => {}}
      onClose={() => {}}
      onSubmit={() => {}}
    />
  );

  const scroll = view.getByTestId('participation-access-scroll');
  assert.equal(scroll.type, 'ScrollView');
  assert.equal(
    flattenStyle(scroll.props.style)?.flexGrow,
    0,
    'a short dialog still hugs its content'
  );
  const card = hostAncestors(scroll)[0];
  assert.equal(
    flattenStyle(card?.props.style)?.maxHeight,
    '90%',
    'the card stops short of the screen'
  );

  for (const node of [
    view.getByRole('header'),
    view.getByRole('button', { name: '1' }),
    view.getByRole('button', { name: '0' }),
    view.getByRole('button', { name: t('common.cancel') }),
    view.getByRole('button', { name: t('settings.translatorAccessUnlock') }),
  ]) {
    assert.ok(hostAncestors(node).includes(scroll), 'every control is inside the scroll container');
  }
});
