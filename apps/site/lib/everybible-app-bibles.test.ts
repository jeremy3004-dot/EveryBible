import assert from 'node:assert/strict';
import test from 'node:test';

import { bundledAppBibles } from './everybible-app-bibles';

test('only Bibles built into the app are named for a language', () => {
  assert.deepEqual(bundledAppBibles('eng'), ['Berean Standard Bible']);
  assert.deepEqual(bundledAppBibles('yor'), []);
  assert.deepEqual(bundledAppBibles(null), []);
  assert.deepEqual(bundledAppBibles('constructor'), []);
});
