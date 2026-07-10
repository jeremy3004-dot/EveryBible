import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The marketing site must carry the unified Illuminated brand (ember
// terracotta on warm ivory/ink), mirroring packages/brand/tokens.css.
// These assertions fail loudly if the retired blue Every-Language palette
// creeps back in or the ember accent drifts out of sync with the canonical
// token package.

test('site globals.css defines the ember terracotta accent + warm ivory canvas', async () => {
  const css = await readFile(path.join(repoRoot, 'apps/site/app/globals.css'), 'utf8');

  assert.match(css, /--primary:\s*#d96c57;/i, 'primary accent must be ember #D96C57');
  assert.match(css, /--primary-deep:\s*#b85441;/i, 'accent text-on-light must be deep ember #B85441');
  assert.match(css, /--background:\s*#ece6da;/i, 'canvas must be warm ivory #ECE6DA');
  assert.match(css, /--brand-ink:\s*#161412;/i, 'dark band must use the app warm-ink #161412');
  assert.match(css, /--font-body:\s*'DM Sans'/i, 'body font unified to DM Sans');
});

test('site globals.css no longer references the retired blue Every-Language palette', async () => {
  const css = await readFile(path.join(repoRoot, 'apps/site/app/globals.css'), 'utf8');

  for (const retired of ['#0099e5', '#005f8f', '#00405f', '#addfff', '#e2e2c7', '#c72a37', '0, 153, 229', '173, 223, 255']) {
    assert.equal(
      css.includes(retired),
      false,
      `retired blue/tan brand value "${retired}" must not appear in the site stylesheet`
    );
  }
});

test('the canonical brand token package stays the documented source of truth', async () => {
  const tokens = await readFile(path.join(repoRoot, 'packages/brand/tokens.css'), 'utf8');
  assert.match(tokens, /--eb-ember:\s*#D96C57;/, 'canonical ember token present');
  assert.match(tokens, /--eb-ink-bg:\s*#161412;/, 'canonical warm-ink token present');
});
