import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  hostAncestors,
  installRenderHarness,
  isHiddenFromAccessibility,
} from '../../../testing/render';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

async function renderBar(isCollapsed: boolean) {
  const { PlanSessionBottomBar } = await import('./PlanSessionBottomBar');
  const noop = async () => {};
  return harness.render(
    <PlanSessionBottomBar
      activePlanChapterIndex={0}
      activePlanDayChapterItems={[
        { bookId: 'MAT', chapter: 1, entryId: 'e1' },
        { bookId: 'MAT', chapter: 2, entryId: 'e2' },
      ]}
      activePlanSessionTitle={null}
      activePlanTitle="Gospels in 60 days"
      chapterSessionMode="listen"
      handleCompletePlanDay={noop}
      handleNextListenChapter={noop}
      handlePreviousListenChapter={noop}
      hasNextChapter
      hasOtherIncompletePlanSessions={false}
      hasPrevChapter
      isCollapsed={isCollapsed}
      isLastPlanChapter={false}
      planDayNumber={1}
      planSessionBottomBarAnimatedStyle={{ transform: [{ translateY: 0 }], opacity: 1 }}
      rootTabBarBottomPadding={0}
      rootTabBarHeight={64}
      showPlanSessionChrome
    />
  );
}

test('the plan strip is reachable and tappable while the reader chrome is showing', async () => {
  const view = await renderBar(false);

  const next = view.getByRole('button', { name: t('audio.nextChapter') });
  assert.equal(isHiddenFromAccessibility(next), false);
});

test('once the plan strip scrolls out it leaves the screen reader and stops taking taps', async () => {
  const view = await renderBar(true);

  assert.equal(view.queryByRole('button', { name: t('audio.nextChapter') }), null);
  const next = view.getByRole('button', { name: t('audio.nextChapter'), includeHidden: true });
  assert.equal(isHiddenFromAccessibility(next), true);
  const strip = hostAncestors(next).find((node) => node.props.accessibilityElementsHidden === true);
  assert.equal(strip?.props.pointerEvents, 'none', 'invisible buttons take no taps');
});
