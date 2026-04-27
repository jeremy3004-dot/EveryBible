import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_MUSIC_OPTIONS } from './backgroundMusicCatalog';

test('background music catalog exposes the bundled listen options with source metadata', () => {
  assert.deepEqual(
    BACKGROUND_MUSIC_OPTIONS.map((option) => option.id),
    ['off', 'ambient', 'piano', 'soft-guitar', 'sitar', 'ocean-waves']
  );

  assert.equal(BACKGROUND_MUSIC_OPTIONS[0]?.label, 'Off');
  assert.equal(BACKGROUND_MUSIC_OPTIONS[0]?.license, 'Built-in');

  const ambient = BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === 'ambient');
  assert.equal(ambient?.license, 'CC0');
  assert.match(ambient?.credit ?? '', /Cleyton Kauffman/);
  assert.match(ambient?.sourceUrl ?? '', /underwater-theme/);

  const sitar = BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === 'sitar');
  assert.match(sitar?.license ?? '', /CC-BY/);
  assert.match(sitar?.credit ?? '', /Spring Spring/);
});
