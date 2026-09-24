import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../testing/render';

const harness = installRenderHarness(mock, { height: 844 });
const t = (key: string) => harness.i18n.t(key);

async function renderSheet(onSubmit: (reason: string, note: string) => void = () => {}) {
  const { PrayerReportSheet } = await import('./PrayerReportSheet');
  return harness.render(
    <PrayerReportSheet visible isSubmitting={false} onClose={() => {}} onSubmit={onSubmit} />
  );
}

test('a report needs a reason, then sends it with the note', async () => {
  const sent: Array<[string, string]> = [];
  const view = await renderSheet((reason, note) => sent.push([reason, note]));

  const send = view.getByRole('button', { name: t('prayer.reportSend') });
  await view.press(send);
  assert.deepEqual(sent, [], 'nothing is sent without a reason');

  await view.press(view.getByRole('radio', { name: t('prayer.reportReasonSpam') }));
  await view.changeText(view.getByLabelText(t('prayer.reportNotePlaceholder')), 'Advert');
  await view.press(view.getByRole('button', { name: t('prayer.reportSend') }));
  assert.deepEqual(sent, [['spam', 'Advert']]);
});

test('the report form scrolls inside the sheet cap, so Send stays reachable at large text', async () => {
  harness.setFontScale(2);
  const view = await renderSheet();

  // Five two-line reasons, the note and Send outgrow the screen at 2.0; the
  // shared Sheet bounds them, so the form adds no scroll view of its own.
  const send = view.getByRole('button', { name: t('prayer.reportSend') });
  const ancestors = hostAncestors(send);
  const scrolls = ancestors.filter((node) => (node.type as unknown) === 'ScrollView');
  assert.equal(scrolls.length, 1, 'one scroll view, the sheet body');
  assert.equal(scrolls[0].props.keyboardShouldPersistTaps, 'handled');
  const surface = ancestors.find((node) => node.props.accessibilityViewIsModal);
  assert.ok(surface && hostAncestors(scrolls[0]).includes(surface));
  const maxHeight = Number(flattenStyle(surface.props.style)?.maxHeight);
  assert.ok(maxHeight > 0 && maxHeight < 844 - harness.insets.top, `capped (${maxHeight})`);
});
