import assert from 'node:assert/strict';
import test from 'node:test';

import { S3Client } from '@aws-sdk/client-s3';

import { GET, HEAD } from './[...assetPath]/route';

type SendInput = {
  input: {
    Range?: string;
  };
};

const originalEnv = { ...process.env };
const originalSend = S3Client.prototype.send;

function makeBody(content: string) {
  return {
    transformToWebStream() {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(content));
          controller.close();
        },
      });
    },
  };
}

function setMediaEnv() {
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_BUCKET = 'test-bucket';
  process.env.R2_ENDPOINT = 'https://r2.example.test';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
}

test.afterEach(() => {
  process.env = { ...originalEnv };
  S3Client.prototype.send = originalSend;
});

test('GET forwards a valid Range header and returns partial content headers', async () => {
  setMediaEnv();
  let forwardedRange: string | undefined;

  S3Client.prototype.send = async function send(command: SendInput) {
    forwardedRange = command.input.Range;
    return {
      AcceptRanges: 'bytes',
      Body: makeBody('ab'),
      ContentLength: 2,
      ContentRange: 'bytes 0-1/4',
      ContentType: 'audio/mpeg',
      ETag: '"test-etag"',
    };
  } as typeof originalSend;

  const response = await GET(
    new Request('https://everybible.app/api/media/audio/test.mp3', {
      headers: { Range: 'bytes=0-1' },
    }),
    { params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }) }
  );

  assert.equal(forwardedRange, 'bytes=0-1');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-length'), '2');
  assert.equal(response.headers.get('content-range'), 'bytes 0-1/4');
  assert.equal(await response.text(), 'ab');
});

test('HEAD forwards a valid Range header and omits the response body', async () => {
  setMediaEnv();
  let forwardedRange: string | undefined;

  S3Client.prototype.send = async function send(command: SendInput) {
    forwardedRange = command.input.Range;
    return {
      AcceptRanges: 'bytes',
      Body: makeBody('ab'),
      ContentLength: 2,
      ContentRange: 'bytes 0-1/4',
      ContentType: 'audio/mpeg',
    };
  } as typeof originalSend;

  const response = await HEAD(
    new Request('https://everybible.app/api/media/audio/test.mp3', {
      headers: { Range: 'bytes=0-1' },
      method: 'HEAD',
    }),
    { params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }) }
  );

  assert.equal(forwardedRange, 'bytes=0-1');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-1/4');
  assert.equal(response.body, null);
});

test('GET rejects multi-range requests before calling R2', async () => {
  setMediaEnv();
  let calledR2 = false;

  S3Client.prototype.send = async function send() {
    calledR2 = true;
    return {};
  } as typeof originalSend;

  const response = await GET(
    new Request('https://everybible.app/api/media/audio/test.mp3', {
      headers: { Range: 'bytes=0-1,2-3' },
    }),
    { params: Promise.resolve({ assetPath: ['audio', 'test.mp3'] }) }
  );

  assert.equal(calledR2, false);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-range'), 'bytes */*');
});

test('GET preserves missing object 404 behavior', async () => {
  setMediaEnv();

  S3Client.prototype.send = async function send() {
    const error = new Error('not found');
    error.name = 'NoSuchKey';
    throw error;
  } as typeof originalSend;

  const response = await GET(
    new Request('https://everybible.app/api/media/audio/missing.mp3'),
    { params: Promise.resolve({ assetPath: ['audio', 'missing.mp3'] }) }
  );

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
});
