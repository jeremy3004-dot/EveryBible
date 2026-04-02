import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('activityLocation keeps a separate event TTL so completed listening can still be attributed', () => {
  const source = readRelativeSource('./activityLocation.ts');

  assert.match(
    source,
    /SNAPSHOT_REFRESH_TTL_MS\s*=\s*15 \* 60 \* 1000/,
    'activityLocation should refresh coarse location on a short cadence while a session is active'
  );
  assert.match(
    source,
    /SNAPSHOT_EVENT_TTL_MS\s*=\s*2 \* 60 \* 60 \* 1000/,
    'activityLocation should keep the last coarse snapshot long enough for delayed completion events to be attributed'
  );
  assert.match(
    source,
    /function isCachedSnapshotAvailableForEvent/,
    'activityLocation should use a dedicated availability check for analytics event enrichment'
  );
  assert.match(
    source,
    /getCachedAnalyticsLocationEventProperties[\s\S]*isCachedSnapshotAvailableForEvent\(\)/,
    'activityLocation should allow recent coarse snapshots to be attached to completion events even after the refresh TTL expires'
  );
});
