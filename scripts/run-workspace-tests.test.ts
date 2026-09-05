import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverTestFiles, runTestFiles } from './run-workspace-tests';

function runFixture(fixture: string) {
  // Start outside node:test's worker context so Node runs the nested fixture.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--eval',
      `const { runTestFiles } = require('./scripts/run-workspace-tests.ts'); process.exitCode = runTestFiles([${JSON.stringify(fixture)}], process.cwd());`,
    ],
    { cwd: process.cwd(), env, encoding: 'utf8' }
  );
}

test('workspace discovery includes every source area while excluding tools and generated output', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'everybible-test-discovery-'));
  const expected = [
    'src/mobile.test.ts',
    'apps/admin/app/(dashboard)/analytics/page.test.ts',
    'apps/site/lib/links.test.mjs',
    'packages/brand/tokens.test.ts',
    'supabase/functions/events/handler.test.ts',
    'scripts/release.test.ts',
  ];
  const excluded = [
    'scripts/testflight_release_guard.ts',
    'scripts/test_manual.ts',
    'apps/site/.next/generated.test.ts',
    'apps/admin/node_modules/dependency/test.test.ts',
    'packages/brand/dist/tokens.test.js',
    'tmp/experiment.test.ts',
  ];
  try {
    for (const file of [...expected, ...excluded]) {
      const destination = path.join(root, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, '');
    }
    assert.deepEqual(discoverTestFiles(root), expected.map((file) => path.join(root, file)).sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the runner returns a failing status for a failed TypeScript test', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'everybible-test-failure-'));
  const fixture = path.join(root, 'failure.test.ts');
  try {
    writeFileSync(
      fixture,
      "import test from 'node:test';\ntest('intentional failure', () => { throw new Error('fixture'); });\n"
    );
    const result = runFixture(fixture);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /intentional failure/);
    assert.throws(() => runTestFiles([], process.cwd()), /No workspace tests found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the runner enables module mocking inside spawned test workers', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'everybible-test-module-mock-'));
  const fixture = path.join(root, 'module-mock.test.mjs');
  try {
    writeFileSync(path.join(root, 'dependency.mjs'), "export const value = 'original';\n");
    writeFileSync(
      fixture,
      `
import assert from 'node:assert/strict';
import test from 'node:test';
test('module mock replaces dependency', async (t) => {
  t.mock.module(new URL('./dependency.mjs', import.meta.url).href, {
    namedExports: { value: 'mocked' },
  });
  const dependency = await import('./dependency.mjs');
  assert.equal(dependency.value, 'mocked');
});
`
    );
    const result = runFixture(fixture);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /module mock replaces dependency/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
