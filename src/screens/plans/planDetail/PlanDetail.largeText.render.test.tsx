// Plan detail's hero and ledger rows at accessibility text sizes.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../../testing/render';
import type { ReadingPlanEntry } from '../../../services/plans/types';

const harness = installRenderHarness(mock, { os: 'ios' });
const AX5_FONT_SCALE = 3.1;
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);
const noop = () => {};

const entries = [
  { book: 'GEN', chapter_start: 1, chapter_end: 1 },
  { book: 'GEN', chapter_start: 2, chapter_end: 2 },
] as unknown as ReadingPlanEntry[];

async function renderLedgerRow(fontScale: number) {
  harness.setFontScale(fontScale);
  const { DayRow } = await import('./DayRow');
  return harness.render(
    <DayRow
      dayNumber={12}
      dateLabel="Wed, Oct 7"
      entries={entries}
      isCompleted
      isCurrent={false}
      isFuture={false}
      isNext={false}
      onPress={noop}
      onRead={noop}
    />
  );
}

test('at AX5 a ledger row stacks the day, passages and date so the passages keep the row width', async () => {
  const view = await renderLedgerRow(AX5_FONT_SCALE);
  const row = hostAncestors(view.getByText(t('readingPlans.dayLabel', { day: 12 })))[0];
  assert.ok(row);
  const style = flattenStyle(row.props.style);
  assert.equal(style?.flexDirection, 'column');
  assert.equal(style?.alignItems, 'flex-start');
});

test('at the default size a ledger row keeps day, passages and date on one line', async () => {
  const view = await renderLedgerRow(1);
  const row = hostAncestors(view.getByText(t('readingPlans.dayLabel', { day: 12 })))[0];
  assert.ok(row);
  assert.equal(flattenStyle(row.props.style)?.flexDirection, 'row');
});

test("at AX5 today's eyebrow may take a second line", async () => {
  harness.setFontScale(AX5_FONT_SCALE);
  const { DayRow } = await import('./DayRow');
  const view = await harness.render(
    <DayRow
      dayNumber={12}
      dateLabel={null}
      entries={entries}
      isCompleted={false}
      isCurrent
      isFuture={false}
      isNext={false}
      onPress={noop}
      onRead={noop}
    />
  );
  const eyebrow = view.getByText(`${t('home.today')} · ${t('readingPlans.dayLabel', { day: 12 })}`);
  assert.equal(eyebrow.props.numberOfLines, 2);
});

test('the hero title is never cut: it is the only full title on the screen', async () => {
  harness.setFontScale(AX5_FONT_SCALE);
  const { PlanDetailHero } = await import('./PlanDetailHero');
  const view = await harness.render(
    <PlanDetailHero
      coverSource={null}
      coverHeight={240}
      eyebrow="Church year · 28 days · Starts Sun, 29 Nov"
      title="Advent: Waiting for the Light of the World"
      showOptions={false}
      onBack={noop}
      onOptions={noop}
    />
  );
  assert.equal(
    view.getByText('Advent: Waiting for the Light of the World').props.numberOfLines,
    undefined
  );
  assert.equal(view.getByText(/Church year/).props.numberOfLines, 2);
});
