import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVerseImageCaptureOptions,
  VERSE_IMAGE_ASPECT_RATIO,
  VERSE_IMAGE_CAPTURE_WIDTH,
} from './verseImageCapture';

test('the capture is a 1080 px wide JPEG file, not a device-scale PNG or base64', () => {
  const options = getVerseImageCaptureOptions();
  assert.equal(options.format, 'jpg');
  assert.equal(options.result, 'tmpfile');
  assert.equal(options.width, 1080);
  assert.ok(options.quality < 1 && options.quality >= 0.8);
});

test('the capture keeps the preview frame aspect ratio', () => {
  const { width, height } = getVerseImageCaptureOptions();
  assert.equal(width, VERSE_IMAGE_CAPTURE_WIDTH);
  assert.ok(Math.abs(width / height - VERSE_IMAGE_ASPECT_RATIO) < 0.005);
});
