import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANDROID_POSITION_DRIFT_TOLERANCE_SECONDS,
  AndroidMediaPlaybackState,
  buildAndroidMediaControlOptions,
  buildAndroidMediaMetadata,
  buildAndroidPlaybackSnapshot,
  mapAndroidMediaControlEvent,
  metadataSignature,
  shouldPushAndroidPlaybackState,
  toAndroidArtworkUri,
} from './androidMediaSessionModel';
import {
  buildBibleNowPlayingPayload,
  type BibleNowPlayingInput,
  type BibleNowPlayingLocalizedStrings,
  type BibleNowPlayingPayload,
} from './audioNowPlayingModel';

const spanish: BibleNowPlayingLocalizedStrings = {
  bookName: 'Génesis',
  channelName: 'Reproduciendo ahora',
  play: 'Reproducir audio del capítulo',
  pause: 'Pausar audio del capítulo',
  previous: 'Capítulo anterior',
  next: 'Capítulo siguiente',
  skipBackward: 'Retroceder 10 segundos',
  skipForward: 'Avanzar 10 segundos',
};

const genesisOne: BibleNowPlayingInput = {
  translationId: 'bsb',
  bookId: 'GEN',
  chapter: 1,
  positionMs: 30_000,
  durationMs: 600_400,
  isPlaying: true,
  playbackRate: 1,
};

function payloadFor(input: BibleNowPlayingInput): BibleNowPlayingPayload {
  const payload = buildBibleNowPlayingPayload(input);
  assert.ok(payload);
  return payload;
}

const ARTWORK = 'android.resource://com.everybible.app/drawable/assets_audio_nowplayingartwork';

// ---------------------------------------------------------------------------
// Enable options
// ---------------------------------------------------------------------------

test('the session advertises chapter skip, seek and 10-second skips in notification order', () => {
  assert.deepEqual(buildAndroidMediaControlOptions(), {
    capabilities: [
      'previousTrack',
      'play',
      'pause',
      'nextTrack',
      'seek',
      'skipBackward',
      'skipForward',
    ],
    compactCapabilities: ['previousTrack', 'play', 'nextTrack'],
    android: { skipInterval: 10 },
  });
});

test('interface-language strings become the channel name and notification action labels', () => {
  assert.deepEqual(buildAndroidMediaControlOptions(spanish).android, {
    skipInterval: 10,
    channelName: 'Reproduciendo ahora',
    actionLabels: {
      play: 'Reproducir audio del capítulo',
      pause: 'Pausar audio del capítulo',
      previousTrack: 'Capítulo anterior',
      nextTrack: 'Capítulo siguiente',
      skipBackward: 'Retroceder 10 segundos',
      skipForward: 'Avanzar 10 segundos',
    },
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('metadata uses the book name in the interface language, the translation and the artwork', () => {
  const input = { ...genesisOne, localized: spanish };

  assert.deepEqual(
    buildAndroidMediaMetadata(input, payloadFor(input), { artworkUri: ARTWORK, discreet: false }),
    {
      title: 'Génesis 1',
      artist: 'Berean Standard Bible',
      album: 'Every Bible',
      duration: 600,
      artwork: { uri: ARTWORK },
    }
  );
});

test('metadata falls back to the English book name when no strings were supplied', () => {
  const metadata = buildAndroidMediaMetadata(genesisOne, payloadFor(genesisOne), {
    artworkUri: null,
    discreet: false,
  });

  assert.deepEqual(metadata, {
    title: 'Genesis 1',
    artist: 'Berean Standard Bible',
    album: 'Every Bible',
    duration: 600,
  });
});

test('an unknown duration is left out instead of publishing a zero-length track', () => {
  const input = { ...genesisOne, durationMs: 0 };

  const metadata = buildAndroidMediaMetadata(input, payloadFor(input), {
    artworkUri: null,
    discreet: false,
  });

  assert.equal('duration' in metadata, false);
});

test('a runtime translation name reaches the notification artist line', () => {
  const input = { ...genesisOne, translationId: 'el-ahr', translationName: 'Ahirani' };

  const metadata = buildAndroidMediaMetadata(input, payloadFor(input), {
    artworkUri: null,
    discreet: false,
  });

  assert.equal(metadata.artist, 'Ahirani');
});

test('discreet mode publishes a neutral entry with no Scripture title, translation or artwork', () => {
  const input = { ...genesisOne, localized: spanish };

  assert.deepEqual(
    buildAndroidMediaMetadata(input, payloadFor(input), { artworkUri: ARTWORK, discreet: true }),
    { title: 'Reproduciendo ahora', artist: '', album: '', duration: 600 }
  );
});

test('the metadata signature changes with the title but not with object identity', () => {
  const base = { title: 'Génesis 1', artist: 'BSB', album: 'Every Bible', duration: 600 };

  assert.equal(metadataSignature(base), metadataSignature({ ...base }));
  assert.notEqual(metadataSignature(base), metadataSignature({ ...base, title: 'Génesis 2' }));
  assert.notEqual(metadataSignature(base), metadataSignature({ ...base, duration: 601 }));
  assert.notEqual(
    metadataSignature(base),
    metadataSignature({ ...base, artwork: { uri: ARTWORK } })
  );
});

// ---------------------------------------------------------------------------
// Playback state
// ---------------------------------------------------------------------------

test('playing and paused payloads map to the library playback states', () => {
  assert.deepEqual(buildAndroidPlaybackSnapshot(payloadFor(genesisOne)), {
    state: AndroidMediaPlaybackState.Playing,
    positionSeconds: 30,
    playbackRate: 1,
  });
  assert.deepEqual(
    buildAndroidPlaybackSnapshot(
      payloadFor({ ...genesisOne, isPlaying: false, playbackRate: 1.5 })
    ),
    { state: AndroidMediaPlaybackState.Paused, positionSeconds: 30, playbackRate: 1.5 }
  );
});

test('a non-positive rate is published as normal speed', () => {
  assert.equal(
    buildAndroidPlaybackSnapshot(payloadFor({ ...genesisOne, playbackRate: 0 })).playbackRate,
    1
  );
});

const playingAt30 = {
  state: AndroidMediaPlaybackState.Playing,
  positionSeconds: 30,
  playbackRate: 1,
  sentAtMs: 1_000_000,
} as const;

test('the first playback state is always pushed', () => {
  assert.equal(
    shouldPushAndroidPlaybackState(null, { ...playingAt30, positionSeconds: 0 }, 0),
    true
  );
});

test('steady playback ticks are not re-pushed while the session extrapolates correctly', () => {
  for (let second = 1; second <= 60; second += 1) {
    assert.equal(
      shouldPushAndroidPlaybackState(
        playingAt30,
        { state: AndroidMediaPlaybackState.Playing, positionSeconds: 30 + second, playbackRate: 1 },
        playingAt30.sentAtMs + second * 1000
      ),
      false,
      `second ${second}`
    );
  }
});

test('extrapolation follows the playback rate', () => {
  const fast = { ...playingAt30, playbackRate: 2 };

  assert.equal(
    shouldPushAndroidPlaybackState(
      fast,
      { state: AndroidMediaPlaybackState.Playing, positionSeconds: 50, playbackRate: 2 },
      fast.sentAtMs + 10_000
    ),
    false
  );
});

test('play/pause, a rate change and a seek are pushed', () => {
  const at = playingAt30.sentAtMs + 5_000;

  assert.equal(
    shouldPushAndroidPlaybackState(
      playingAt30,
      { state: AndroidMediaPlaybackState.Paused, positionSeconds: 35, playbackRate: 1 },
      at
    ),
    true
  );
  assert.equal(
    shouldPushAndroidPlaybackState(
      playingAt30,
      { state: AndroidMediaPlaybackState.Playing, positionSeconds: 35, playbackRate: 1.25 },
      at
    ),
    true
  );
  assert.equal(
    shouldPushAndroidPlaybackState(
      playingAt30,
      {
        state: AndroidMediaPlaybackState.Playing,
        positionSeconds: 35 + ANDROID_POSITION_DRIFT_TOLERANCE_SECONDS + 10,
        playbackRate: 1,
      },
      at
    ),
    true
  );
});

test('a paused session does not extrapolate, so a seek while paused is still pushed', () => {
  const paused = { ...playingAt30, state: AndroidMediaPlaybackState.Paused };

  assert.equal(
    shouldPushAndroidPlaybackState(
      paused,
      { state: AndroidMediaPlaybackState.Paused, positionSeconds: 30, playbackRate: 1 },
      paused.sentAtMs + 600_000
    ),
    false
  );
  assert.equal(
    shouldPushAndroidPlaybackState(
      paused,
      { state: AndroidMediaPlaybackState.Paused, positionSeconds: 90, playbackRate: 1 },
      paused.sentAtMs + 1_000
    ),
    true
  );
});

// ---------------------------------------------------------------------------
// Artwork uri
// ---------------------------------------------------------------------------

test('a bare drawable name from a release build becomes an android.resource uri', () => {
  assert.equal(
    toAndroidArtworkUri('assets_audio_nowplayingartwork', 'com.everybible.app'),
    ARTWORK
  );
});

test('dev-server, file and resource uris pass through untouched', () => {
  for (const uri of [
    'http://10.0.2.2:8081/assets/assets/audio/now-playing-artwork.png?platform=android',
    'file:///data/user/0/com.everybible.app/files/.expo-internal/artwork.png',
    ARTWORK,
  ]) {
    assert.equal(toAndroidArtworkUri(uri, 'com.everybible.app'), uri);
  }
});

test('a missing asset uri yields no artwork', () => {
  assert.equal(toAndroidArtworkUri(undefined, 'com.everybible.app'), null);
  assert.equal(toAndroidArtworkUri('', 'com.everybible.app'), null);
});

// ---------------------------------------------------------------------------
// Remote commands
// ---------------------------------------------------------------------------

test('every notification, lock-screen and headset command maps to the shared command set', () => {
  const mapped = [
    'play',
    'pause',
    'stop',
    'nextTrack',
    'previousTrack',
    'skipForward',
    'skipBackward',
  ].map((command) => mapAndroidMediaControlEvent({ command, timestamp: 1 }));

  assert.deepEqual(mapped, [
    { command: 'play' },
    { command: 'pause' },
    { command: 'stop' },
    { command: 'next' },
    { command: 'previous' },
    { command: 'seek-forward' },
    { command: 'seek-backward' },
  ]);
});

test('a seek-bar drag carries its position in seconds', () => {
  assert.deepEqual(
    mapAndroidMediaControlEvent({ command: 'seek', data: { position: 84.5 }, timestamp: 1 }),
    { command: 'seek-position', positionSeconds: 84.5 }
  );
});

test('a seek without a usable position is dropped', () => {
  for (const data of [
    undefined,
    null,
    {},
    { position: '84' },
    { position: -1 },
    { position: NaN },
  ]) {
    assert.equal(mapAndroidMediaControlEvent({ command: 'seek', data }), null);
  }
});

test('commands the app does not handle and malformed events are ignored', () => {
  for (const event of [
    null,
    undefined,
    'play',
    {},
    { command: 42 },
    { command: 'setRating', data: { rating: 1 } },
    { command: 'volumeUp' },
  ]) {
    assert.equal(mapAndroidMediaControlEvent(event), null);
  }
});
