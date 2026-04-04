import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('site surfaces follow the Neo-Swiss theme and generated previews', async () => {
  const layoutSource = await readFile(path.join(repoRoot, 'apps/site/app/layout.tsx'), 'utf8');
  const source = await readFile(path.join(repoRoot, 'apps/site/app/neo-swiss.css'), 'utf8');
  const heroPreview = await readFile(
    path.join(repoRoot, 'apps/site/public/everybible/hero-device-stack.html'),
    'utf8'
  );
  const versePreview = await readFile(
    path.join(repoRoot, 'apps/site/public/everybible/verse-home-device.html'),
    'utf8'
  );

  assert.match(layoutSource, /import '\.\/neo-swiss\.css';/);
  assert.match(source, /--font-display:\s+aktiv-grotesk-extended,/);
  assert.match(source, /--accent:\s+#c83d30;/);
  assert.match(source, /\.site-header \{[\s\S]*border-bottom:\s*2px solid var\(--line\);/m);
  assert.match(source, /\.download-hero__content \{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.05fr\) minmax\(320px, 0\.95fr\);/m);
  assert.match(source, /\.feature-strip \{[\s\S]*border-top:\s*2px solid var\(--line\);[\s\S]*border-bottom:\s*2px solid var\(--line\);/m);
  assert.match(source, /\.static-page__hero \{[\s\S]*border-top:\s*2px solid var\(--line\);[\s\S]*background:\s+transparent;/m);
  assert.match(source, /\.site-nav__link--cta,[\s\S]*background:\s+var\(--line\);/m);
  assert.match(source, /border-radius:\s+0px;/);
  assert.equal(
    source
      .split('\n')
      .filter((line) => line.includes('border-radius:') && !/border-radius:\s+0px;/.test(line))
      .length,
    0
  );

  for (const preview of [heroPreview, versePreview]) {
    assert.match(preview, /border-radius:\s+0px;/);
    assert.equal(
      preview
        .split('\n')
        .filter((line) => line.includes('border-radius:') && !/border-radius:\s+0px;/.test(line))
        .length,
      0
    );
  }
});
