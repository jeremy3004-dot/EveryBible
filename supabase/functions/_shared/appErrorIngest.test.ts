import assert from 'node:assert/strict';
import test from 'node:test';

import {
  scrubErrorText as clientScrub,
  summarizeComponentStack,
} from '../../../src/services/diagnostics/crashReportModel';
import {
  computeServerFingerprint,
  normalizeAppErrorReport,
  scrubErrorText,
} from './appErrorIngest';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const valid = {
  report_id: '11111111-2222-4333-8444-555555555555',
  occurred_at: '2026-09-24T11:00:00.000Z',
  kind: 'boundary',
  is_fatal: false,
  error_name: 'TypeError',
  message: 'x is undefined',
  stack_frames: ['VerseList (main.jsbundle:1:10)', 'renderWithHooks (main.jsbundle:1:900)'],
  component_stack: 'VerseList < BibleReader',
  screen: 'BibleReader',
  fingerprint: 'client-side-value',
  app_version: '1.0.9',
  build_number: '440',
  platform: 'ios',
  os_version: '18.2',
  install_id: '0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3',
};

test('the server scrubber matches the app scrubber', () => {
  for (const sample of [
    'Failed for jane.doe@example.com at https://user:pw@api.example.com/v1/me?token=abc#x',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl Bearer abc',
    'user 3f2504e0-4f89-41d3-9a0c-0305e82c3301 phone 5551234567 chapter 12',
    'key sb_publishable_AbCdEfGhIjKlMnOpQrStUvWxYz012345 and\n\nnewlines',
    'x '.repeat(400),
  ]) {
    assert.equal(scrubErrorText(sample), clientScrub(sample), sample);
  }
});

test('a valid report becomes a row with a server-computed fingerprint and derived fatality', async () => {
  const row = await normalizeAppErrorReport({ ...valid, kind: 'fatal', is_fatal: false }, NOW);
  assert.deepEqual(row, {
    id: valid.report_id,
    occurred_at: valid.occurred_at,
    kind: 'fatal',
    is_fatal: true,
    fingerprint: await computeServerFingerprint('TypeError', 'x is undefined', 'BibleReader'),
    error_name: 'TypeError',
    message: 'x is undefined',
    stack_frames: valid.stack_frames,
    component_stack: 'VerseList < BibleReader',
    screen: 'BibleReader',
    app_version: '1.0.9',
    build_number: '440',
    platform: 'ios',
    os_version: '18.2',
    install_id: valid.install_id,
  });
});

test('the fingerprint ignores numbers and is a short hex digest', async () => {
  const a = await computeServerFingerprint('TypeError', 'row 12 failed', 'Home');
  assert.equal(a, await computeServerFingerprint('TypeError', 'row 99 failed', 'Home'));
  assert.notEqual(a, await computeServerFingerprint('TypeError', 'row 12 failed', 'Plans'));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('free text is scrubbed again on the server, whatever the client sent', async () => {
  const row = await normalizeAppErrorReport(
    { ...valid, message: `mail jane@example.com ${'word '.repeat(200)}` },
    NOW
  );
  assert.ok(row && typeof row === 'object');
  assert.ok(row.message.startsWith('mail <email> word word'));
  assert.ok(row.message.endsWith('…'));
  assert.equal(row.message.length, 500);
});

test('fields outside their expected shape are dropped or defaulted, not stored', async () => {
  const row = await normalizeAppErrorReport(
    {
      ...valid,
      error_name: 'not a name <script>',
      stack_frames: [
        'ok (main.jsbundle:1:2)',
        '/var/mobile/Containers/Data/Application/ABC/secret.txt',
        42,
        ...Array.from({ length: 20 }, (_, i) => `f${i} (main.jsbundle:1:${i})`),
      ],
      component_stack: 'Home < <img onerror=x>',
      screen: 'Home screen with spaces',
      app_version: '1.0.9; drop table',
      build_number: 'x'.repeat(40),
      platform: 'windows',
      os_version: { nested: true },
      install_id: 'user-42',
      user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'jane@example.com',
    },
    NOW
  );
  assert.ok(row && typeof row === 'object');
  assert.equal(row.error_name, 'Error');
  assert.equal(row.stack_frames.length, 8);
  assert.equal(row.stack_frames[0], 'ok (main.jsbundle:1:2)');
  assert.ok(row.stack_frames.every((frame) => /\(main\.jsbundle:/.test(frame)));
  assert.equal(row.component_stack, null);
  assert.equal(row.screen, null);
  assert.equal(row.app_version, 'unknown');
  assert.equal(row.build_number, null);
  assert.equal(row.platform, 'other');
  assert.equal(row.os_version, null);
  assert.equal(row.install_id, null);
  assert.ok(!('user_id' in row));
  assert.ok(!JSON.stringify(row).includes('jane@example.com'));
});

test('a component stack the app produced is accepted as sent', async () => {
  const componentStack = summarizeComponentStack(
    Array.from({ length: 20 }, (_, i) => `    in Component${i}.Inner$${i}`).join('\n')
  );
  const row = await normalizeAppErrorReport({ ...valid, component_stack: componentStack }, NOW);
  assert.ok(row && typeof row === 'object');
  assert.equal(row.component_stack, componentStack);
});

test('reports without an id, with an unknown kind, or with a bad time are rejected', async () => {
  assert.equal(await normalizeAppErrorReport({ ...valid, report_id: 'nope' }, NOW), 'invalid');
  assert.equal(await normalizeAppErrorReport({ ...valid, kind: 'warning' }, NOW), 'invalid');
  assert.equal(await normalizeAppErrorReport({ ...valid, occurred_at: 'soon' }, NOW), 'invalid');
  assert.equal(await normalizeAppErrorReport(null, NOW), 'invalid');
  assert.equal(await normalizeAppErrorReport('string', NOW), 'invalid');
});

test('reports older than the offline window are rejected and future times are clamped', async () => {
  const old = new Date(NOW - 31 * DAY).toISOString();
  assert.equal(await normalizeAppErrorReport({ ...valid, occurred_at: old }, NOW), 'too_old');
  const future = await normalizeAppErrorReport(
    { ...valid, occurred_at: new Date(NOW + DAY).toISOString() },
    NOW
  );
  assert.ok(future && typeof future === 'object');
  assert.equal(future.occurred_at, new Date(NOW).toISOString());
});
