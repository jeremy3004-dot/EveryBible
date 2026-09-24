import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';

// The plan and rhythm pages before they have anything to show.
const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

test('a loading plan page is one busy "Loading" element, not a silent spinner', async () => {
  const { PlanDetailStatusView } = await import('./planDetail/PlanDetailStatusView');
  const view = await harness.render(<PlanDetailStatusView status="loading" onBack={() => {}} />);

  const loading = view.getByLabelText(t('common.loading'));
  assert.equal(loading.props.accessible, true, 'iOS reads the label only on an element');
  assert.deepEqual(loading.props.accessibilityState, { busy: true });
});

test('a plan page that fails to load says why aloud', async () => {
  const { PlanDetailStatusView } = await import('./planDetail/PlanDetailStatusView');
  const view = await harness.render(
    <PlanDetailStatusView
      status="error"
      message="Plan not found"
      onBack={() => {}}
      onRetry={() => {}}
    />
  );

  assert.equal(view.getByText('Plan not found').props.accessibilityLiveRegion, 'polite');
  assert.deepEqual(harness.rn.__recorded.announcements, ['Plan not found']);
});

test('a loading rhythm is announced as loading, and a missing one names the page and says why', async () => {
  const { RhythmStatusView } = await import('./rhythmDetail/RhythmStatusView');
  const loading = await harness.render(<RhythmStatusView status="loading" />);
  const spinner = loading.getByLabelText(t('common.loading'));
  assert.equal(spinner.props.accessible, true);
  assert.deepEqual(spinner.props.accessibilityState, { busy: true });
  await loading.unmount();

  const failed = await harness.render(
    <RhythmStatusView status="error" message="Rhythm not found" onBack={() => {}} />
  );
  assert.ok(failed.getByRole('header', { name: t('readingPlans.rhythms') }));
  assert.deepEqual(harness.rn.__recorded.announcements, ['Rhythm not found']);
});
