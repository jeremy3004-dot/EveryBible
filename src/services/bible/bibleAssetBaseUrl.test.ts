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
    resolveBibleAssetUrl('https://cdn.everybible.app/text/npiulb.sqlite', 'https://media.example.com'),
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
    'https://everybible.app/api/media/text/npiulb.sqlite'
  );
});

test('getBibleAudioAssetBaseUrl falls back to the EveryBible media route audio prefix', () => {
  assert.equal(getBibleAudioAssetBaseUrl(), 'https://everybible.app/api/media/audio');
});

test('getBibleAudioAssetBaseUrl keeps the legacy Supabase audio bucket when only Supabase is configured', () => {
  assert.equal(
    getBibleAudioAssetBaseUrl(undefined, 'https://ganmududzdzpruvdulkg.supabase.co'),
    'https://ganmududzdzpruvdulkg.supabase.co/storage/v1/object/public/bible-audio'
  );
});
