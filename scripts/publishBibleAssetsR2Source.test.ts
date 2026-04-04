import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'scripts', 'publish-bible-assets-r2.ts'),
  'utf8'
);

test('publish-bible-assets-r2 regenerates the committed R2 text-pack manifest after upload', () => {
  assert.match(
    source,
    /generateR2TextPackManifest/,
    'publish-bible-assets-r2 should call the text-pack manifest generator so the committed upstream feed stays aligned with the bucket'
  );

  assert.ok(
    source.includes("'apps'") &&
      source.includes("'site'") &&
      source.includes("'lib'") &&
      source.includes("'r2-text-pack-manifest.json'"),
    'publish-bible-assets-r2 should update the committed site manifest file, not just the bucket objects'
  );
});
