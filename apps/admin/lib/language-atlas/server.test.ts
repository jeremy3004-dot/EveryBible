/**
 * The language-atlas snapshot reader (lib/language-atlas/server.ts) loaded
 * through the real module loader, with only the file read and the working
 * directory replaced. The reader keeps module-level caches, so each test
 * imports a fresh instance of the module.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { beforeEach, mock } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';

import { mockModule } from '../testing/adminTestHarness';

const reads: string[] = [];
let failFirstRead = false;

mockModule(mock, 'node:fs/promises', {
  readFile: async (filename: string) => {
    reads.push(filename);
    if (failFirstRead && reads.length === 1) throw new Error('temporary read failure');
    if (filename.endsWith('index.json.gz')) {
      return gzipSync(
        JSON.stringify({ records: [{ id: 'iso:eng', alternateIds: ['legacy:english'] }] })
      );
    }
    return gzipSync(JSON.stringify({ 'iso:eng': { id: 'iso:eng' } }));
  },
});

let instance = 0;
async function loadServer() {
  instance += 1;
  const server: typeof import('./server') = await import(`./server.ts?instance=${instance}`);
  return server.getAtlasDetail;
}

mock.method(process, 'cwd', () => '/atlas-admin');

beforeEach(() => {
  reads.length = 0;
  failFirstRead = false;
});

test('profile reads select a fixed hash shard and perform exact key lookup', async () => {
  const get = await loadServer();
  assert.equal((await get('iso:eng'))?.id, 'iso:eng');
  assert.equal(await get('../../secret'), null);
  assert.equal(await get('__proto__'), null);
  assert.ok(reads.length > 0);
  for (const filename of reads) {
    assert.match(
      filename,
      /^\/atlas-admin\/data\/language-atlas\/(details-[a-f0-9]|index)\.json\.gz$/
    );
  }
});

test('a retired source ID opens the reconciled canonical profile', async () => {
  const get = await loadServer();
  assert.equal((await get('legacy:english'))?.id, 'iso:eng');
});

test('profile shard cache retains only the two most recently used shards', async () => {
  const get = await loadServer();
  const keys = new Map<string, string>();
  for (let value = 0; keys.size < 3; value++) {
    const id = `test:${value}`;
    keys.set(createHash('sha256').update(id).digest('hex')[0], id);
  }
  const [a, b, c] = [...keys.values()];
  const shardReads = () => reads.filter((filename) => filename.includes('details-')).length;
  await get(a);
  await get(b);
  await get(a);
  assert.equal(shardReads(), 2);
  await get(c);
  await get(b);
  assert.equal(shardReads(), 4, 'least-recently-used shard should be read again');
});

test('the compressed index is the stored snapshot, read once from its fixed path', async () => {
  instance += 1;
  const server: typeof import('./server') = await import(`./server.ts?instance=${instance}`);
  const first = await server.getAtlasIndexGzip();
  const second = await server.getAtlasIndexGzip();
  assert.equal(first, second);
  assert.equal(JSON.parse(gunzipSync(first).toString('utf8')).records[0].id, 'iso:eng');
  assert.deepEqual(reads, ['/atlas-admin/data/language-atlas/index.json.gz']);
});

test('a failed compressed index read is retried instead of poisoning the cache', async () => {
  failFirstRead = true;
  instance += 1;
  const server: typeof import('./server') = await import(`./server.ts?instance=${instance}`);
  await assert.rejects(server.getAtlasIndexGzip(), /temporary read failure/);
  assert.ok(await server.getAtlasIndexGzip());
  assert.equal(reads.length, 2);
});

test('a failed profile read is retried instead of poisoning the cache', async () => {
  failFirstRead = true;
  const get = await loadServer();
  await assert.rejects(get('iso:eng'), /temporary read failure/);
  assert.equal((await get('iso:eng'))?.id, 'iso:eng');
  assert.equal(reads.length, 2);
});
