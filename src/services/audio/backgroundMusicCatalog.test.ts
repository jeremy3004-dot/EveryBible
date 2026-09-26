import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_MUSIC_OPTIONS, getBackgroundMusicVolume } from './backgroundMusicCatalog';
import { BACKGROUND_MUSIC_CHOICES } from '../../types/audio';

test('background music catalog exposes the listen options with source metadata', () => {
  assert.deepEqual(
    BACKGROUND_MUSIC_OPTIONS.map((option) => option.id),
    [
      'off',
      'ambient',
      'piano',
      'piano-cello',
      'soft-guitar',
      'harp',
      'flute',
      'sitar',
      'hymns',
      'gregorian-chant',
      'organ',
      'ocean-waves',
      'rain',
      'gentle-breeze',
      'summer-night',
      'waterfall',
      'birdsong',
      'shore',
      'fireplace',
      'church-bells',
      'village',
      'garden',
      'wilderness',
    ]
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

test('the first eight sounds ship in the app and the rest stream from a versioned path', () => {
  const bundled = [
    'off',
    'ambient',
    'piano',
    'soft-guitar',
    'harp',
    'flute',
    'sitar',
    'ocean-waves',
  ];
  for (const option of BACKGROUND_MUSIC_OPTIONS) {
    if (bundled.includes(option.id)) {
      assert.deepEqual(option.source, { kind: 'bundled' }, option.id);
    } else {
      // The path is what was uploaded to R2; a changed file must move to a new version.
      assert.deepEqual(
        option.source,
        { kind: 'remote', path: `background-sounds/v1/${option.id}.m4a` },
        option.id
      );
    }
  }
});

test('every streamed sound carries an open licence and a credit for the About screen', () => {
  for (const option of BACKGROUND_MUSIC_OPTIONS.filter((entry) => entry.source.kind === 'remote')) {
    assert.match(option.license, /^(CC0|CC-BY 3\.0|CC-BY-SA 4\.0|Public domain)$/, option.id);
    assert.ok(option.credit.length > 0, `${option.id} needs a credit`);
    assert.match(
      option.sourceUrl,
      /^https:\/\/(freesound\.org|commons\.wikimedia\.org)\//,
      option.id
    );
    assert.ok(option.defaultVolume > 0 && option.defaultVolume <= 0.5, option.id);
  }
});

test('every choice except Shuffle has a catalog entry', () => {
  const listed = new Set(BACKGROUND_MUSIC_OPTIONS.map((option) => option.id));
  assert.deepEqual(
    BACKGROUND_MUSIC_CHOICES.filter((choice) => choice !== 'shuffle' && !listed.has(choice)),
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
