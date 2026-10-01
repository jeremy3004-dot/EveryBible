// The Home season card at accessibility text sizes: the start date is the card's one
// piece of information, so it must not be cut to "Starts Wed, 1...".
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';
import type { ReadingPlan } from '../../services/plans/types';

const harness = installRenderHarness(mock, { os: 'ios' });

const plan: ReadingPlan = {
  id: 'all-saints',
  slug: 'all-saints',
  title_key: 'readingPlans.churchYear.all-saints.title',
  description_key: null,
  duration_days: 7,
  category: 'church-year',
  is_active: true,
  sort_order: 60,
  coverKey: 'advent',
  scheduleMode: 'calendar-all-saints',
};
const season = { start: new Date(2026, 9, 29), dayCount: 7 } as never;

async function renderCard(fontScale: number) {
  harness.setFontScale(fontScale);
  const { HomeSeasonCard } = await import('./HomeSeasonCard');
  return harness.render(
    <HomeSeasonCard seasonPlan={{ plan, season, daysUntilStart: 5 }} onOpenPlan={() => {}} />
  );
}

test('at AX5 the season date wraps instead of truncating', async () => {
  const view = await renderCard(3.1);
  const card = view.getByRole('button');
  const meta = view.getByText(String(card.props.accessibilityValue.text));
  assert.equal(meta.props.numberOfLines, undefined);
});

test('at the default size the date stays on one line', async () => {
  const view = await renderCard(1);
  const card = view.getByRole('button');
  const meta = view.getByText(String(card.props.accessibilityValue.text));
  assert.equal(meta.props.numberOfLines, 1);
});
