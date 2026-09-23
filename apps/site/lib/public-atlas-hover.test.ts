import assert from 'node:assert/strict';
import test from 'node:test';

import type { AtlasIndex, AtlasLocation, AtlasRecord } from '../../admin/lib/language-atlas/types';
import { publicAtlasHover } from './public-atlas-hover';

// The hover card is plain DOM. A minimal document records what the card
// appends, so the test reads the rendered text rather than the source.
interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeElement[];
  append: (...nodes: FakeElement[]) => void;
}

function createFakeDocument() {
  return {
    createElement(tagName: string): FakeElement {
      const element: FakeElement = {
        tagName,
        className: '',
        textContent: '',
        children: [],
        append: (...nodes) => element.children.push(...nodes),
      };
      return element;
    },
  };
}

const originalDocument = (globalThis as { document?: unknown }).document;
test.beforeEach(() => {
  (globalThis as { document?: unknown }).document = createFakeDocument();
});
test.afterEach(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

const record = (overrides: Partial<AtlasRecord> = {}): AtlasRecord => ({
  id: 'iso:pae',
  kind: 'language',
  name: 'Pagibete',
  aliases: [],
  iso6393: 'pae',
  glottocode: null,
  rolvCode: null,
  parentId: null,
  family: 'Atlantic-Congo',
  countryCodes: ['CD'],
  population: null,
  scriptureStatus: 'nt',
  scriptureScope: 'language',
  languageContextStatus: null,
  location: null,
  sourceIds: ['glottolog'],
  summary: '',
  needsReview: false,
  ...overrides,
});

const atlas = (records: AtlasRecord[]): AtlasIndex => ({
  schemaVersion: 1,
  generatedAt: '2026-09-06T00:00:00Z',
  records,
  countries: [
    { code: 'CD', name: 'DR Congo' },
    { code: 'NP', name: 'Nepal' },
    { code: 'IN', name: 'India' },
    { code: 'BT', name: 'Bhutan' },
  ],
  sources: [],
  counts: {
    records: records.length,
    languages: 0,
    dialects: 0,
    peopleGroups: 0,
    mapped: 0,
    approximate: 0,
    unmapped: 0,
    needsReview: 0,
  },
  notes: [],
});

const location = (precision: AtlasLocation['precision']): AtlasLocation => ({
  latitude: 1,
  longitude: 2,
  precision,
  sourceId: 'glottolog',
  label: 'Point',
  countryCode: 'CD',
});

const render = (card: HTMLElement) =>
  (card as unknown as FakeElement).children.map(({ tagName, className, textContent }) => [
    tagName,
    className,
    textContent,
  ]);

test('a language hover shows its name, flagged country, family and Scripture status', () => {
  const pagibete = record();
  const card = publicAtlasHover(pagibete, undefined, atlas([pagibete]));

  assert.equal(card.className, 'pa-hover-card');
  assert.deepEqual(render(card), [
    ['strong', '', 'Pagibete'],
    ['small', '', '🇨🇩 DR Congo · A language in the Atlantic-Congo family'],
    ['p', 'pa-hover-status', 'New Testament'],
    ['small', 'pa-hover-explore', 'Select the dot to learn more'],
  ]);
});

test('a dialect hover drops the parent prefix and scopes unknown Scripture to the variety', () => {
  const dotyali = record({ id: 'iso:dty', name: 'Dotyali', countryCodes: ['NP'] });
  const baitadeli = record({
    id: 'glottolog:bait1234',
    kind: 'dialect',
    name: 'Dotyali: Baitadeli',
    parentId: dotyali.id,
    countryCodes: ['NP'],
    scriptureScope: 'language',
  });
  const card = publicAtlasHover(baitadeli, location('dialect-area'), atlas([dotyali, baitadeli]));

  assert.deepEqual(render(card), [
    ['strong', '', 'Baitadeli'],
    ['small', '', '🇳🇵 Nepal · A variety of Dotyali'],
    ['p', 'pa-hover-status', 'No known Scripture in Baitadeli'],
    ['small', '', 'Map location'],
    ['small', 'pa-hover-explore', 'Select the dot to learn more'],
  ]);
});

test('a hover lists three countries and counts the rest', () => {
  const widespread = record({ countryCodes: ['CD', 'NP', 'IN', 'BT', 'ZZ'], family: null });
  const card = publicAtlasHover(widespread, undefined, atlas([widespread]));

  assert.equal(render(card)[1][2], '🇨🇩 DR Congo · 🇳🇵 Nepal · 🇮🇳 India · +2 countries · A language');
});

test('a record without countries shows only its identity line', () => {
  const unplaced = record({ countryCodes: [] });
  const card = publicAtlasHover(unplaced, undefined, atlas([unplaced]));

  assert.equal(render(card)[1][2], 'A language in the Atlantic-Congo family');
});

test('inferred placements are labelled approximate; source areas are not', () => {
  const pagibete = record();
  const data = atlas([pagibete]);
  const label = (precision: AtlasLocation['precision']) =>
    render(publicAtlasHover(pagibete, location(precision), data))[3][2];

  assert.equal(label('parent-language'), 'Approximate map location');
  assert.equal(label('country'), 'Approximate map location');
  assert.equal(label('related-people-group'), 'Approximate map location');
  assert.equal(label('language-area'), 'Map location');
  assert.equal(label('people-group-area'), 'Map location');
});

test('provider names are set as text, never parsed as markup', () => {
  const hostile = record({ name: '<img src=x onerror=alert(1)>' });
  const card = publicAtlasHover(hostile, undefined, atlas([hostile]));

  assert.equal(render(card)[0][2], '<img src=x onerror=alert(1)>');
});
