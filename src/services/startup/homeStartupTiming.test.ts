import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createHomeReadyReporter } from './homeStartupTiming';

test('Home readiness waits for layout and scheduled interaction completion and reports once', () => {
  let pending: (() => void) | undefined;
  let reports = 0;
  let schedules = 0;
  const reporter = createHomeReadyReporter({
    schedule: (callback) => {
      schedules += 1;
      pending = callback;
      return () => {};
    },
    report: () => reports++,
  });
  assert.equal(reports, 0);
  reporter.onLayout();
  reporter.onLayout();
  assert.equal(schedules, 1);
  assert.equal(reports, 0);
  pending?.();
  pending?.();
  assert.equal(reports, 1);
});

test('unmounted Home cancels readiness and ignores an already queued callback', () => {
  let pending: (() => void) | undefined;
  let reports = 0;
  let cancellations = 0;
  const reporter = createHomeReadyReporter({
    schedule: (callback) => {
      pending = callback;
      return () => cancellations++;
    },
    report: () => reports++,
  });
  reporter.onLayout();
  reporter.cancel();
  pending?.();
  assert.equal(cancellations, 1);
  assert.equal(reports, 0);
});

test('Home startup imports only the hooks, components and constants it renders', () => {
  const source = readFileSync(
    new URL('../../screens/home/HomeScreen.tsx', import.meta.url),
    'utf8'
  );
  for (const barrel of ['hooks', 'components', 'constants', 'utils']) {
    assert.ok(!source.includes(`from '../../${barrel}';`), `${barrel} barrel enters Home startup`);
  }
  assert.match(source, /onLayout=\{homeReadyReporter\.onLayout\}/);
});
