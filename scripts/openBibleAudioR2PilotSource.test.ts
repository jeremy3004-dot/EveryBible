import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'scripts', 'open-bible-audio-r2-pilot.ts'),
  'utf8'
);

test('open-bible-audio-r2-pilot verifies published assets before catalog upsert', () => {
  assert.match(
    source,
    /await assertPublishedCatalogAssets\(summary\);[\s\S]*await upsertCatalogRow\(summary\.catalogRow\);/,
    'open-bible-audio-r2-pilot.ts should verify the referenced R2 objects exist before surfacing a catalog row in the app'
  );
});
