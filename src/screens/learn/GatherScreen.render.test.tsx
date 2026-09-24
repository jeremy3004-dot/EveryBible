import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import {
  FOUNDATION_LESSON_TITLE_KEYS,
  FOUNDATION_TITLE_KEYS,
  gatherFoundations,
} from '../../data/gatherFoundations';
import {
  gatherWisdomCategories,
  WISDOM_CATEGORY_NAME_KEYS,
  WISDOM_TITLE_KEYS,
} from '../../data/gatherWisdom';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness, textContent, within } from '../../testing/render';
import {
  createFakeGatherStore,
  distinguishTranslatedCopy,
  drawsArtwork,
  mockSvgForCommonJs,
  renderedArtwork,
} from './gatherRenderFixtures';

const harness = installRenderHarness(mock, { skip: ['react-native-svg'] });
mockSvgForCommonJs(mock);
const gatherStore = createFakeGatherStore();
mockModule(mock, sourcePath('stores/gatherStore.ts'), { useGatherStore: gatherStore });

const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);
distinguishTranslatedCopy(harness.i18n, [
  ...Object.values(FOUNDATION_TITLE_KEYS),
  ...Object.values(FOUNDATION_LESSON_TITLE_KEYS),
  ...Object.values(WISDOM_TITLE_KEYS),
  ...Object.values(WISDOM_CATEGORY_NAME_KEYS),
  'gather.discoveryBibleStudy',
  'gather.title',
  'gather.foundations',
  'gather.wisdom',
  'gather.getStarted',
]);

const TOTAL_LESSONS = gatherFoundations.reduce((sum, f) => sum + f.lessons.length, 0);
const foundationTitle = (index: number) => t(FOUNDATION_TITLE_KEYS[gatherFoundations[index].id]);
const FOUNDATION_TITLES = gatherFoundations.map((_, index) => foundationTitle(index));
const lessonTitle = (lessonId: string) => t(FOUNDATION_LESSON_TITLE_KEYS[lessonId]);
const wisdomTitle = (wisdomId: string) => t(WISDOM_TITLE_KEYS[wisdomId]);
const categoryName = (categoryId: string) => t(WISDOM_CATEGORY_NAME_KEYS[categoryId]);
const getStarted = () => t('gather.getStarted');
const upNextEyebrow = (lesson: number, total: number) =>
  t('gather.upNextLesson', { lesson, total });

async function renderGather(completedLessons: Record<string, string[]> = {}) {
  gatherStore.setState({ completedLessons });
  const { GatherScreen } = await import('./GatherScreen');
  return harness.render(<GatherScreen />);
}

async function lightPalette() {
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  return createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
}

const lessonIds = (foundationIndex: number, count: number) =>
  gatherFoundations[foundationIndex].lessons.slice(0, count).map((lesson) => lesson.id);

type View = Awaited<ReturnType<typeof renderGather>>;

function upNextCard(view: View): ReactTestInstance {
  const upNextPrefix = t('gather.upNextLesson', { lesson: '', total: '' }).split('·')[0];
  const card = view.getAllByRole('button').find((node) =>
    within(node)
      .queryAllByType('Text')
      .some((text) => textContent(text).startsWith(upNextPrefix))
  );
  assert.ok(card, 'the up-next card is a button');
  return card;
}

/** The nearest host View that contains `node`. */
function enclosingView(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && (current.type as unknown) !== 'View') current = current.parent;
  assert.ok(current, 'the element sits inside a View');
  return current;
}

test('every visible label on the Gather home is translated copy, never a raw key', async () => {
  const view = await renderGather();

  assert.ok(view.getByText(t('gather.discoveryBibleStudy')));
  assert.ok(view.getByText(t('gather.title')));
  assert.ok(
    view.getByText(
      t('gather.foundationsSummary', {
        foundations: gatherFoundations.length,
        lessons: TOTAL_LESSONS,
      })
    )
  );
  assert.ok(view.getByRole('button', { name: getStarted() }));
  assert.ok(view.getByRole('tab', { name: t('gather.foundations') }));
  assert.ok(view.getByRole('tab', { name: t('gather.wisdom') }));
  for (const title of FOUNDATION_TITLES) {
    assert.ok(view.getByRole('button', { name: title }));
  }

  const rawKeys = view
    .queryAllByType('Text')
    .map((node) => textContent(node))
    .filter((text) => /\b(gather|home|common)\.[a-zA-Z]/.test(text));
  assert.deepEqual(rawKeys, []);
});

// At the largest text size the switch took the whole header row, so the title
// column beside it collapsed to nothing and "Gather" vanished.
test('at large text the switch drops under the title instead of squeezing it out', async () => {
  const header = (view: View) => enclosingView(view.getByRole('tablist'));

  const regular = await renderGather();
  assert.equal(flattenStyle(header(regular).props.style)?.flexDirection, 'row');
  await regular.unmount();

  harness.setFontScale(3);
  const large = await renderGather();
  const largeHeader = flattenStyle(header(large).props.style);
  assert.equal(largeHeader?.flexDirection, 'column');
  assert.equal(largeHeader?.alignItems, 'flex-start');
  const titles = enclosingView(large.getByRole('header', { name: t('gather.title') }));
  const titleStyle = flattenStyle(titles.props.style);
  assert.equal(titleStyle?.alignSelf, 'stretch');
  assert.notEqual(titleStyle?.flex, 1, 'no zero flex basis in an auto-height column');
});

test('the sub-tabs are one shared tablist that swaps the foundations path for the wisdom library', async () => {
  const view = await renderGather();

  assert.equal(view.getAllByRole('tablist').length, 1);
  assert.ok(view.getByRole('tablist', { name: t('gather.title') }));
  assert.equal(view.getAllByRole('tab').length, 2);
  assert.ok(view.getByRole('tab', { name: t('gather.foundations'), selected: true }));
  assert.ok(view.getByRole('tab', { name: t('gather.wisdom'), selected: false }));
  assert.ok(view.getByRole('button', { name: foundationTitle(0) }));

  await view.press(view.getByRole('tab', { name: t('gather.wisdom') }));

  assert.ok(view.getByRole('tab', { name: t('gather.wisdom'), selected: true }));
  assert.ok(view.getByRole('tab', { name: t('gather.foundations'), selected: false }));
  assert.ok(view.getByText(categoryName('category-truth')));
  assert.ok(view.getByRole('button', { name: wisdomTitle('topic-courage') }));
  assert.equal(view.queryByRole('button', { name: foundationTitle(0) }), null);
  assert.equal(view.queryByRole('button', { name: getStarted() }), null);

  await view.press(view.getByRole('tab', { name: t('gather.foundations') }));
  assert.ok(view.getByRole('button', { name: foundationTitle(0) }));
  assert.equal(view.queryByRole('button', { name: wisdomTitle('topic-courage') }), null);
});

test('the wisdom library lists every category, translated, with every topic under it', async () => {
  // Progress counts only lessons the topic still has, so use two of its real ids.
  const courage = gatherWisdomCategories
    .flatMap((category) => category.wisdoms)
    .find((wisdom) => wisdom.id === 'topic-courage');
  assert.ok(courage);
  const view = await renderGather({
    'topic-courage': [...courage.lessons.slice(0, 2).map((lesson) => lesson.id), 'retired-id'],
  });
  await view.press(view.getByRole('tab', { name: t('gather.wisdom') }));

  for (const category of gatherWisdomCategories) {
    const header = enclosingView(view.getByText(categoryName(category.id)));
    const lessons = category.wisdoms.reduce((sum, wisdom) => sum + wisdom.lessonCount, 0);
    const completed = category.id === 'category-truth' ? 2 : 0;
    assert.ok(
      within(header).getByText(t('gather.lessonsProgress', { completed, total: lessons })),
      `${category.id} header counts its lessons`
    );
    for (const wisdom of category.wisdoms) {
      const done = wisdom.id === 'topic-courage' ? 2 : 0;
      const row = view.getByRole('button', { name: wisdomTitle(wisdom.id) });
      assert.deepEqual(row.props.accessibilityValue, {
        text: t('gather.lessonsProgress', { completed: done, total: wisdom.lessonCount }),
      });
    }
  }
});

test('foundation rows and wisdom rows both open FoundationDetail for the row pressed', async () => {
  const view = await renderGather();

  await view.press(view.getByRole('button', { name: foundationTitle(2) }));
  await view.press(view.getByRole('tab', { name: t('gather.wisdom') }));
  await view.press(view.getByRole('button', { name: wisdomTitle('topic-courage') }));

  assert.deepEqual(harness.navigation.calls, [
    { method: 'navigate', args: ['FoundationDetail', { foundationId: 'foundation-3' }] },
    { method: 'navigate', args: ['FoundationDetail', { foundationId: 'topic-courage' }] },
  ]);
});

test('up next resumes the first lesson not yet completed, straight into the lesson', async () => {
  const view = await renderGather({
    'foundation-1': lessonIds(0, gatherFoundations[0].lessons.length),
    'foundation-2': lessonIds(1, 1),
  });
  const next = gatherFoundations[1].lessons[1];

  assert.ok(view.getByText(upNextEyebrow(2, gatherFoundations[1].lessons.length)));
  assert.ok(view.getByText(lessonTitle(next.id)));
  assert.ok(
    view.getByText(
      t('gather.upNextSubtitle', { reference: next.referenceLabel, parent: foundationTitle(1) })
    )
  );

  await view.press(view.getByRole('button', { name: lessonTitle(next.id) }));
  await view.press(view.getByRole('button', { name: getStarted() }));

  const expected = {
    method: 'navigate',
    args: [
      'LessonDetail',
      { parentId: 'foundation-2', lessonId: next.id, parentType: 'foundation' },
    ],
  };
  assert.deepEqual(harness.navigation.calls, [expected, expected]);
});

test('a brand-new reader is sent to the very first lesson', async () => {
  const view = await renderGather();

  assert.ok(view.getByText(upNextEyebrow(1, gatherFoundations[0].lessons.length)));
  await view.press(view.getByRole('button', { name: getStarted() }));
  assert.deepEqual(harness.navigation.calls[0].args, [
    'LessonDetail',
    { parentId: 'foundation-1', lessonId: 'f1-01', parentType: 'foundation' },
  ]);
});

test('completing a lesson elsewhere moves up next and the row count while Gather stays mounted', async () => {
  const view = await renderGather();
  const total = gatherFoundations[0].lessons.length;
  const first = gatherFoundations[0].lessons[0];
  const second = gatherFoundations[0].lessons[1];

  await act(async () => {
    gatherStore.getState().markLessonComplete('foundation-1', first.id);
  });

  assert.ok(view.getByText(upNextEyebrow(2, total)));
  assert.ok(view.getByRole('button', { name: lessonTitle(second.id) }));
  assert.equal(view.queryByRole('button', { name: lessonTitle(first.id) }), null);
  assert.deepEqual(
    view.getByRole('button', { name: foundationTitle(0) }).props.accessibilityValue,
    {
      text: t('gather.lessonsProgress', { completed: 1, total }),
    }
  );
});

test('once every foundation lesson is complete there is no up-next card to resume', async () => {
  const everything = Object.fromEntries(
    gatherFoundations.map((f) => [f.id, f.lessons.map((lesson) => lesson.id)])
  );
  const view = await renderGather(everything);

  const upNextPrefix = t('gather.upNextLesson', { lesson: '', total: '' }).split('·')[0];
  assert.equal(
    view.queryAllByType('Text').filter((node) => textContent(node).startsWith(upNextPrefix)).length,
    0
  );
  assert.equal(view.queryByRole('button', { name: getStarted() }), null);
});

test('the up-next card carries the accent rule that marks where you are', async () => {
  const colors = await lightPalette();
  const view = await renderGather();

  const rule = upNextCard(view)
    .findAll((node) => (node.type as unknown) === 'View')
    .find(
      (node) =>
        node.props.pointerEvents === 'none' &&
        flattenStyle(node.props.style)?.backgroundColor === colors.accentPrimary
    );
  assert.ok(rule, 'an accent-coloured rule is drawn inside the up-next card');
});

test('the foundations path is numbered 01-07 and no row gets a tinted card background', async () => {
  const view = await renderGather();

  for (const foundation of gatherFoundations) {
    assert.ok(view.getByText(String(foundation.number).padStart(2, '0')));
  }
  for (const title of FOUNDATION_TITLES) {
    const background = flattenStyle(
      view.getByRole('button', { name: title }).props.style
    )?.backgroundColor;
    assert.equal(background, undefined, `${title} row is not tinted`);
  }
});

test('each path row reads its progress aloud and fills a lesson ledger instead of a ring', async () => {
  const colors = await lightPalette();
  const view = await renderGather({ 'foundation-1': lessonIds(0, 3) });
  const total = gatherFoundations[0].lessons.length;
  const ledgerColours = (row: ReactTestInstance) =>
    row
      .findAll((node) => (node.type as unknown) === 'View')
      .map((node) => flattenStyle(node.props.style)?.backgroundColor)
      .filter((color) => color === colors.accentPrimary || color === colors.borderStrong);

  const started = view.getByRole('button', { name: foundationTitle(0) });
  assert.deepEqual(started.props.accessibilityValue, {
    text: t('gather.lessonsProgress', { completed: 3, total }),
  });
  const cells = ledgerColours(started);
  assert.equal(cells.length, total, 'one ledger cell per lesson');
  assert.equal(cells.filter((color) => color === colors.accentPrimary).length, 3);

  const untouched = view.getByRole('button', { name: foundationTitle(2) });
  assert.deepEqual(untouched.props.accessibilityValue, {
    text: t('gather.lessonsProgress', {
      completed: 0,
      total: gatherFoundations[2].lessons.length,
    }),
  });
  assert.deepEqual(ledgerColours(untouched), [colors.borderStrong], 'one unbroken bar');

  assert.equal(view.queryAllByRole('progressbar').length, 0);
  assert.equal(view.queryAllByType('Svg.Circle').length, 0);
});

test('path rows press down with a small translate, never a scale-down', async () => {
  const view = await renderGather();
  const row = view.getByRole('button', { name: foundationTitle(0) });

  const transform = flattenStyle(row.props.style)?.transform as Record<string, number>[];
  assert.ok(transform.some((entry) => 'translateY' in entry));
  assert.ok(!transform.some((entry) => 'scale' in entry));

  await view.press(row);
  assert.ok(harness.animations.length > 0);
  assert.ok(harness.animations.every((call) => call.kind === 'timing'));
});

test('each foundation row and the up-next card draw that foundation’s own artwork', async () => {
  const view = await renderGather();

  gatherFoundations.forEach((foundation, index) => {
    const artworkKey = foundation.iconImage;
    assert.ok(artworkKey, `${foundation.id} has artwork`);
    const row = view.getByRole('button', { name: FOUNDATION_TITLES[index] });
    assert.ok(drawsArtwork(row, artworkKey), `${foundation.id} row artwork`);
  });
  assert.ok(drawsArtwork(upNextCard(view), 'foundation-1'));
  assert.equal(view.queryAllByType('Icon').length, 0, 'no stock Ionicons stand in for artwork');
});

test('wisdom category headers and topic rows draw their own artwork', async () => {
  const view = await renderGather();
  await view.press(view.getByRole('tab', { name: t('gather.wisdom') }));

  for (const category of gatherWisdomCategories) {
    const header = enclosingView(view.getByText(categoryName(category.id)));
    assert.ok(category.iconImage, `${category.id} has artwork`);
    assert.ok(drawsArtwork(header, category.iconImage), `${category.id} header artwork`);
  }
  const innerLife = enclosingView(view.getByText(categoryName('category-truth')));
  assert.ok(renderedArtwork(innerLife)?.includes('preserveAspectRatio="xMidYMid meet"'));

  assert.ok(
    drawsArtwork(view.getByRole('button', { name: wisdomTitle('topic-courage') }), 'topic-courage')
  );
  assert.ok(
    drawsArtwork(
      view.getByRole('button', { name: wisdomTitle('topic-self-esteem') }),
      'topic-known-and-loved'
    )
  );
  assert.equal(view.queryAllByType('Icon').length, 0, 'no stock Ionicons stand in for artwork');
});

test('both paths leave room for the floating tab bar under their last row', async () => {
  const { useTabBarHeight } = await import('../../hooks/useTabBarHeight');
  const { Text } = harness.rn;
  function Probe() {
    return <Text testID="clearance">{String(useTabBarHeight().contentClearance)}</Text>;
  }
  const probe = await harness.render(<Probe />);
  const clearance = Number(textContent(probe.getByTestId('clearance')));
  assert.ok(clearance > 0);

  const view = await renderGather();
  const scrollPadding = () =>
    flattenStyle(view.queryAllByType('ScrollView')[0].props.contentContainerStyle)?.paddingBottom;
  assert.equal(scrollPadding(), clearance);

  await view.press(view.getByRole('tab', { name: t('gather.wisdom') }));
  assert.equal(scrollPadding(), clearance);
});
