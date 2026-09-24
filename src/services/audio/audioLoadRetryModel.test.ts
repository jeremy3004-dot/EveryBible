import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioLoadTimeoutError, shouldRetryAudioLoad } from './audioLoadRetryModel';
import { isTimeoutError } from '../diagnostics/crashReportModel';

// Messages as expo-av reports them: iOS joins the AVPlayerItem failure reason to its
// code and domain; Android passes ExoPlayer's message through.
const IOS_TIMED_OUT =
  'The request timed out. - The AVPlayerItem instance has failed with the error code -1001 and domain "NSURLErrorDomain".';
const IOS_AVFOUNDATION_TIMEOUT =
  'An unknown error occurred (-1001) - The AVPlayerItem instance has failed with the error code -11800 and domain "AVFoundationErrorDomain".';
const IOS_OFFLINE =
  'The Internet connection appears to be offline. - The AVPlayerItem instance has failed with the error code -1009 and domain "NSURLErrorDomain".';
const IOS_CONNECTION_LOST =
  'The network connection was lost. - The AVPlayerItem instance has failed with the error code -1005 and domain "NSURLErrorDomain".';

test('a load that ran out of time is retried', () => {
  assert.equal(shouldRetryAudioLoad(new Error(IOS_TIMED_OUT)), true);
  assert.equal(shouldRetryAudioLoad(new Error(IOS_AVFOUNDATION_TIMEOUT)), true);
  assert.equal(shouldRetryAudioLoad(new AudioLoadTimeoutError(30_000)), true);
  assert.equal(shouldRetryAudioLoad(new Error('java.net.SocketTimeoutException: timeout')), true);
});

test('a dropped or missing connection is retried', () => {
  assert.equal(shouldRetryAudioLoad(new Error(IOS_CONNECTION_LOST)), true);
  assert.equal(shouldRetryAudioLoad(new Error(IOS_OFFLINE)), true);
  assert.equal(shouldRetryAudioLoad(new Error('Unable to resolve host "media.test"')), true);
});

test('a chapter the server does not have is not retried', () => {
  assert.equal(
    shouldRetryAudioLoad(new Error('Source error: Response code: 404 (network request)')),
    false
  );
  assert.equal(
    shouldRetryAudioLoad(
      new Error(
        'The requested URL was not found on this server. - The AVPlayerItem instance has failed with the error code -1100 and domain "NSURLErrorDomain".'
      )
    ),
    false
  );
});

test('a sound that loaded but will not decode is not retried', () => {
  assert.equal(
    shouldRetryAudioLoad(
      new Error(
        'Load encountered an error: [AVAsset isPlayable:] returned false. The asset does not contain a playable content or is not supported by the device.'
      )
    ),
    false
  );
  assert.equal(shouldRetryAudioLoad(new Error('Native playback failed')), false);
  assert.equal(shouldRetryAudioLoad(null), false);
});

test('the load deadline reads as a timeout wherever errors are classified', () => {
  const error = new AudioLoadTimeoutError(30_000);

  assert.equal(error.name, 'TimeoutError');
  assert.equal(isTimeoutError(error), true);
  assert.match(error.message, /30 s/);
});
