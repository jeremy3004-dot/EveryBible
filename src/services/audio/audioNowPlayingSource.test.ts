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

test('audioNowPlaying uses the branded EveryBible lock-screen artwork asset before generating a generic cover', () => {
  const source = readRelativeSource('../../../ios/EveryBible/EveryBibleAudioNowPlayingModule.swift');
  const artworkAssetContents = readRelativeSource(
    '../../../ios/EveryBible/Images.xcassets/NowPlayingAppIcon.imageset/Contents.json'
  );

  assert.match(
    source,
    /UIImage\(named:\s*"NowPlayingAppIcon"\)/,
    'The native now-playing bridge should load the dedicated EveryBible artwork asset for lock-screen metadata'
  );

  assert.match(
    artworkAssetContents,
    /App-Icon-1024x1024@1x\.png/,
    'The lock-screen artwork asset should point at the branded EveryBible icon image'
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
