import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('upstream sync merges incoming catalog metadata without dropping existing sections', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/lib/upstream-sync.ts'), 'utf8');

  assert.match(source, /function mergeCatalogObjects\(/);
  assert.match(source, /const existingCatalogById = new Map\(/);
  assert.match(
    source,
    /select\('translation_id,catalog'\)/,
    'sync should inspect the current catalog before writing a new payload'
  );
  assert.match(
    source,
    /select\(\s*'translation_id,version_number,changelog,data_checksum,is_current,published_at,total_books,total_chapters,total_verses'\s*\)/,
    'sync should inspect the current version rows before writing a new payload'
  );
  assert.match(source, /catalog: mergedCatalog,/);
  assert.doesNotMatch(
    source,
    /catalog:\s*translation\.catalog,/
  );
});

test('upstream sync preserves existing version metadata when the upstream payload is sparse', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/admin/lib/upstream-sync.ts'), 'utf8');

  assert.match(source, /const mergedVersion = mergeNormalizedVersion\(/);
  assert.match(source, /data_checksum:\s*mergedVersion\.dataChecksum,/);
  assert.match(source, /published_at:\s*mergedVersion\.publishedAt,/);
  assert.match(source, /total_verses:\s*mergedVersion\.totalVerses,/);
  assert.match(source, /version_number:\s*mergedVersion\.versionNumber,/);
});
