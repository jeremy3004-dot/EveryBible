import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('upstream translation feed reads the committed R2 text-pack manifest and publishes a canonical kjv row', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/site/lib/upstreamTranslationFeed.ts'), 'utf8');

  assert.match(source, /import r2TextPackManifestData from '\.\/r2-text-pack-manifest\.json'/);
  assert.match(source, /buildBibleMediaUrl\(textPack\.downloadUrl\)/);
  assert.match(source, /sourceTranslationId: 'eng-kjv'/);
  assert.match(source, /translationId: 'kjv'/);
  assert.match(source, /const skippedSourceIds = new Set\(FEED_OVERRIDES\.map/);
  assert.match(source, /isAvailable: Boolean\(textPack\)/);
  assert.match(source, /dataChecksum: textPack\?\.sha256 \?\? null/);
  assert.match(source, /totalVerses: textPack\?\.verseCount \?\? null/);
});
