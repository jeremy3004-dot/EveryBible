import assert from 'node:assert/strict';
import test from 'node:test';
import { isFeedbackAudioContainer } from './feedbackAudio';

const box = (type: string, payload = new Uint8Array(4)) => {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
};
const container = (...boxes: Uint8Array[]) => Uint8Array.from(boxes.flatMap((b) => [...b]));

test('rejects the historical John 3 plain-text smoke upload mislabeled audio/mp4', () => {
  assert.equal(
    isFeedbackAudioContainer(
      new TextEncoder().encode('everybible audio feedback smoke 1779458423221')
    ),
    false
  );
});

test('accepts recording containers with metadata before or after media', () => {
  assert.equal(
    isFeedbackAudioContainer(container(box('ftyp'), box('moov'), box('free'), box('mdat'))),
    true
  );
  assert.equal(isFeedbackAudioContainer(container(box('ftyp'), box('mdat'), box('moov'))), true);
});

test('rejects empty, header-only, and truncated recordings', () => {
  assert.equal(isFeedbackAudioContainer(new Uint8Array()), false);
  assert.equal(isFeedbackAudioContainer(box('ftyp')), false);
  const valid = container(box('ftyp'), box('moov'), box('mdat'));
  assert.equal(isFeedbackAudioContainer(valid.slice(0, -1)), false);
  assert.equal(
    isFeedbackAudioContainer(container(box('ftyp'), box('moov'), box('mdat', new Uint8Array()))),
    false
  );
});

test('handles extended box sizes and rejects boxes larger than the upload', () => {
  const media = new Uint8Array(20);
  const view = new DataView(media.buffer);
  view.setUint32(0, 1);
  media.set(new TextEncoder().encode('mdat'), 4);
  view.setBigUint64(8, BigInt(media.length));
  assert.equal(isFeedbackAudioContainer(container(box('ftyp'), box('moov'), media)), true);
  view.setBigUint64(8, BigInt(Number.MAX_SAFE_INTEGER) + 1n);
  assert.equal(isFeedbackAudioContainer(container(box('ftyp'), box('moov'), media)), false);
});
