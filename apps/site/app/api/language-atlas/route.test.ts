import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { GET } from './route';

test('public endpoint streams only its prebuilt snapshot and returns a retryable failure when absent', async () => {
  const original = process.cwd();
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'everybible-public-atlas-'));
  try {
    process.chdir(temporary);
    const missing = await GET();
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await missing.text(), /ENOENT|Users|private/);

    await mkdir(path.join(temporary, 'data/language-atlas'), { recursive: true });
    const payload = { schemaVersion: 1, records: [{ id: 'example', scriptureStatus: 'unknown' }] };
    await writeFile(path.join(temporary, 'data/language-atlas/index.json.gz'), gzipSync(JSON.stringify(payload)));
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.match(response.headers.get('cache-control')!, /^public,/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const body = gunzipSync(Buffer.from(await response.arrayBuffer())).toString();
    assert.deepEqual(JSON.parse(body), payload);
  } finally {
    process.chdir(original);
    await rm(temporary, { recursive: true, force: true });
  }
});
