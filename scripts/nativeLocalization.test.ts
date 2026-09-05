import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('native permission resources match every supported interface language', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      path.join(process.cwd(), 'scripts/sync-native-localizations.mjs'),
      '--check',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
