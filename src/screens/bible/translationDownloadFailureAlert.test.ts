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

test('a failed Bible download says the download failed, not that a chapter could not load', async () => {
  const { showTranslationDownloadFailedAlert } = await import('./translationDownloadFailureAlert');
  alerts.length = 0;

  showTranslationDownloadFailedAlert(t, () => {});

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.title, 't:bible.translationDownloadFailedTitle');
  assert.equal(alerts[0]?.message, 't:bible.translationDownloadFailed');
  assert.notEqual(alerts[0]?.message, 't:bible.failedToLoad');
});

test('the download failure alert offers Retry, which starts the download again', async () => {
  const { showTranslationDownloadFailedAlert } = await import('./translationDownloadFailureAlert');
  alerts.length = 0;
  let retries = 0;

  showTranslationDownloadFailedAlert(t, () => {
    retries += 1;
  });

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
