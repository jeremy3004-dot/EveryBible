// Import-graph guard by design: source-shape assertions about what usageQueue.ts
// may pull into module initialization. Behaviour lives in usageQueue.behavior.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./usageQueue.ts', import.meta.url).href),
  'utf8'
);

const staticImports = Array.from(source.matchAll(/^import[^;]*?from\s*'([^']+)';/gm)).map(
  (match) => match[1]
);

test('the queue keeps the auth store, MMKV and expo-constants out of its static import graph', () => {
  // Every analytics facade is reachable from the first frame, so pulling the
  // persisted auth store or native storage in at module scope would move that
  // work onto the startup path. They are read through guarded require()s.
  for (const lazy of ['../../stores/authStore', '../../stores/mmkvStorage', 'expo-constants']) {
    assert.equal(
      staticImports.includes(lazy),
      false,
      `${lazy} must stay behind a lazy require(), not a static import`
    );
    assert.match(
      source,
      new RegExp(`require\\('${lazy.replace(/[./]/g, '\\$&')}'\\)`),
      `${lazy} should still be reached through a guarded require()`
    );
  }
});
