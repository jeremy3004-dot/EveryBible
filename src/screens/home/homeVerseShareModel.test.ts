import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHomeVerseShareMessage } from './homeVerseShareModel';

test('builds the verse-of-the-day share message with the title above the reference and verse text', () => {
  assert.equal(
    buildHomeVerseShareMessage({
      cardTitle: 'Verse of the Day',
      referenceLabel: 'John 3:16',
      bodyText: 'For God so loved the world that He gave His one and only Son.',
    }),
    'Verse of the Day\nJohn 3:16\n\nFor God so loved the world that He gave His one and only Son.'
  );
});
