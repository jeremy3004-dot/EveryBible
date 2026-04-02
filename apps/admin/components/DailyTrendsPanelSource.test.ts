import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('daily trends panel stays collapsed by default and only expands on click', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/components/DailyTrendsPanel.tsx'), 'utf8');

  assert.match(source, /const \[isOpen, setIsOpen\] = useState\(false\);/);
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /Keep the 30-day trend collapsed until you need the detail\./);
  assert.match(source, /daily-trends__summary/);
});
