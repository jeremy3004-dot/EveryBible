import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPublicAtlasRecords } from './public-atlas-records';

test('the primary public atlas includes languages and dialects but omits people groups', () => {
  assert.deepEqual(
    selectPublicAtlasRecords([
      { id: 'language', kind: 'language' },
      { id: 'dialect', kind: 'dialect' },
      { id: 'people-group', kind: 'people-group' },
    ]),
    [
      { id: 'language', kind: 'language' },
      { id: 'dialect', kind: 'dialect' },
    ]
  );
});
