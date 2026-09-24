import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockReactNative } from '../../testing/mockModules';

const reactNative = mockReactNative(mock, { os: 'ios' });
const { alerts } = reactNative.__recorded;

const t = (key: string) => `t:${key}`;

interface RecordedButton {
  text: string;
  style?: string;
  onPress?: () => void;
}

test('a setup that could not finish tells the user in translated text and offers Retry', async () => {
  const { showOnboardingFinishFailedAlert } = await import('./onboardingFinishFailureAlert');
  alerts.length = 0;
  let retries = 0;

  showOnboardingFinishFailedAlert(t, () => {
    retries += 1;
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.title, 't:common.somethingWentWrong');
  assert.equal(alerts[0]?.message, 't:common.unexpectedError');
  const buttons = alerts[0]?.buttons as RecordedButton[];
  assert.deepEqual(
    buttons.map((button) => [button.text, button.style ?? null]),
    [
      ['t:common.cancel', 'cancel'],
      ['t:common.retry', null],
    ]
  );

  buttons[1]?.onPress?.();
  assert.equal(retries, 1);
});
