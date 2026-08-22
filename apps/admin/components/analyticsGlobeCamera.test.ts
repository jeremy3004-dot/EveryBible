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

// The legend bar was declared four times across three stylesheets. The copy
// that won the cascade (`.analytics-page .globe-card__legend-bar` in
// neo-swiss.css) ended on --primary, so the bar ran blue → green → yellow →
// orange → BLUE: blue read as both the lowest and the highest value. The
// legend also disagreed with the map, which painted the monochrome --seq-*
// scale. One intensity ramp now drives both.

test('the legend ramp is declared exactly once', async () => {
  const [globals, neoSwiss, elField] = await Promise.all(
    ['globals.css', 'neo-swiss.css', 'el-field.css'].map((file) =>
      readFile(path.resolve(path.dirname(globePath), '../app', file), 'utf8')
    )
  );

  const declarations = [globals, neoSwiss, elField].reduce(
    (count, css) =>
      count + (css.match(/globe-card__legend-bar[^}]*linear-gradient/gs) ?? []).length,
    0
  );

  assert.equal(declarations, 1, 'exactly one stylesheet may paint the legend ramp');
  assert.match(elField, /--heat-1[\s\S]{0,240}--heat-5/, 'el-field.css owns the ramp');
});

test('the ramp runs blue at the low end to red at the high end', async () => {
  const globals = await readFile(
    path.resolve(path.dirname(globePath), '../app/globals.css'),
    'utf8'
  );

  // Light scope: Sea → Reef → Ochre → Clay → red. Hues must climb out of blue
  // and land in the reds; a blue --heat-5 is the exact bug this guards.
  assert.match(globals, /--heat-1:\s*200 100% 45%;/, 'low end is EL blue');
  assert.match(globals, /--heat-3:\s*40 79% 48%;/, 'midpoint is Ochre yellow');
  assert.match(globals, /--heat-4:\s*23 72% 50%;/, 'then orange');
  assert.match(globals, /--heat-5:\s*354 70% 45%;/, 'high end is red, never blue');
  // Dark scope carries the same ordering, lifted.
  assert.match(globals, /--heat-5:\s*355 73% 60%;/, 'dark high end is red too');
});

test('the map paint uses the same five stops as the legend', async () => {
  const source = await readGlobe();

  assert.equal(/GLOBE_SEQUENTIAL/.test(source), false, 'the blue-only scale is retired');
  assert.match(source, /GLOBE_HEAT/, 'the globe paints the intensity ramp');
  assert.match(source, /light: \['#0099e6', '#239f8c', '#db9b1a', '#db6a24', '#c32232'\]/);
  assert.match(source, /dark: \['#35a7e9', '#36c9b3', '#efb748', '#eb8647', '#e34f5b'\]/);
  assert.match(source, /heat\[4\]/, 'the top stop is used for the highest values');
});
