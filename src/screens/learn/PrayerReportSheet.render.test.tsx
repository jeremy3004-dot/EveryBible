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

test('the report form scrolls inside a height cap, so Send stays reachable at large text', async () => {
  harness.setFontScale(2);
  const view = await renderSheet();

  const send = view.getByRole('button', { name: t('prayer.reportSend') });
  const scroll = hostAncestors(send).find((node) => (node.type as unknown) === 'ScrollView');
  assert.ok(scroll, 'five two-line reasons, a note and Send outgrow the screen at 2.0');
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  const maxHeight = Number(flattenStyle(scroll.props.style)?.maxHeight);
  assert.ok(maxHeight > 0 && maxHeight < 844, `capped below the window (${maxHeight})`);
});
