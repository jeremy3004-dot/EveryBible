import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('audioNowPlaying republishs the latest snapshot when iOS backgrounds the app', () => {
  const source = readRelativeSource('../../../ios/EveryBible/EveryBibleAudioNowPlayingModule.swift');

  assert.match(
    source,
    /UIApplication\.didEnterBackgroundNotification/,
    'The native now-playing bridge should refresh metadata when the app backgrounds'
  );

  assert.match(
    source,
    /latestPayload/,
    'The native now-playing bridge should cache the latest payload for background re-publication'
  );

  assert.match(
    source,
    /MPNowPlayingInfoPropertyMediaType:\s*MPNowPlayingInfoMediaType\.audio\.rawValue/,
    'The native now-playing bridge should explicitly mark Bible audio as audio media'
  );

  assert.match(
    source,
    /MPNowPlayingInfoPropertyIsLiveStream:\s*false/,
    'The native now-playing bridge should mark the chapter stream as non-live'
  );
});

test('audioNowPlaying keeps the JS bridge wired to the native now-playing module', () => {
  const source = readRelativeSource('./audioNowPlaying.ts');

  assert.match(
    source,
    /function getNativeBibleNowPlayingModule\(\): NativeBibleNowPlayingModule \| undefined/,
    'The JS audio bridge should resolve the native iOS now-playing module lazily'
  );

  assert.match(
    source,
    /function getBibleNowPlayingEmitter\(\): NativeEventEmitter \| null/,
    'The JS audio bridge should create the native event emitter from the lazily resolved module'
  );

  assert.match(
    source,
    /const nativeModule = getNativeBibleNowPlayingModule\(\);/,
    'The JS audio bridge should resolve the native module at call time before syncing or clearing'
  );
});
