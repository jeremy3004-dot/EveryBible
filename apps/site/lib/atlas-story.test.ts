import assert from 'node:assert/strict';
import { test } from 'node:test';

import { globeFitZoom, storyPadding, storyScene, storyStats, toStoryStep } from './atlas-story';

test('the story walks from every language, to the need, to the app', () => {
  assert.equal(storyScene(0).scripture, 'all');
  assert.equal(storyScene(2).scripture, 'no-scripture');
  assert.equal(storyScene(2).highlightApp, false);
  assert.equal(storyScene(3).highlightApp, true);
  assert.equal(storyScene(3).spin, false, 'the globe stops turning on the app step');
  assert.ok(storyScene(3).center, 'the app step turns to the region the app serves');
});

test('unknown step values fall back to the opening scene', () => {
  assert.equal(toStoryStep('2'), 2);
  assert.equal(toStoryStep(undefined), 0);
  assert.equal(toStoryStep('7'), 0);
  assert.equal(toStoryStep('nope'), 0);
});

test('the globe fit grows by one zoom level when the space doubles', () => {
  const small = globeFitZoom(400, 400, 20);
  const large = globeFitZoom(800, 800, 20);
  assert.ok(Math.abs(large - small - 1) < 1e-9);
  assert.equal(globeFitZoom(400, 900, 20), globeFitZoom(900, 400, 20), 'fits the smaller side');
});

test('desktop keeps the globe right of the copy; phones keep it above the copy', () => {
  const desktop = storyPadding(1440, 900, 72);
  assert.ok(desktop.left > desktop.right);
  const phone = storyPadding(375, 812, 64);
  assert.ok(phone.bottom > phone.top);
  assert.equal(phone.left, phone.right);
});

test('right-to-left pages mirror the globe to the left of the copy', () => {
  const ltr = storyPadding(1440, 900, 72);
  const rtl = storyPadding(1440, 900, 72, true);
  assert.equal(rtl.left, ltr.right);
  assert.equal(rtl.right, ltr.left);
  assert.equal(rtl.top, ltr.top);
  assert.deepEqual(storyPadding(375, 812, 64, true), storyPadding(375, 812, 64));
});

test('no known Scripture counts every status the map paints red', () => {
  const stats = storyStats(
    {
      languageCount: 10,
      statusCounts: { bible: 2, nt: 1, portions: 1, unknown: 3, started: 2, needed: 1 },
    },
    4
  );
  assert.deepEqual(stats, { languages: 10, noScripture: 6, inApp: 4 });
});
