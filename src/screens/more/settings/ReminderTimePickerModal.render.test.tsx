import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../../testing/render';

const harness = installRenderHarness(mock);
const t = harness.i18n.t.bind(harness.i18n);

type Picked = { hours: number[]; minutes: string[] };

async function renderPicker(selectedHour = 9, selectedMinute = '15') {
  const { ReminderTimePickerModal } = await import('./ReminderTimePickerModal');
  const picked: Picked = { hours: [], minutes: [] };
  const view = await harness.render(
    <ReminderTimePickerModal
      visible
      selectedHour={selectedHour}
      selectedMinute={selectedMinute}
      onSelectHour={(hour) => picked.hours.push(hour)}
      onSelectMinute={(minute) => picked.minutes.push(minute)}
      onClose={() => {}}
      onConfirm={() => {}}
    />
  );
  return { view, picked };
}

const adjust = (actionName: 'increment' | 'decrement') => ({ nativeEvent: { actionName } });

test('each time column is one adjustable control named for what it sets, announcing its value', async () => {
  const { view } = await renderPicker(9, '15');

  const hour = view.getByRole('adjustable', { name: t('settings.reminderHourLabel') });
  const minute = view.getByRole('adjustable', { name: t('settings.reminderMinuteLabel') });

  assert.deepEqual(hour.props.accessibilityValue, { text: '09' });
  assert.deepEqual(minute.props.accessibilityValue, { text: '15' });
  assert.deepEqual(
    hour.props.accessibilityActions.map(({ name }: { name: string }) => name),
    ['increment', 'decrement']
  );
});

test('the individual options are hidden from a screen reader so the column is one stop', async () => {
  const { view } = await renderPicker();

  assert.equal(view.queryAllByRole('button', { name: '09' }).length, 0);
  assert.equal(view.queryAllByRole('button', { name: '09', includeHidden: true }).length, 1);
});

test('swiping up or down steps the column and scrolls the new value into view', async () => {
  const { view, picked } = await renderPicker(9, '15');
  const hour = view.getByRole('adjustable', { name: t('settings.reminderHourLabel') });
  const minute = view.getByRole('adjustable', { name: t('settings.reminderMinuteLabel') });
  const tenOption = view.getByText('10');
  await view.fire(tenOption, 'onLayout', {
    nativeEvent: { layout: { x: 0, y: 500, width: 60, height: 40 } },
  });
  harness.refCalls.length = 0;

  await view.fire(hour, 'onAccessibilityAction', adjust('increment'));
  await view.fire(minute, 'onAccessibilityAction', adjust('decrement'));

  assert.deepEqual(picked, { hours: [10], minutes: ['00'] });
  assert.deepEqual(
    harness.refCalls.map(({ method, args }) => [method, args]),
    [['scrollTo', [{ y: 420, animated: true }]]]
  );
});

test('adjusting past either end of a column changes nothing', async () => {
  const { view, picked } = await renderPicker(23, '00');

  await view.fire(
    view.getByRole('adjustable', { name: t('settings.reminderHourLabel') }),
    'onAccessibilityAction',
    adjust('increment')
  );
  await view.fire(
    view.getByRole('adjustable', { name: t('settings.reminderMinuteLabel') }),
    'onAccessibilityAction',
    adjust('decrement')
  );

  assert.deepEqual(picked, { hours: [], minutes: [] });
});
