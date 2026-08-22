import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const globePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'AnalyticsGlobe.tsx'
);

const readGlobe = () => readFile(globePath, 'utf8');

// The analytics globe used to auto-rotate on an interval, which left the map
// drifting off north with no way back — the NavigationControl was constructed
// with showCompass:false, so there was no reset-bearing affordance. The Every
// Language design system also rules out perpetual decorative motion in a
// dashboard: progress and chart draws are the only animated data.

test('the globe has no idle auto-rotate', async () => {
  const source = await readGlobe();

  assert.equal(
    /setInterval/.test(source),
    false,
    'no interval may drive the camera — that was the drift'
  );
  assert.equal(
    /getBearing\(\)\s*\+/.test(source),
    false,
    'nothing may advance the bearing on a timer'
  );
  assert.equal(
    /prefers-reduced-motion/.test(source),
    false,
    'the reduced-motion guard existed only for the retired auto-rotate'
  );
});

test('the globe opens north-up and untilted', async () => {
  const source = await readGlobe();

  assert.match(source, /bearing:\s*0,/, 'the initial bearing must be north-up');
  assert.match(source, /pitch:\s*0,/, 'the initial pitch must be flat');
});

test('the operator can always reset the globe back to north', async () => {
  const source = await readGlobe();

  assert.match(
    source,
    /showCompass:\s*true/,
    'the compass control is the one-click way back to north-up'
  );
});
