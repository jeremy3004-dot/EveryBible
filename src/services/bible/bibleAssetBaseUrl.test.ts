import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBibleAudioAssetBaseUrl,
  resolveBibleAssetBaseUrl,
  requireSecureMediaUrl,
  resolveBibleAssetUrl,
  sanitizeBibleAssetReference,
} from './bibleAssetBaseUrl';

// __DEV__ is a Metro global; node --test has none, which is exactly a release runtime.
function withDevRuntime(run: () => void): void {
  const globals = globalThis as { __DEV__?: boolean };
  globals.__DEV__ = true;
  try {
    run();
  } finally {
    delete globals.__DEV__;
  }
}

test('a release build upgrades a plain-http catalog asset url to https', () => {
  assert.equal(
    sanitizeBibleAssetReference('http://cdn.example.com/audio/npiulb'),
    'https://cdn.example.com/audio/npiulb'
  );
  assert.equal(
    sanitizeBibleAssetReference('  HTTP://cdn.example.com/text/npiulb.sqlite '),
    'https://cdn.example.com/text/npiulb.sqlite'
  );
});

test('a release build never resolves a media url to plain http', () => {
  assert.equal(
    resolveBibleAssetUrl('http://cdn.example.com/text/npiulb.sqlite', 'https://media.example.com'),
    'https://cdn.example.com/text/npiulb.sqlite'
  );
  assert.equal(
    resolveBibleAssetBaseUrl('http://cdn.example.com/timing/npiulb/', 'https://media.example.com'),
    'https://cdn.example.com/timing/npiulb'
  );
});

test('a development build keeps plain-http urls so a local media server still works', () => {
  withDevRuntime(() => {
    assert.equal(
      sanitizeBibleAssetReference('http://192.168.1.20:8080/audio/npiulb'),
      'http://192.168.1.20:8080/audio/npiulb'
    );
  });
});

test('requireSecureMediaUrl upgrades only the plain-http scheme', () => {
  assert.equal(
    requireSecureMediaUrl('http://cdn.bible.is/JHN/3.mp3'),
    'https://cdn.bible.is/JHN/3.mp3'
  );
  assert.equal(
    requireSecureMediaUrl('https://cdn.bible.is/JHN/3.mp3'),
    'https://cdn.bible.is/JHN/3.mp3'
  );
  assert.equal(requireSecureMediaUrl('/audio/npiulb'), '/audio/npiulb');
});

test('sanitizeBibleAssetReference accepts absolute https asset urls', () => {
  assert.equal(
    sanitizeBibleAssetReference('https://cdn.everybible.app/audio/npiulb'),
    'https://cdn.everybible.app/audio/npiulb'
  );
});

test('sanitizeBibleAssetReference accepts relative asset paths', () => {
  assert.equal(sanitizeBibleAssetReference('/audio/npiulb'), '/audio/npiulb');
});

test('resolveBibleAssetUrl keeps absolute asset urls unchanged', () => {
  assert.equal(
    resolveBibleAssetUrl(
      'https://cdn.everybible.app/text/npiulb.sqlite',
      'https://media.example.com'
    ),
    'https://cdn.everybible.app/text/npiulb.sqlite'
  );
});

test('resolveBibleAssetUrl resolves relative asset paths against the configured base url', () => {
  assert.equal(
    resolveBibleAssetUrl('/text/npiulb.sqlite', 'https://media.everybible.app/'),
    'https://media.everybible.app/text/npiulb.sqlite'
  );
});

test('resolveBibleAssetBaseUrl resolves relative base paths against the configured base url', () => {
  assert.equal(
    resolveBibleAssetBaseUrl('timing/npiulb', 'https://media.everybible.app/'),
    'https://media.everybible.app/timing/npiulb'
  );
});

test('resolveBibleAssetUrl falls back to the EveryBible media route when no asset base is configured', () => {
  assert.equal(
    resolveBibleAssetUrl('/text/npiulb.sqlite'),
    'https://media.everybible.app/text/npiulb.sqlite'
  );
});

test('getBibleAudioAssetBaseUrl falls back to the EveryBible media route audio prefix', () => {
  assert.equal(getBibleAudioAssetBaseUrl(), 'https://media.everybible.app/audio');
});

test('getBibleAudioAssetBaseUrl prefers the EveryBible media route even when Supabase is configured', () => {
  assert.equal(
    getBibleAudioAssetBaseUrl(undefined, 'https://ganmududzdzpruvdulkg.supabase.co'),
    'https://media.everybible.app/audio'
  );
});
