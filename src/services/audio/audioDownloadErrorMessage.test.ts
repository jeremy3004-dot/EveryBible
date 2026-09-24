import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import {
  AudioDownloadInsufficientSpaceError,
  describeAudioDownloadError,
} from './audioDownloadErrorMessage';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${JSON.stringify(options)})` : key) as unknown as TFunction;

test('a download refused for lack of space tells the reader how much room it needs', () => {
  const error = new AudioDownloadInsufficientSpaceError(1.5 * 1024 ** 3, 200 * 1024 ** 2);

  assert.equal(
    describeAudioDownloadError(error, t),
    'bible.audioDownloadInsufficientSpace({"required":"1.5 GB","free":"200 MB"})'
  );
});

test('any other download failure shows the translated generic message, never the raw error', () => {
  assert.equal(
    describeAudioDownloadError(new Error('Chapter download failed (HTTP 503): https://x'), t),
    'bible.audioDownloadFailed'
  );
  assert.equal(describeAudioDownloadError('boom', t), 'bible.audioDownloadFailed');
});
