import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('daily trends panel renders without interactive button controls', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/components/DailyTrendsPanel.tsx'), 'utf8');

  assert.match(source, /Daily listening minutes/);
  assert.match(source, /Daily download units/);
  assert.doesNotMatch(source, /<button\b/);
  assert.doesNotMatch(source, /segmented-control__button/);
  assert.doesNotMatch(source, /aria-expanded=\{isOpen\}/);
  assert.doesNotMatch(source, /useState<TrendMode>|useState\(false\)/);
});
