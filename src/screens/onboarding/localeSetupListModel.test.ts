import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBibleLanguageListItems,
  buildContentLanguageListItems,
  buildCountryListItems,
  getLocaleSetupGroupPosition,
  isLastInLocaleSetupGroup,
  type BibleLanguageListInput,
} from './localeSetupListModel';

interface TestOption {
  key: string;
}

const option = (key: string): TestOption => ({ key });

const bibleInput = (
  overrides: Partial<BibleLanguageListInput<TestOption>> = {}
): BibleLanguageListInput<TestOption> => ({
  sections: [],
  primaryOption: null,
  showsPrimaryOption: true,
  pinsRecommendedOption: true,
  showsFullList: true,
  isHydratingRuntimeCatalog: false,
  runtimeCatalogLoadFailed: false,
  hasAnyOptions: true,
  recommendedLabel: 'RECOMMENDED',
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Group positions                                                            */
/* -------------------------------------------------------------------------- */

test('a one-row group is drawn as a complete card', () => {
  assert.equal(getLocaleSetupGroupPosition(0, 1), 'only');
  assert.equal(isLastInLocaleSetupGroup('only'), true);
});

test('a two-row group has a first and a last row and no middle', () => {
  assert.deepEqual(
    [getLocaleSetupGroupPosition(0, 2), getLocaleSetupGroupPosition(1, 2)],
    ['first', 'last']
  );
  assert.equal(isLastInLocaleSetupGroup('first'), false);
  assert.equal(isLastInLocaleSetupGroup('last'), true);
});

test('an n-row group fills its interior with middle rows', () => {
  const positions = [0, 1, 2, 3, 4].map((index) => getLocaleSetupGroupPosition(index, 5));

  assert.deepEqual(positions, ['first', 'middle', 'middle', 'middle', 'last']);
  assert.equal(isLastInLocaleSetupGroup('middle'), false);
});

test('an empty group cannot produce a stray edge', () => {
  assert.equal(getLocaleSetupGroupPosition(0, 0), 'only');
});

/* -------------------------------------------------------------------------- */
/* Bible language step                                                        */
/* -------------------------------------------------------------------------- */

test('Bible language sections flatten to an eyebrow followed by positioned rows', () => {
  const items = buildBibleLanguageListItems(
    bibleInput({
      sections: [
        { groupLabel: 'E', options: [option('english')] },
        { groupLabel: 'N', options: [option('nepali'), option('newari'), option('ngbaka')] },
      ],
    })
  );

  assert.deepEqual(
    items.map((item) => item.type),
    ['eyebrow', 'option', 'eyebrow', 'option', 'option', 'option']
  );

  assert.deepEqual(
    items.flatMap((item) => (item.type === 'eyebrow' ? [item.label] : [])),
    ['E', 'N']
  );

  assert.deepEqual(
    items.flatMap((item) => (item.type === 'option' ? [item.position] : [])),
    ['only', 'first', 'middle', 'last']
  );
});

test('the pinned recommendation is shown once and dropped from its alphabetical section', () => {
  const primaryOption = option('english');
  const items = buildBibleLanguageListItems(
    bibleInput({
      primaryOption,
      sections: [
        { groupLabel: 'E', options: [primaryOption, option('estonian')] },
        { groupLabel: 'N', options: [option('nepali')] },
      ],
    })
  );

  assert.deepEqual(
    items.map((item) => item.id),
    [
      'eyebrow-recommended',
      'primary-english',
      'eyebrow-E',
      'option-estonian',
      'eyebrow-N',
      'option-nepali',
    ]
  );

  const [recommendedEyebrow, primaryItem] = items;
  assert.equal(recommendedEyebrow.type === 'eyebrow' && recommendedEyebrow.label, 'RECOMMENDED');
  assert.equal(
    recommendedEyebrow.type === 'eyebrow' && recommendedEyebrow.hasSectionSpacing,
    false,
    'the recommendation eyebrow sits flush under the search field'
  );
  assert.equal(primaryItem.type === 'primaryOption' && primaryItem.isRecommended, true);

  // Estonian is alone in its section once English is pinned away, so it draws a
  // complete card rather than the top half of one.
  const estonian = items.find((item) => item.id === 'option-estonian');
  assert.equal(estonian?.type === 'option' && estonian.position, 'only');
});

test('a section left empty by the pinned recommendation drops its eyebrow too', () => {
  const primaryOption = option('english');
  const items = buildBibleLanguageListItems(
    bibleInput({
      primaryOption,
      sections: [
        { groupLabel: 'E', options: [primaryOption] },
        { groupLabel: 'N', options: [option('nepali')] },
      ],
    })
  );

  assert.equal(
    items.some((item) => item.id === 'eyebrow-E'),
    false,
    'an eyebrow with no rows under it would read as a broken section'
  );
  assert.deepEqual(
    items.map((item) => item.id),
    ['eyebrow-recommended', 'primary-english', 'eyebrow-N', 'option-nepali']
  );
});

test('outside initial mode nothing is pinned and every option stays in its section', () => {
  const primaryOption = option('english');
  const items = buildBibleLanguageListItems(
    bibleInput({
      primaryOption,
      showsPrimaryOption: false,
      pinsRecommendedOption: false,
      sections: [{ groupLabel: 'E', options: [primaryOption, option('estonian')] }],
    })
  );

  assert.deepEqual(
    items.map((item) => item.id),
    ['eyebrow-E', 'option-english', 'option-estonian']
  );
  assert.equal(
    items.some((item) => item.type === 'primaryOption'),
    false
  );
});

test('the pinned recommendation can be shown without the RECOMMENDED chip', () => {
  const primaryOption = option('english');
  const items = buildBibleLanguageListItems(
    bibleInput({ primaryOption, pinsRecommendedOption: false })
  );

  const primaryItem = items.find((item) => item.type === 'primaryOption');
  assert.equal(primaryItem?.type === 'primaryOption' && primaryItem.isRecommended, false);
});

test('hydration shows a spinner and holds back the empty card', () => {
  const items = buildBibleLanguageListItems(
    bibleInput({ isHydratingRuntimeCatalog: true, hasAnyOptions: false })
  );

  assert.deepEqual(
    items.map((item) => item.type),
    ['loading'],
    'an empty card while the catalog is still loading would be a lie'
  );
});

test('a failed catalog load keeps its retry card above whatever is already bundled', () => {
  const items = buildBibleLanguageListItems(
    bibleInput({
      runtimeCatalogLoadFailed: true,
      sections: [{ groupLabel: 'E', options: [option('english')] }],
    })
  );

  assert.deepEqual(
    items.map((item) => item.type),
    ['catalogError', 'eyebrow', 'option']
  );
});

test('an empty catalog falls back to the empty card', () => {
  const items = buildBibleLanguageListItems(bibleInput({ hasAnyOptions: false }));

  assert.deepEqual(
    items.map((item) => item.id),
    ['empty']
  );
});

test('hiding the full list keeps the pinned recommendation only', () => {
  const primaryOption = option('english');
  const items = buildBibleLanguageListItems(
    bibleInput({
      primaryOption,
      showsFullList: false,
      sections: [{ groupLabel: 'N', options: [option('nepali')] }],
    })
  );

  assert.deepEqual(
    items.map((item) => item.id),
    ['eyebrow-recommended', 'primary-english']
  );
});

test('every Bible language item carries a stable, unique key', () => {
  const primaryOption = option('english');
  const items = buildBibleLanguageListItems(
    bibleInput({
      primaryOption,
      runtimeCatalogLoadFailed: true,
      sections: [
        { groupLabel: 'E', options: [primaryOption, option('estonian')] },
        { groupLabel: 'N', options: [option('nepali')] },
      ],
    })
  );
  const ids = items.map((item) => item.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    ids.every((id) => !/^\d+$/.test(id)),
    true,
    'ids must be derived from the data, never from the list index'
  );
});

/* -------------------------------------------------------------------------- */
/* Nation step                                                                */
/* -------------------------------------------------------------------------- */

test('the nation step pins the device suggestion above the full list', () => {
  const items = buildCountryListItems({
    suggestedCountryCode: 'NP',
    listedCountryCodes: ['IN', 'US'],
    suggestedLabel: 'SUGGESTED FROM DEVICE',
    listLabel: 'ALL NATIONS',
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ['eyebrow-suggested', 'suggested-NP', 'eyebrow-countries', 'country-IN', 'country-US']
  );

  assert.deepEqual(
    items.flatMap((item) => (item.type === 'country' ? [item.position] : [])),
    ['first', 'last']
  );

  assert.deepEqual(
    items.flatMap((item) => (item.type === 'eyebrow' ? [item.hasSectionSpacing] : [])),
    [true, true]
  );
});

test('a search with no suggestion opens straight into the results', () => {
  const items = buildCountryListItems({
    suggestedCountryCode: null,
    listedCountryCodes: ['NP'],
    suggestedLabel: 'SUGGESTED FROM DEVICE',
    listLabel: 'SEARCH RESULTS',
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ['eyebrow-countries', 'country-NP']
  );
  assert.equal(items[1].type === 'country' && items[1].position, 'only');
});

test('a nation search that matches nothing keeps its eyebrow and shows the empty card', () => {
  const items = buildCountryListItems({
    suggestedCountryCode: null,
    listedCountryCodes: [],
    suggestedLabel: 'SUGGESTED FROM DEVICE',
    listLabel: 'SEARCH RESULTS',
  });

  assert.deepEqual(
    items.map((item) => item.type),
    ['eyebrow', 'empty']
  );
});

/* -------------------------------------------------------------------------- */
/* Content language step                                                      */
/* -------------------------------------------------------------------------- */

test('language results flatten into a recommended group and a global group', () => {
  const items = buildContentLanguageListItems({
    recommended: [{ code: 'nep' }, { code: 'new' }],
    global: [{ code: 'eng' }],
    recommendedLabel: 'RECOMMENDED FOR NEPAL',
    moreLabel: 'MORE LANGUAGES',
  });

  assert.deepEqual(
    items.map((item) => item.id),
    [
      'eyebrow-recommended-languages',
      'recommended-nep',
      'recommended-new',
      'eyebrow-more-languages',
      'global-eng',
    ]
  );

  assert.deepEqual(
    items.flatMap((item) => (item.type === 'language' ? [item.position] : [])),
    ['first', 'last', 'only']
  );

  assert.deepEqual(
    items.flatMap((item) => (item.type === 'language' ? [item.isRecommended] : [])),
    [true, true, false]
  );
});

test('a language that is both recommended and global keeps two distinct keys', () => {
  const items = buildContentLanguageListItems({
    recommended: [{ code: 'nep' }],
    global: [{ code: 'nep' }],
    recommendedLabel: 'RECOMMENDED FOR NEPAL',
    moreLabel: 'MORE LANGUAGES',
  });
  const ids = items.map((item) => item.id);

  assert.equal(new Set(ids).size, ids.length);
});

test('an empty group is skipped rather than left as a bare eyebrow', () => {
  const items = buildContentLanguageListItems({
    recommended: [],
    global: [{ code: 'eng' }],
    recommendedLabel: 'RECOMMENDED FOR NEPAL',
    moreLabel: 'MORE LANGUAGES',
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ['eyebrow-more-languages', 'global-eng']
  );
});

test('a language search that matches nothing shows only the empty card', () => {
  const items = buildContentLanguageListItems({
    recommended: [],
    global: [],
    recommendedLabel: 'RECOMMENDED FOR NEPAL',
    moreLabel: 'MORE LANGUAGES',
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ['empty']
  );
});
