import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin dashboard sidebar follows the active theme surfaces', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/app/globals.css'), 'utf8');

  assert.match(
    source,
    /\.dashboard-sidebar \{[\s\S]*background:\s+linear-gradient\(180deg,\s+var\(--surface-1\),\s+var\(--surface-2\)\);/m
  );
  assert.match(source, /\.nav-link \{[\s\S]*background:\s+var\(--surface-3\);/m);
  assert.match(source, /\.nav-link:hover \{[\s\S]*background:\s+linear-gradient\(180deg,\s+var\(--surface-1\),\s+var\(--surface-2\)\);/m);
});
