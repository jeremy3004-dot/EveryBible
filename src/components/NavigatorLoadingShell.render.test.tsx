import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { flattenStyle, installRenderHarness } from '../testing/render';

const harness = installRenderHarness(mock);

test('while the navigator loads after onboarding, the screen shows a spinner instead of staying blank', async () => {
  const { NavigatorLoadingShell } = await import('./NavigatorLoadingShell');
  const view = await harness.render(<NavigatorLoadingShell />);

  const shell = view.getByTestId('navigator-loading-shell');
  assert.equal(view.queryAllByType('ActivityIndicator').length, 1);
  assert.equal(flattenStyle(shell.props.style)?.flex, 1, 'it fills the screen');
  assert.equal(flattenStyle(shell.props.style)?.justifyContent, 'center');
});
