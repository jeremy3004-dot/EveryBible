import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS,
  buildAudioPlaybackProgressEvent,
  type AudioPlaybackProgressInput,
} from './audioListeningProgressModel';

const input: AudioPlaybackProgressInput = {
  state: {
    currentTranslationId: 'web',
    currentBookId: 'JHN',
    currentChapter: 3,
    currentPosition: 150_000,
    duration: 600_000,
    playbackRate: 1.5,
  },
  reason: 'tick',
  force: false,
  segmentStartedAt: 1_000,
  now: 1_000 + AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS,
  fallbackTranslationId: 'bsb',
};

test('a periodic tick reports the listening segment that just ended', () => {
  assert.deepEqual(buildAudioPlaybackProgressEvent(input), {
    book_id: 'JHN',
    chapter: 3,
    duration_ms: 600_000,
    listened_ms: AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS,
    mode: 'listen',
    playback_rate: 1.5,
    position_ms: 150_000,
    progress_percent: 25,
    reason: 'tick',
    translation_id: 'web',
  });
});

test('a tick soon after the last report is skipped unless forced', () => {
  const early = { ...input, now: input.segmentStartedAt + 1_000 };

  assert.equal(buildAudioPlaybackProgressEvent(early), null);
  assert.equal(buildAudioPlaybackProgressEvent({ ...early, force: true })?.listened_ms, 1_000);
  assert.equal(buildAudioPlaybackProgressEvent({ ...early, reason: 'pause' })?.listened_ms, 1_000);
});

test('nothing is reported without a running segment', () => {
  assert.equal(
    buildAudioPlaybackProgressEvent({ ...input, reason: 'pause', segmentStartedAt: 0 }),
    null
  );
  assert.equal(
    buildAudioPlaybackProgressEvent({ ...input, reason: 'pause', now: input.segmentStartedAt }),
    null
  );
});

test('nothing is reported without a chapter of known length', () => {
  assert.equal(
    buildAudioPlaybackProgressEvent({ ...input, state: { ...input.state, duration: 0 } }),
    null
  );
  assert.equal(
    buildAudioPlaybackProgressEvent({ ...input, state: { ...input.state, currentBookId: null } }),
    null
  );
  assert.equal(
    buildAudioPlaybackProgressEvent({ ...input, state: { ...input.state, currentChapter: null } }),
    null
  );
});

test('progress is a percentage with one decimal, capped at 100', () => {
  assert.equal(
    buildAudioPlaybackProgressEvent({
      ...input,
      state: { ...input.state, currentPosition: 1_000, duration: 3_000 },
    })?.progress_percent,
    33.3
  );
  assert.equal(
    buildAudioPlaybackProgressEvent({
      ...input,
      state: { ...input.state, currentPosition: 700_000 },
    })?.progress_percent,
    100
  );
});

test('a chapter without a translation is attributed to the fallback translation', () => {
  assert.equal(
    buildAudioPlaybackProgressEvent({
      ...input,
      state: { ...input.state, currentTranslationId: null },
    })?.translation_id,
    'bsb'
  );
});
