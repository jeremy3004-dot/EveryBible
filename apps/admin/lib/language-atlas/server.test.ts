import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as util from 'node:util';
import * as zlib from 'node:zlib';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

function loadServer(failFirst = false) {
  const calls: string[] = [];
  const exports: Record<string, (id: string) => Promise<{ id: string } | null>> = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL('./server.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const dependencies: Record<string, unknown> = {
    'node:crypto': crypto,
    'node:path': path,
    'node:util': util,
    'node:zlib': zlib,
    'node:fs/promises': { readFile: async (filename: string) => {
      calls.push(filename);
      if (failFirst && calls.length === 1) throw new Error('temporary read failure');
      return zlib.gzipSync(JSON.stringify({ 'iso:eng': { id: 'iso:eng' } }));
    } },
  };
  runInNewContext(outputText, { exports, process: { cwd: () => '/atlas-admin' }, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  } });
  return { get: exports.getAtlasDetail, calls };
}

test('profile reads select a fixed hash shard and perform exact key lookup', async () => {
  const { get, calls } = loadServer();
  assert.equal((await get('iso:eng'))?.id, 'iso:eng');
  assert.equal(await get('../../secret'), null);
  assert.equal(await get('__proto__'), null);
  assert.ok(calls.every((filename) => /^\/atlas-admin\/data\/language-atlas\/details-[a-f0-9]\.json\.gz$/.test(filename)));
});

test('profile shard cache retains only the two most recently used shards', async () => {
  const { get, calls } = loadServer();
  const keys = new Map<string, string>();
  for (let value = 0; keys.size < 3; value++) {
    const id = `test:${value}`;
    keys.set(createHash('sha256').update(id).digest('hex')[0], id);
  }
  const [a, b, c] = [...keys.values()];
  await get(a); await get(b); await get(a);
  assert.equal(calls.length, 2);
  await get(c); await get(b);
  assert.equal(calls.length, 4, 'least-recently-used shard should be read again');
});

test('a failed profile read is retried instead of poisoning the cache', async () => {
  const { get, calls } = loadServer(true);
  await assert.rejects(get('iso:eng'), /temporary read failure/);
  assert.equal((await get('iso:eng'))?.id, 'iso:eng');
  assert.equal(calls.length, 2);
});
