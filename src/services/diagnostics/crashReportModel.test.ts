import test from 'node:test';
import assert from 'node:assert/strict';

import {
  admitCrashReport,
  buildCrashReport,
  computeCrashFingerprint,
  extractBundleFrames,
  MAX_CRASH_REPORTS_PER_DAY,
  scrubErrorText,
  screenFromBoundaryScope,
  summarizeComponentStack,
} from './crashReportModel';

const DEVICE = {
  appVersion: '1.0.9',
  buildNumber: '440',
  platform: 'ios',
  osVersion: '18.2',
  installId: '0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3',
};

test('scrubbing removes emails, tokens, uuids, long digit runs and URL queries', () => {
  const scrubbed = scrubErrorText(
    'Failed for jane.doe@example.com at https://api.example.com/v1/users/me?access_token=abc123#frag ' +
      'user 3f2504e0-4f89-41d3-9a0c-0305e82c3301 phone 5551234567 ' +
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl key sb_publishable_AbCdEfGhIjKlMnOpQrStUvWxYz012345 ' +
      'Bearer secretvalue'
  );
  assert.equal(
    scrubbed,
    'Failed for <email> at https://api.example.com/v1/users/me?<redacted> ' +
      'user <uuid> phone <n> jwt <token> key <token> Bearer <token>'
  );
});

test('scrubbing keeps short numbers and ordinary words intact', () => {
  assert.equal(
    scrubErrorText("Cannot read property 'map' of undefined (chapter 12, verse 4)"),
    "Cannot read property 'map' of undefined (chapter 12, verse 4)"
  );
});

test('scrubbing strips credentials embedded in a URL', () => {
  assert.equal(
    scrubErrorText('GET https://user:hunter2@cdn.example.com/a.mp3 failed'),
    'GET https://cdn.example.com/a.mp3 failed'
  );
});

test('scrubbing truncates long text', () => {
  const scrubbed = scrubErrorText('x '.repeat(400), 50);
  assert.equal(scrubbed.length, 50);
  assert.ok(scrubbed.endsWith('…'));
});

test('only JS bundle frames are kept, reduced to function and bundle file name', () => {
  const stack = [
    "TypeError: Cannot read property 'map' of undefined",
    '    at VerseList (address at /data/app/~~Zx9==/com.everybible.app-1/base.apk!/assets/index.android.bundle:1:84211)',
    '    at apply (native)',
    '    at renderWithHooks (/var/containers/Bundle/Application/1A2B3C4D-1111-2222-3333-444455556666/EveryBible.app/main.jsbundle:1:9001)',
    '    at anonymous (http://10.0.2.2:8081/index.bundle//&platform=android&dev=true&minify=false:120:33)',
    '    at native',
    'performWork@http://localhost:8081/index.bundle?platform=ios&dev=true:55:7',
    '    at someLib (node_modules/foo/index.js:3:4)',
  ].join('\n');

  assert.deepEqual(extractBundleFrames(stack), [
    'VerseList (index.android.bundle:1:84211)',
    'renderWithHooks (main.jsbundle:1:9001)',
    'anonymous (index.bundle:120:33)',
    'performWork (index.bundle:55:7)',
  ]);
});

test('bundle frames are capped', () => {
  const stack = Array.from({ length: 30 }, (_, i) => `    at f${i} (main.jsbundle:1:${i})`).join(
    '\n'
  );
  assert.equal(extractBundleFrames(stack, 8).length, 8);
  assert.deepEqual(extractBundleFrames(undefined), []);
});

test('component stacks are reduced to component names only', () => {
  const componentStack =
    '\n    in VerseList (at BibleReaderScreen.tsx:40)\n    in RCTView\n    at BibleReaderScreen (http://x/index.bundle?token=1:2:3)\n    in ErrorBoundary';
  assert.equal(
    summarizeComponentStack(componentStack),
    'VerseList < RCTView < BibleReaderScreen < ErrorBoundary'
  );
  assert.equal(summarizeComponentStack(''), null);
  assert.equal(summarizeComponentStack(null), null);
});

test('boundary scopes map to a screen name', () => {
  assert.equal(screenFromBoundaryScope('screen:BibleReader'), 'BibleReader');
  assert.equal(screenFromBoundaryScope('root'), '[root]');
  assert.equal(screenFromBoundaryScope(undefined), '[app]');
});

test('the fingerprint ignores volatile numbers but separates screens and error types', () => {
  const a = computeCrashFingerprint('TypeError', 'index 12 out of range', 'Home');
  const b = computeCrashFingerprint('TypeError', 'index 99 out of range', 'Home');
  const c = computeCrashFingerprint('TypeError', 'index 12 out of range', 'BibleReader');
  const d = computeCrashFingerprint('RangeError', 'index 12 out of range', 'Home');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[0-9a-f]{14}$/);
});

test('a report carries only scrubbed, bounded fields and no user identity', () => {
  const error = new TypeError('lookup failed for jane@example.com');
  error.stack = `TypeError: lookup failed\n    at Home (main.jsbundle:1:10)\n    at apply (native)`;
  const report = buildCrashReport({
    error,
    kind: 'boundary',
    screen: 'Home',
    componentStack: '\n    in Home\n    in ErrorBoundary',
    occurredAt: Date.parse('2026-09-24T10:00:00.000Z'),
    reportId: '11111111-2222-4333-8444-555555555555',
    device: DEVICE,
  });

  assert.deepEqual(report, {
    report_id: '11111111-2222-4333-8444-555555555555',
    occurred_at: '2026-09-24T10:00:00.000Z',
    kind: 'boundary',
    is_fatal: false,
    error_name: 'TypeError',
    message: 'lookup failed for <email>',
    stack_frames: ['Home (main.jsbundle:1:10)'],
    component_stack: 'Home < ErrorBoundary',
    screen: 'Home',
    fingerprint: computeCrashFingerprint('TypeError', 'lookup failed for <email>', 'Home'),
    app_version: '1.0.9',
    build_number: '440',
    platform: 'ios',
    os_version: '18.2',
    install_id: DEVICE.installId,
  });
});

test('a thrown non-Error value becomes a named report', () => {
  const report = buildCrashReport({
    error: 'plain string',
    kind: 'fatal',
    screen: null,
    occurredAt: 0,
    reportId: '11111111-2222-4333-8444-555555555555',
    device: DEVICE,
  });
  assert.equal(report.error_name, 'NonError');
  assert.equal(report.message, 'plain string');
  assert.equal(report.is_fatal, true);
  assert.deepEqual(report.stack_frames, []);
});

test('an unusual error name is replaced rather than sent verbatim', () => {
  const error = new Error('x');
  error.name = 'name with jane@example.com';
  const report = buildCrashReport({
    error,
    kind: 'error',
    screen: null,
    occurredAt: 0,
    reportId: '11111111-2222-4333-8444-555555555555',
    device: DEVICE,
  });
  assert.equal(report.error_name, 'Error');
});

test('admission drops a repeat fingerprint within a session', () => {
  const seen = new Set<string>();
  const first = admitCrashReport({ day: '2026-09-24', count: 0 }, seen, 'abc', '2026-09-24');
  assert.deepEqual(first, { admitted: true, budget: { day: '2026-09-24', count: 1 } });
  const repeat = admitCrashReport(first.budget, seen, 'abc', '2026-09-24');
  assert.deepEqual(repeat, { admitted: false, budget: { day: '2026-09-24', count: 1 } });
});

test('admission caps reports per day and resets on a new day', () => {
  const full = { day: '2026-09-24', count: MAX_CRASH_REPORTS_PER_DAY };
  assert.equal(admitCrashReport(full, new Set(), 'new', '2026-09-24').admitted, false);
  assert.deepEqual(admitCrashReport(full, new Set(), 'new', '2026-09-25'), {
    admitted: true,
    budget: { day: '2026-09-25', count: 1 },
  });
});

// Postgres refuses a NUL byte and a lone UTF-16 surrogate, so either one used to fail the
// whole upload batch. The client must never produce them, even when cutting mid-emoji.
const hasLoneSurrogate = (text: string) =>
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);

test('truncation never splits an emoji into a lone surrogate', () => {
  // 48 ASCII characters then emoji: a UTF-16 cut at 49 lands between a surrogate pair.
  // (Words, not one long run, which would be scrubbed as a token.)
  const words48 = 'ab '.repeat(16);
  const scrubbed = scrubErrorText(`${words48}${'😀'.repeat(10)}`, 50);
  assert.equal(hasLoneSurrogate(scrubbed), false);
  assert.ok(scrubbed.length <= 50, 'still within the server limit in UTF-16 units');
  assert.equal(scrubbed, `${words48}…`);
});

test('an emoji that fits before the cut is kept whole', () => {
  const words47 = `${'ab '.repeat(15)}ab`;
  const scrubbed = scrubErrorText(`${words47}${'😀'.repeat(10)}`, 50);
  assert.equal(scrubbed, `${words47}😀…`);
});

test('NUL bytes are removed from the message', () => {
  assert.equal(scrubErrorText('bad\u0000 value\u0000'), 'bad value');
});

test('lone surrogates already present in the error text are replaced', () => {
  const scrubbed = scrubErrorText('broken \ud83d text and \ude00 tail');
  assert.equal(hasLoneSurrogate(scrubbed), false);
  assert.equal(scrubbed, 'broken � text and � tail');
});
