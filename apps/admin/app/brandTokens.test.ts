import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The admin must carry the unified Illuminated brand (ember terracotta on warm
// ink), mirroring packages/brand/tokens.css. These assertions fail loudly if the
// retired maroon/cool-charcoal palette creeps back in.

test('admin globals.css defines the ember accent + warm-ink surfaces', async () => {
  const css = await readFile(path.join(repoRoot, 'apps/admin/app/globals.css'), 'utf8');

  assert.match(css, /--accent:\s*#D96C57;/i, 'accent must be ember #D96C57');
  assert.match(css, /--accent-strong:\s*#B85441;/i, 'pressed accent must be deep ember #B85441');
  assert.match(css, /--bg:\s*#161412;/i, 'base must be warm ink #161412');
  assert.match(css, /--bg-surface:\s*#1E1B18;/i, 'surface must be warm ink #1E1B18');
  assert.match(css, /--text:\s*#F2EDE3;/i, 'text must be warm parchment #F2EDE3');
  assert.match(css, /--font-display:\s*'Fraunces'/i, 'display font unified to Fraunces');
});

test('admin no longer references the retired maroon palette', async () => {
  const globals = await readFile(path.join(repoRoot, 'apps/admin/app/globals.css'), 'utf8');
  const neoSwiss = await readFile(path.join(repoRoot, 'apps/admin/app/neo-swiss.css'), 'utf8');

  for (const css of [globals, neoSwiss]) {
    for (const retired of ['#C0392B', '#c0392b', '#a0301f', '#d94f3d', '192, 57, 43']) {
      assert.equal(css.includes(retired), false, `retired maroon value "${retired}" must not appear`);
    }
  }
});
