import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBibleAudioAssetBaseUrl,
  resolveBibleAssetBaseUrl,
  resolveBibleAssetUrl,
  sanitizeBibleAssetReference,
} from './bibleAssetBaseUrl';

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

test('sanitizeBibleAssetReference rejects values that are not usable asset references', () => {
  assert.equal(sanitizeBibleAssetReference(42), null);
  assert.equal(sanitizeBibleAssetReference(null), null);
  assert.equal(sanitizeBibleAssetReference('   '), null);
});

test('sanitizeBibleAssetReference refuses script, data, blob and file schemes', () => {
  for (const value of [
    'javascript:alert(1)',
    'DATA:text/html;base64,AAAA',
    'blob:https://x/1',
    'file:///etc/passwd',
  ]) {
    assert.equal(sanitizeBibleAssetReference(value), null, value);
  }
});

test('sanitizeBibleAssetReference trims padding and drops a leading ./ from relative paths', () => {
  assert.equal(sanitizeBibleAssetReference('  ./audio/bsb  '), 'audio/bsb');
  assert.equal(sanitizeBibleAssetReference(' HTTP://cdn.test/a '), 'HTTP://cdn.test/a');
});

test('resolveBibleAssetBaseUrl strips trailing slashes from absolute urls', () => {
  assert.equal(
    resolveBibleAssetBaseUrl('https://cdn.everybible.app/timing/bsb//', 'https://ignored.test'),
    'https://cdn.everybible.app/timing/bsb'
  );
});

test('resolveBibleAssetBaseUrl returns null for a missing reference or an unusable base', () => {
  assert.equal(resolveBibleAssetBaseUrl(undefined, 'https://media.everybible.app'), null);
  assert.equal(resolveBibleAssetBaseUrl('timing/bsb', '   '), null);
  assert.equal(resolveBibleAssetBaseUrl('timing/bsb', ''), null);
});

test('resolveBibleAssetUrl returns null for a missing reference or an unusable base', () => {
  assert.equal(resolveBibleAssetUrl(null, 'https://media.everybible.app'), null);
  assert.equal(resolveBibleAssetUrl('javascript:alert(1)', 'https://media.everybible.app'), null);
  assert.equal(resolveBibleAssetUrl('text/bsb.sqlite', '  '), null);
});

test('getBibleAudioAssetBaseUrl appends the audio prefix to a configured asset base', () => {
  assert.equal(
    getBibleAudioAssetBaseUrl('https://cdn.example.test'),
    'https://cdn.example.test/audio'
  );
});
