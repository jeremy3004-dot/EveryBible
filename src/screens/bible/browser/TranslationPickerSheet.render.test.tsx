import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { installRenderHarness } from '../../../testing/render';
import { mockModule, sourcePath } from '../../../testing/mockModules';

// The sheet loads the shared picker lazily; these cover a load that fails.
const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

const reports: Array<{ source: string; error: unknown }> = [];
let onReport: (() => void) | null = null;
mockModule(mock, sourcePath('services/diagnostics/crashReportQueue.ts'), {
  reportHandledError: (source: string, error: unknown) => {
    reports.push({ source, error });
    onReport?.();
  },
});

// Stands in for the real picker, which another suite covers.
const PickerList = (props: Record<string, unknown>) =>
  createElement('TranslationPickerList', props);
mockModule(mock, sourcePath('screens/bible/TranslationPickerList.tsx'), {
  TranslationPickerList: PickerList,
});

/** Resolves once the crash queue has recorded a report; fails instead of hanging. */
function nextReport() {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no crash report was queued')), 2000);
    onReport = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

test('a picker that fails to load shows an error with a retry and reports it', async () => {
  const { TranslationPickerSheet } = await import('./TranslationPickerSheet');
  const failure = new Error('bundle chunk failed');
  const attempts: string[] = [];
  const loadPickerList = () => {
    attempts.push('load');
    return attempts.length === 1 ? Promise.reject(failure) : Promise.resolve(PickerList as never);
  };

  const reported = nextReport();
  const view = await harness.render(
    <TranslationPickerSheet visible onClose={() => {}} loadPickerList={loadPickerList} />
  );
  await reported;
  await view.flush();

  assert.deepEqual(reports, [{ source: 'browser.pickerLoad', error: failure }]);
  assert.equal(view.queryByText(t('common.loading')), null, 'the spinner does not run forever');
  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryAllByType('TranslationPickerList').length, 0);

  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(attempts.length, 2, 'retry loads the picker again');
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.equal(view.queryAllByType('TranslationPickerList').length, 1);
  assert.equal(reports.length, 1);
});
