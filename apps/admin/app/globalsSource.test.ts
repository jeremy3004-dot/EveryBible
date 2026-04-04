import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin shell follows the Neo-Swiss theme surfaces', async () => {
  const layoutSource = await readFile(path.join(repoRoot, 'apps/admin/app/layout.tsx'), 'utf8');
  const source = await readFile(path.join(repoRoot, 'apps/admin/app/neo-swiss.css'), 'utf8');

  assert.match(layoutSource, /import '\.\/neo-swiss\.css';/);
  assert.match(source, /--font-display:\s+aktiv-grotesk-extended,/);
  assert.match(source, /--accent:\s+#c83d30;/);
  assert.match(source, /\.dashboard-sidebar \{[\s\S]*background:\s+var\(--surface-1\);/m);
  assert.match(source, /\.dashboard-shell \{[\s\S]*grid-template-columns:\s*300px minmax\(0, 1fr\);/m);
  assert.match(source, /\.operator-launcher__panel \{[\s\S]*background:\s+var\(--surface-1\);/m);
  assert.match(source, /\.operator-chat__message--assistant \{[\s\S]*border-left:\s*2px solid var\(--accent\);/m);
  assert.match(source, /\.pill,[\s\S]*background:\s+var\(--surface-1\);/m);
  assert.match(source, /\.button--primary,[\s\S]*color:\s+var\(--surface-1\);/m);
  assert.match(source, /border-radius:\s+0px;/);
  assert.equal(
    source
      .split('\n')
      .filter((line) => line.includes('border-radius:') && !/border-radius:\s+0px;/.test(line))
      .length,
    0
  );
});
