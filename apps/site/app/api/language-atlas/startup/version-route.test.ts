import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { GET } from './[version]/route';

test('versioned public snapshots negotiate compression and cache only existing immutable versions', async () => {
  const original = process.cwd();
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'everybible-startup-'));
  const version = 'a'.repeat(64);
  const params = Promise.resolve({ version });
  const request = (encoding: string) =>
    new Request('https://everybible.app/api/language-atlas/startup/' + version, {
      headers: { 'Accept-Encoding': encoding },
    });
  try {
    process.chdir(temporary);
    const missing = await GET(request('br'), { params });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    const unsafe = await GET(request('br'), {
      params: Promise.resolve({ version: '../../index' }),
    });
    assert.equal(unsafe.status, 404);
    const directory = path.join(temporary, 'data/language-atlas');
    await mkdir(directory, { recursive: true });
    const body = Buffer.from('{"schemaVersion":2,"records":["complete profile"]}');
    await writeFile(path.join(directory, `startup-${version}.json.gz`), gzipSync(body));
    await writeFile(path.join(directory, `startup-${version}.json.br`), brotliCompressSync(body));
    for (const [accept, encoding] of [
      ['gzip, deflate, br', 'br'],
      ['gzip', 'gzip'],
      ['br;q=0, gzip', 'gzip'],
    ]) {
      const response = await GET(request(accept), { params });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-encoding'), encoding);
      assert.match(response.headers.get('cache-control')!, /max-age=31536000, immutable/);
      assert.equal(response.headers.get('vary'), 'Accept-Encoding');
      const compressed = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(
        encoding === 'br' ? brotliDecompressSync(compressed) : gunzipSync(compressed),
        body
      );
    }
  } finally {
    process.chdir(original);
    await rm(temporary, { recursive: true, force: true });
  }
});
