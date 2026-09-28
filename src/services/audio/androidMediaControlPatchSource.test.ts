import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const patch = readFileSync('patches/expo-media-control+1.0.12.patch', 'utf8');
// Source contract only: native compilation and action-mask behavior require a rebuilt APK.
const source = patch.replace(/^[ +]/gm, '');

test('the Android patch exports in-place options updates on the Expo main queue', () => {
  const setter = source.match(
    /AsyncFunction\("updateMediaControlOptions"\)[\s\S]*?\.runOnQueue\(Queues\.MAIN\)/
  )?.[0];
  assert.ok(setter, 'the setter must be exported and run on the main queue');
  assert.match(source, /import expo\.modules\.kotlin\.functions\.Queues/);
  assert.match(setter, /controlOptions\.putAll\(options\)/);
  assert.match(setter, /mediaService\?\.updateConfiguration\(androidConfig\)/);
  assert.match(setter, /mediaService\?\.updateCapabilities\(caps, compactCaps\)/);
  assert.ok(setter.indexOf('controlOptions.putAll(options)') < setter.indexOf('mediaService?.'));
  assert.doesNotMatch(setter, /enableMediaControls|bindService|startService|moduleScope\.cancel/);
});

test('the new export preserves the existing disable-scope and localized notification patches', () => {
  assert.match(source, /val disableScope = moduleScope/);
  assert.match(source, /disableScope\.cancel\(\)/);
  assert.match(source, /actionLabel\("previousTrack", "Previous"\)/);
  assert.match(source, /actionLabel\("nextTrack", "Next"\)/);
  assert.match(source, /return START_NOT_STICKY/);
});

test('an initially unbound or renewed service connection reads the retained latest options', () => {
  const module = readFileSync(
    'node_modules/expo-media-control/android/src/main/java/expo/modules/mediacontrol/ExpoMediaControlModule.kt',
    'utf8'
  );
  const connection = module.slice(
    module.indexOf('override fun onServiceConnected'),
    module.indexOf('override fun onServiceDisconnected')
  );
  assert.match(connection, /controlOptions\["android"\]/);
  assert.match(connection, /controlOptions\["capabilities"\]/);
  assert.match(connection, /controlOptions\["compactCapabilities"\]/);
  assert.match(connection, /mediaService\?\.updateConfiguration\(androidConfig\)/);
  assert.match(connection, /mediaService\?\.updateCapabilities\(caps, compactCaps\)/);
});

test('capability refresh retains the live native progress anchor before rebuilding state', () => {
  const installed = readFileSync(
    'node_modules/expo-media-control/android/src/main/java/expo/modules/mediacontrol/MediaPlaybackService.kt',
    'utf8'
  );
  const update = installed.slice(
    installed.indexOf('  fun updateCapabilities('),
    installed.indexOf('  fun updateMetadata(')
  );
  assert.match(
    update,
    /currentPosition = livePositionMs\(\)[\s\S]*?updatePlaybackState\(\)/,
    'rebuilding actions must capture extrapolated progress before resetting the native timestamp'
  );
  assert.match(
    patch,
    /\+\s+currentPosition = livePositionMs\(\)\n[ +]\s+capabilities = caps/,
    'the persisted patch must retain the same live anchor fix'
  );
  assert.doesNotMatch(update, /currentPlaybackState =|currentPlaybackRate =/);
});
