// Native/asset configuration guard by design: these assertions read iOS Swift, asset
// catalog, and build-script files that a runtime test cannot reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

function readRelativeFile(relativePath: string): Buffer {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href));
}

function sha256(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

test('audioNowPlaying republishs the latest snapshot when iOS backgrounds the app', () => {
  const source = readRelativeSource(
    '../../../ios/EveryBible/EveryBibleAudioNowPlayingModule.swift'
  );

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
  const source = readRelativeSource(
    '../../../ios/EveryBible/EveryBibleAudioNowPlayingModule.swift'
  );
  const artworkAssetContents = readRelativeSource(
    '../../../ios/EveryBible/Images.xcassets/NowPlayingAppIcon.imageset/Contents.json'
  );
  const appIcon = readRelativeFile(
    '../../../ios/EveryBible/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png'
  );
  const nowPlayingIcon = readRelativeFile(
    '../../../ios/EveryBible/Images.xcassets/NowPlayingAppIcon.imageset/App-Icon-1024x1024@1x.png'
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

  assert.equal(
    sha256(nowPlayingIcon),
    sha256(appIcon),
    'The lock-screen artwork image should match the current iOS app icon'
  );
});

test('the icon generator refreshes the dedicated iOS lock-screen artwork', () => {
  const source = readRelativeSource('../../../scripts/generate-icons.js');

  assert.match(
    source,
    /NowPlayingAppIcon\.imageset/,
    'Generating a new app icon should also refresh the iOS lock-screen artwork asset'
  );
});
