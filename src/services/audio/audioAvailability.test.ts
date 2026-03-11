import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudioAvailability } from './audioAvailability';

test('feature-disabled translations cannot play or download audio', () => {
  assert.deepEqual(
    getAudioAvailability({
      featureEnabled: false,
      translationHasAudio: true,
      remoteAudioAvailable: true,
      downloadedAudioBooks: ['JHN'],
      bookId: 'JHN',
    }),
    {
      canPlayAudio: false,
      canDownloadAudio: false,
      canManageAudio: false,
      canStreamAudio: false,
      hasOfflineAudio: false,
    }
  );
});

test('remote audio enables both playback and downloads for supported translations', () => {
  assert.deepEqual(
    getAudioAvailability({
      featureEnabled: true,
      translationHasAudio: true,
      remoteAudioAvailable: true,
      downloadedAudioBooks: [],
      bookId: 'JHN',
    }),
    {
      canPlayAudio: true,
      canDownloadAudio: true,
      canManageAudio: true,
      canStreamAudio: true,
      hasOfflineAudio: false,
    }
  );
});

test('downloaded audio keeps chapter playback available when remote audio is unavailable', () => {
  assert.deepEqual(
    getAudioAvailability({
      featureEnabled: true,
      translationHasAudio: true,
      remoteAudioAvailable: false,
      downloadedAudioBooks: ['JHN'],
      bookId: 'JHN',
    }),
    {
      canPlayAudio: true,
      canDownloadAudio: false,
      canManageAudio: true,
      canStreamAudio: false,
      hasOfflineAudio: true,
    }
  );
});

test('offline audio only counts for the current book', () => {
  assert.deepEqual(
    getAudioAvailability({
      featureEnabled: true,
      translationHasAudio: true,
      remoteAudioAvailable: false,
      downloadedAudioBooks: ['ROM'],
      bookId: 'JHN',
    }),
    {
      canPlayAudio: false,
      canDownloadAudio: false,
      canManageAudio: false,
      canStreamAudio: false,
      hasOfflineAudio: false,
    }
  );
});

test('translation-level capability still exposes saved offline audio without enabling downloads', () => {
  assert.deepEqual(
    getAudioAvailability({
      featureEnabled: true,
      translationHasAudio: true,
      remoteAudioAvailable: false,
      downloadedAudioBooks: ['JHN'],
    }),
    {
      canPlayAudio: true,
      canDownloadAudio: false,
      canManageAudio: true,
      canStreamAudio: false,
      hasOfflineAudio: true,
    }
  );
});
