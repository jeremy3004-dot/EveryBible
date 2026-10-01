import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

type Resolution = { type: string; filePath?: string };
type ResolveRequest = (
  context: ResolverContext,
  moduleName: string,
  platform: string
) => Resolution;
interface ResolverContext {
  originModulePath: string;
  resolveRequest: ResolveRequest;
}

const config = require(path.join(repoRoot, 'metro.config.js')) as {
  resolver: { resolveRequest?: ResolveRequest };
};
const shimPath = path.join(repoRoot, 'src/utils/nodeAssertShim.ts');

function contextFrom(originModulePath: string): ResolverContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    originModulePath,
    resolveRequest: (_context, moduleName) => {
      calls.push(moduleName);
      return { type: 'sourceFile', filePath: `default:${moduleName}` };
    },
  };
}

test('@ide/backoff gets the small assert shim instead of the Node polyfill tree', () => {
  const resolve = config.resolver.resolveRequest;
  assert.ok(resolve);
  const context = contextFrom(path.join(repoRoot, 'node_modules/@ide/backoff/build/backoff.js'));

  assert.deepEqual(resolve(context, 'assert', 'android'), {
    type: 'sourceFile',
    filePath: shimPath,
  });
  assert.deepEqual(context.calls, []);
});

test('every other importer of assert, and every other module, resolves normally', () => {
  const resolve = config.resolver.resolveRequest;
  assert.ok(resolve);
  const other = contextFrom(path.join(repoRoot, 'node_modules/some-lib/index.js'));
  const backoff = contextFrom(path.join(repoRoot, 'node_modules/@ide/backoff/build/backoff.js'));

  assert.deepEqual(resolve(other, 'assert', 'ios'), {
    type: 'sourceFile',
    filePath: 'default:assert',
  });
  assert.deepEqual(resolve(backoff, 'react', 'ios'), {
    type: 'sourceFile',
    filePath: 'default:react',
  });
  assert.deepEqual(other.calls, ['assert']);
  assert.deepEqual(backoff.calls, ['react']);
});

test('the shim throws with the caller message when the condition fails, as Node assert does', async () => {
  const shim = (await import(shimPath)) as { default: (value: unknown, message?: string) => void };

  assert.doesNotThrow(() => shim.default(true, 'unused'));
  assert.throws(() => shim.default(false, 'The initial backoff interval must be positive'), {
    name: 'AssertionError',
    message: 'The initial backoff interval must be positive',
  });
  assert.throws(() => shim.default(0), { name: 'AssertionError' });
});
