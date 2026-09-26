import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_MUSIC_OPTIONS, getBackgroundMusicVolume } from './backgroundMusicCatalog';

test('background music catalog exposes the bundled listen options with source metadata', () => {
  assert.deepEqual(
    BACKGROUND_MUSIC_OPTIONS.map((option) => option.id),
    ['off', 'ambient', 'piano', 'soft-guitar', 'harp', 'flute', 'sitar', 'ocean-waves']
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

  const harp = BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === 'harp');
  assert.equal(harp?.license, 'CC0');
  assert.match(harp?.credit ?? '', /Cynic Project/);
  assert.match(harp?.sourceUrl ?? '', /a-new-town-rpg-theme/);

  const flute = BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === 'flute');
  assert.equal(flute?.license, 'CC0');
  assert.match(flute?.credit ?? '', /KiluaBoy/);
  assert.match(flute?.sourceUrl ?? '', /through-fire-through-sea/);
});

test('every sound in the shipped catalog is bundled with the app', () => {
  assert.deepEqual(
    BACKGROUND_MUSIC_OPTIONS.filter((option) => option.source.kind !== 'bundled'),
    []
  );
});

test('the middle of the Sound level plays each sound at its catalog volume', () => {
  assert.equal(getBackgroundMusicVolume(0.16, 0.5), 0.16);
  assert.equal(getBackgroundMusicVolume(0.28, 0.5), 0.28);
});

test('the Sound level scales the catalog volume, doubling it at the top, capped at full', () => {
  assert.equal(getBackgroundMusicVolume(0.2, 0), 0);
  assert.equal(getBackgroundMusicVolume(0.2, 0.25), 0.1);
  assert.equal(getBackgroundMusicVolume(0.2, 1), 0.4);
  assert.equal(getBackgroundMusicVolume(0.7, 1), 1);
});
