import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLiveVerseOfDayOverride,
  parseMobileContentOverridePayload,
} from './mobileContentService';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

test('parseMobileContentOverridePayload returns null for malformed payloads', () => {
  assert.equal(parseMobileContentOverridePayload(null), null);
  assert.equal(parseMobileContentOverridePayload({ generatedAt: null }), null);
});

test('parseMobileContentOverridePayload keeps valid verse and image overrides', () => {
  const payload = parseMobileContentOverridePayload({
    generatedAt: '2026-04-01T12:00:00.000Z',
    images: [
      {
        altText: 'Sunrise over open Bible',
        endsAt: null,
        id: 'img-1',
        imageUrl: 'https://everybible.app/image.jpg',
        kind: 'verse_of_day',
        startsAt: null,
        title: 'Verse image',
      },
    ],
    verseOfDay: {
      endsAt: null,
      id: 'vod-1',
      imageUrl: 'https://everybible.app/image.jpg',
      referenceLabel: 'Psalm 119:105',
      startsAt: null,
      title: 'Today',
      translationId: 'BSB',
      verseText: 'Your word is a lamp to my feet and a light to my path.',
    },
  });

  assert.ok(payload);
  assert.equal(payload.images.length, 1);
  assert.equal(payload.verseOfDay?.referenceLabel, 'Psalm 119:105');
});

test('getLiveVerseOfDayOverride returns null when the remote payload omits verse data', async () => {
  const previousEndpoint = publicRuntimeConfig.EXPO_PUBLIC_CONTENT_API_URL;
  publicRuntimeConfig.EXPO_PUBLIC_CONTENT_API_URL = 'https://everybible.app/api/mobile/content';

  const override = await getLiveVerseOfDayOverride(async () => {
    return new Response(
      JSON.stringify({
        generatedAt: '2026-04-02T12:00:00.000Z',
        images: [],
        verseOfDay: null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });

  publicRuntimeConfig.EXPO_PUBLIC_CONTENT_API_URL = previousEndpoint;

  assert.equal(override, null);
});
