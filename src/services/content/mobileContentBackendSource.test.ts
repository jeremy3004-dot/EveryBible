import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('site mobile content route uses the shared Supabase mobile content RPC', async () => {
  const source = await readFile(
    path.join(repoRoot, 'apps/site/app/api/mobile/content/route.ts'),
    'utf8'
  );

  assert.match(source, /service\.rpc\('get_live_mobile_content'\)/);
});
