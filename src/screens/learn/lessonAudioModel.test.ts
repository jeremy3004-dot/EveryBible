import test from 'node:test';
import assert from 'node:assert/strict';
import type { AVPlaybackStatus } from 'expo-av';

import { readLessonPlaybackStatus } from './lessonAudioModel';

const loaded = (fields: Partial<Extract<AVPlaybackStatus, { isLoaded: true }>>): AVPlaybackStatus =>
  ({
    isLoaded: true,
    uri: 'https://example.test/gen1.mp3',
    progressUpdateIntervalMillis: 500,
    positionMillis: 0,
    durationMillis: 120_000,
    shouldPlay: false,
    isPlaying: false,
    isBuffering: false,
    rate: 1,
    shouldCorrectPitch: false,
    volume: 1,
    audioPan: 0,
    isMuted: false,
    isLooping: false,
    didJustFinish: false,
    ...fields,
  }) as AVPlaybackStatus;

test('an unloaded status changes nothing', () => {
  assert.equal(readLessonPlaybackStatus({ isLoaded: false }), null);
});

test('a playing status reports its position, duration and playing state', () => {
  assert.deepEqual(readLessonPlaybackStatus(loaded({ positionMillis: 4_000, isPlaying: true })), {
    positionMillis: 4_000,
    durationMillis: 120_000,
    isPlaying: true,
    rewind: false,
  });
});

test('a finished story rewinds the sound so Play and "Listen again" can start it over', () => {
  // expo-av leaves a finished sound parked at its end on both platforms, where
  // playAsync() does nothing. The UI already showed 0:00, so the native
  // position has to follow it.
  assert.deepEqual(
    readLessonPlaybackStatus(
      loaded({ positionMillis: 120_000, isPlaying: false, didJustFinish: true })
    ),
    { positionMillis: 0, durationMillis: 120_000, isPlaying: false, rewind: true }
  );
});

test('a stream with no known duration yet leaves the duration unset', () => {
  assert.deepEqual(
    readLessonPlaybackStatus(loaded({ positionMillis: 500, durationMillis: undefined })),
    { positionMillis: 500, durationMillis: null, isPlaying: false, rewind: false }
  );
});
