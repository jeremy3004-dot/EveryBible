import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { mockModule } from '../../testing/mockModules';
import type { ReadingPlanCoverKey } from './types';

// Under Metro a `require()` of a PNG resolves to an opaque asset id (a number).
// Node would try to parse the PNG as JavaScript, so every cover file is mocked
// with a distinct id — which both makes the module loadable and lets each key be
// asserted against the exact file it points at.
const COVER_FILES = [
  'canyon',
  'desert',
  'dunes',
  'faithObedience',
  'field',
  'forest',
  'gospelFoundations',
  'greatCommission',
  'hearingGodVoice',
  'holinessSanctification',
  'identityInChrist',
  'kathisma',
  'kingdomOfGod',
  'lakeLandscape',
  'mountains',
  'pineSky',
  'prayerIntimacy',
  'riverForest',
  'sandDune',
  'seashore',
  'shore',
  'spiritualWarfare',
  'stars',
  'sunrise',
  'valley',
] as const;

const assetIdByFile = new Map<string, number>();
COVER_FILES.forEach((file, index) => {
  const assetId = 1000 + index;
  assetIdByFile.set(file, assetId);
  const path = fileURLToPath(
    new URL(`../../../assets/plans/covers/${file}.png`, import.meta.url).href
  );
  // A CJS `require` of a mocked module unwraps `default`, matching Metro's
  // "the require evaluates to the asset id" behaviour.
  mockModule(mock, path, { default: assetId });
});

const assetFor = (file: (typeof COVER_FILES)[number]) => assetIdByFile.get(file);

/** Every key the ReadingPlanCoverKey union allows, and the file it must use. */
const EXPECTED_FILE_BY_KEY: Record<ReadingPlanCoverKey, (typeof COVER_FILES)[number]> = {
  desert: 'desert',
  dunes: 'dunes',
  faithObedience: 'faithObedience',
  field: 'field',
  forest: 'forest',
  gospelFoundations: 'gospelFoundations',
  greatCommission: 'greatCommission',
  hearingGodVoice: 'hearingGodVoice',
  holinessSanctification: 'holinessSanctification',
  identityInChrist: 'identityInChrist',
  kathisma: 'kathisma',
  kingdomOfGod: 'kingdomOfGod',
  lakeLandscape: 'lakeLandscape',
  mountains: 'mountains',
  pineSky: 'pineSky',
  prayerIntimacy: 'prayerIntimacy',
  river: 'shore',
  riverForest: 'riverForest',
  sandDune: 'sandDune',
  seashore: 'seashore',
  spiritualWarfare: 'spiritualWarfare',
  stars: 'stars',
  sunrise: 'sunrise',
  valley: 'valley',
};

const loadAssets = () => import('./readingPlanAssets');

for (const [coverKey, file] of Object.entries(EXPECTED_FILE_BY_KEY) as Array<
  [ReadingPlanCoverKey, (typeof COVER_FILES)[number]]
>) {
  test(`the ${coverKey} cover key resolves to the ${file} image`, async () => {
    const { getReadingPlanCoverSource } = await loadAssets();

    assert.equal(getReadingPlanCoverSource({ coverKey }), assetFor(file));
  });
}

test('the river key and the legacy shore key share one image', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  // `shore` predates the ReadingPlanCoverKey union but is still in the asset
  // table, so plan rows written before the rename keep rendering.
  assert.equal(
    getReadingPlanCoverSource({ coverKey: 'river' }),
    getReadingPlanCoverSource({ coverKey: 'shore' as ReadingPlanCoverKey })
  );
  assert.equal(getReadingPlanCoverSource({ coverKey: 'river' }), assetFor('shore'));
});

test('the canyon image ships even though no cover key names it today', async () => {
  const { getReadingPlanCoverSource, READING_PLAN_COVER_SOURCES } = await loadAssets();

  assert.equal(
    getReadingPlanCoverSource({ coverKey: 'canyon' as ReadingPlanCoverKey }),
    assetFor('canyon')
  );
  assert.ok(READING_PLAN_COVER_SOURCES.includes(assetFor('canyon')!));
});

test('cover_image_key wins over the other two spellings', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  const source = getReadingPlanCoverSource({
    cover_image_key: 'stars',
    cover_key: 'desert',
    coverKey: 'valley',
  });

  assert.equal(source, assetFor('stars'));
});

test('cover_key wins over coverKey when there is no cover_image_key', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  const source = getReadingPlanCoverSource({ cover_key: 'desert', coverKey: 'valley' });

  assert.equal(source, assetFor('desert'));
});

test('a null cover_image_key falls through to the next spelling instead of blanking the cover', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  const source = getReadingPlanCoverSource({ cover_image_key: null, coverKey: 'valley' });

  assert.equal(source, assetFor('valley'));
});

test('a plan with no cover key at all resolves to null', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  assert.equal(getReadingPlanCoverSource({}), null);
});

test('a plan whose every cover field is null resolves to null', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  assert.equal(
    getReadingPlanCoverSource({ cover_image_key: null, cover_key: null, coverKey: null }),
    null
  );
});

test('a cover key with no bundled image resolves to null rather than undefined', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  // A plan row synced from Supabase can name a cover this build does not ship.
  const source = getReadingPlanCoverSource({
    cover_image_key: 'nebula' as ReadingPlanCoverKey,
  });

  assert.equal(source, null);
});

test('an empty-string cover key resolves to null', async () => {
  const { getReadingPlanCoverSource } = await loadAssets();

  assert.equal(getReadingPlanCoverSource({ cover_key: '' as ReadingPlanCoverKey }), null);
});

test('the preload list holds every distinct cover image exactly once', async () => {
  const { READING_PLAN_COVER_SOURCES } = await loadAssets();

  const sorted = [...READING_PLAN_COVER_SOURCES].sort();
  assert.deepEqual(sorted, [...assetIdByFile.values()].sort());
  assert.equal(new Set(READING_PLAN_COVER_SOURCES).size, READING_PLAN_COVER_SOURCES.length);
});

test('the preload list covers every image any plan can ask for', async () => {
  const { READING_PLAN_COVER_SOURCES, getReadingPlanCoverSource } = await loadAssets();
  const preloaded = new Set(READING_PLAN_COVER_SOURCES);

  for (const coverKey of Object.keys(EXPECTED_FILE_BY_KEY) as ReadingPlanCoverKey[]) {
    assert.ok(
      preloaded.has(getReadingPlanCoverSource({ coverKey })!),
      `${coverKey} resolves to an image that is never preloaded`
    );
  }
});
