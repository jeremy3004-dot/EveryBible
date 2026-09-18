import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness(count = 0, unavailable = false) {
  const exports: Record<string, (...args: unknown[]) => Promise<{ status: number } | null>> = {};
  const attempts: unknown[] = [];
  const query = {
    select() { return this; }, eq() { return this; },
    async gte() { return { count, error: unavailable ? { message: 'offline' } : null }; },
    async insert(value: unknown) { attempts.push(value); return { error: null }; },
  };
  const source = ts.transpileModule(readFileSync(new URL('./councilAccess.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, crypto, TextEncoder, Date, Uint8Array });
  const check = (code: unknown) => exports.verifyCouncilAccess(
    { from: () => query }, new Request('http://localhost'), code, 'test-council-code'
  );
  return { check, attempts };
}

test('council category alone or a wrong code cannot grant council access', async () => {
  const { check, attempts } = harness();
  assert.equal((await check(undefined))?.status, 403);
  assert.equal((await check('wrong'))?.status, 403);
  assert.equal(attempts.length, 2);
});

test('correct council code is accepted without a signed-in account', async () => {
  assert.equal(await harness().check('test-council-code'), null);
});

test('council gate fails closed if attempt tracking is unavailable', async () => {
  assert.equal((await harness(0, true).check('test-council-code'))?.status, 503);
});

test('locked council access rejects even a correct code until the window expires', async () => {
  assert.equal((await harness(10).check('test-council-code'))?.status, 429);
});
