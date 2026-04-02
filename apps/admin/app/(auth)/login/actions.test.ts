import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

test('admin login redirects successful sign-ins to the analytics globe', async () => {
  const actionSource = await readFile(
    path.join(repoRoot, 'apps/admin/app/(auth)/login/actions.ts'),
    'utf8'
  );

  assert.match(actionSource, /redirect\('\/analytics'\)/);
});
