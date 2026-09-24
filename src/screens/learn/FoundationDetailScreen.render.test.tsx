import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import type { FoundationDetailScreenProps } from '../../navigation/types';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness, within } from '../../testing/render';
import { FOUNDATION_DESC_KEYS, FOUNDATION_TITLE_KEYS } from '../../data/gatherFoundations';
import { WISDOM_TITLE_KEYS } from '../../data/gatherWisdom';
import {
  createFakeGatherStore,
  distinguishTranslatedCopy,
  drawsArtwork,
  mockSvgForCommonJs,
} from './gatherRenderFixtures';

const harness = installRenderHarness(mock, { skip: ['react-native-svg'] });
mockSvgForCommonJs(mock);
const gatherStore = createFakeGatherStore();
mockModule(mock, sourcePath('stores/gatherStore.ts'), { useGatherStore: gatherStore });
// The constants barrel reaches expo-constants through the translation catalog;
// these screens only need the translated book names.
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });
// The lesson sheet (audio, sharing, passages) has its own tests; this screen only opens it.
mockModule(mock, sourcePath('components/gather/LessonBottomSheet.tsx'), {
  LessonBottomSheet: () => null,
});

const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);
distinguishTranslatedCopy(harness.i18n, [
  ...Object.values(FOUNDATION_TITLE_KEYS),
  ...Object.values(FOUNDATION_DESC_KEYS),
  ...Object.values(WISDOM_TITLE_KEYS),
]);

async function renderFoundation(foundationId: string) {
  const { FoundationDetailScreen } = await import('./FoundationDetailScreen');
  const route = { key: 'foundation', name: 'FoundationDetail', params: { foundationId } };
  return harness.render(
    <FoundationDetailScreen
      navigation={
        harness.navigation.navigation as unknown as FoundationDetailScreenProps['navigation']
      }
      route={route as FoundationDetailScreenProps['route']}
    />
  );
}

/** The nearest host View that contains `node`. */
function enclosingView(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && (current.type as unknown) !== 'View') current = current.parent;
  assert.ok(current, 'the element sits inside a View');
  return current;
}

test('a foundation shows its whole description with no show-more or show-less toggle', async () => {
  const view = await renderFoundation('foundation-1');

  const description = view.getByText(t('gather.foundation1Desc'));
  assert.equal(description.props.numberOfLines, undefined, 'the description is never clamped');
  assert.equal(view.queryByText(t('gather.showMore')), null);
  assert.equal(view.queryByText(t('gather.showLess')), null);
  assert.equal(view.queryByRole('button', { name: /show (more|less)/i }), null);
});

test('the header bar grows by the top safe-area inset so the back button clears the cutout', async () => {
  const view = await renderFoundation('foundation-1');
  const back = view.getByRole('button', { name: t('common.back') });
  const header = flattenStyle(enclosingView(back).props.style);

  assert.equal(header?.paddingTop, harness.insets.top);
  // A floor, not a fixed height, so a large text size does not clip the title.
  assert.equal(header?.minHeight, 56 + harness.insets.top);
  assert.equal(header?.height, undefined);

  await view.press(back);
  assert.deepEqual(harness.navigation.calls, [{ method: 'goBack', args: [] }]);
});

test('an unknown foundation still offers a back button below the cutout', async () => {
  const view = await renderFoundation('foundation-missing');
  const back = view.getByRole('button', { name: t('common.back') });
  const bar = flattenStyle(back.props.style);

  assert.ok(view.getByText(t('common.error')));
  assert.equal(bar?.paddingTop, harness.insets.top);
  assert.equal(bar?.minHeight, 56 + harness.insets.top);
});

test('the header has no download action, and a trailing spacer keeps the title centred', async () => {
  const view = await renderFoundation('foundation-1');
  const back = view.getByRole('button', { name: t('common.back') });
  const header = enclosingView(back);

  assert.equal(
    view.queryAllByType('Icon').filter((icon) => icon.props.name === 'download-outline').length,
    0
  );
  const hosts = header.children.filter(
    (child): child is ReactTestInstance => typeof child !== 'string'
  );
  const title = view.getByRole('header', { name: t('gather.foundation1Title') });
  const [leading, middle, trailing] = hosts.map((child) =>
    typeof child.type === 'string'
      ? child
      : (child.find((node) => typeof node.type === 'string') as ReactTestInstance)
  );
  assert.equal(hosts.length, 3, 'back button, title, spacer');
  assert.equal(leading, back);
  assert.equal(middle, title);
  assert.equal(trailing.type as unknown, 'View');
  assert.equal(trailing.props.onPress, undefined, 'the spacer is not a control');
  assert.equal(flattenStyle(trailing.props.style)?.width, flattenStyle(back.props.style)?.width);
});

test('the hero and the up-next card draw the foundations’ own artwork, not a stock icon', async () => {
  const view = await renderFoundation('foundation-1');

  assert.ok(
    drawsArtwork(
      enclosingView(view.getByText(t('gather.foundationLabel', { number: 1 }))),
      'foundation-1'
    )
  );

  const upNext = view
    .getAllByRole('button')
    .find((node) => within(node).queryByText(t('gather.upNext')) !== null);
  assert.ok(upNext, 'the up-next card is a button');
  assert.ok(drawsArtwork(upNext, 'foundation-2'));

  await view.press(upNext);
  assert.deepEqual(harness.navigation.calls, [
    { method: 'push', args: ['FoundationDetail', { foundationId: 'foundation-2' }] },
  ]);
  assert.equal(
    view.queryAllByType('Icon').filter((icon) => icon.props.name === 'book-outline').length,
    0
  );
});

test('a wisdom topic draws its own artwork in the hero', async () => {
  const view = await renderFoundation('topic-courage');

  assert.ok(view.getByRole('header', { name: t('gather.topicCourage') }));
  assert.ok(drawsArtwork(view.root, 'topic-courage'));
});

test('the invitation is a first-person message naming the foundation, with a link to the app', async () => {
  const view = await renderFoundation('foundation-1');

  // The card's caption ("Invite someone…") speaks to the sender; the friend gets the invitation.
  await view.press(view.getByRole('button', { name: t('gather.gatherWithOthers') }));
  await view.flush();

  assert.deepEqual(harness.rn.__recorded.shares, [
    {
      message: `${t('gather.inviteShareMessage', { title: t('gather.foundation1Title') })}\nhttps://everybible.app`,
    },
  ]);
});

test('a wisdom topic invitation names the topic', async () => {
  harness.rn.__recorded.shares.length = 0;
  const view = await renderFoundation('topic-courage');

  await view.press(view.getByRole('button', { name: t('gather.gatherWithOthers') }));
  await view.flush();

  const [shared] = harness.rn.__recorded.shares as Array<{ message: string }>;
  assert.ok(shared?.message.includes(t('gather.topicCourage')));
});

test('the list ends clear of the floating tab bar so the up-next card is never hidden', async () => {
  const { TAB_BAR_CAPSULE_HEIGHT } = await import('../../hooks/useTabBarHeight');
  const view = await renderFoundation('foundation-1');

  const scrollView = view.root.findAll(
    (node) => (node.type as unknown) === 'ScrollView' && node.props.contentContainerStyle != null
  )[0];
  assert.ok(scrollView, 'the body scrolls');
  const { paddingBottom } = flattenStyle(scrollView.props.contentContainerStyle) as {
    paddingBottom?: number;
  };
  assert.ok(
    typeof paddingBottom === 'number' && paddingBottom > TAB_BAR_CAPSULE_HEIGHT,
    `bottom padding ${paddingBottom} must clear the ${TAB_BAR_CAPSULE_HEIGHT}pt tab bar`
  );
});
