import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectsForRecord,
  projectPercentage,
  projectRecordIds,
  projectSnapshot,
  filterProjects,
} from './public-atlas-projects';
import { DEFAULT_FILTERS } from '../../admin/lib/language-atlas/model';
import type { AtlasRecord } from '../../admin/lib/language-atlas/types';

test('approved portfolio retains all 23 recently active projects and exact map membership', () => {
  assert.equal(projectSnapshot.projects.length, 23);
  assert.equal(projectSnapshot.asOf, '2026-09-07');
  assert.equal(projectsForRecord('iso:byh')[0]?.name, 'Bhujel');
  assert.equal(projectRecordIds.has('iso:yor'), false);
  assert.equal(
    projectSnapshot.projects.some((p) => p.name === 'English - BSB'),
    false
  );
});
test('source percentage is preserved independently of tracked chapter counts', () => {
  const project = projectsForRecord('iso:byh')[0]!;
  assert.equal(projectPercentage(project), '38.9');
  assert.equal(project.chaptersRecorded, 463);
  assert.equal(project.totalChapters, 677);
  assert.equal(project.gospelPercentage, null);
  assert.equal(project.otPercentage, 49.8);
});
test('unmapped projects stay discoverable and project-name search does not need an atlas match', () => {
  assert.equal(filterProjects([], DEFAULT_FILTERS).length, 23);
  assert.equal(
    filterProjects([], { ...DEFAULT_FILTERS, query: 'Singaporean' })[0]?.name,
    'Singaporean Hokkien'
  );
  assert.equal(filterProjects([], { ...DEFAULT_FILTERS, country: 'NP' }).length, 0);
});

const atlasRecord = (overrides: Partial<AtlasRecord> & Pick<AtlasRecord, 'id'>): AtlasRecord => ({
  kind: 'language',
  name: overrides.id,
  aliases: [],
  iso6393: null,
  glottocode: null,
  rolvCode: null,
  parentId: null,
  family: null,
  countryCodes: [],
  population: null,
  scriptureStatus: 'nt',
  scriptureScope: 'language',
  languageContextStatus: null,
  location: null,
  sourceIds: ['everylanguage'],
  summary: '',
  needsReview: false,
  ...overrides,
});

// Four of the portfolio's mapped languages, shaped like the atlas records.
const records = [
  atlasRecord({ id: 'iso:byh', name: 'Bhujel', aliases: ['Bujhyal'], countryCodes: ['NP'] }),
  atlasRecord({ id: 'iso:dhi', name: 'Dhimal', countryCodes: ['IN', 'NP'] }),
  atlasRecord({
    id: 'iso:sat',
    name: 'Santali',
    countryCodes: ['IN', 'NP'],
    scriptureStatus: 'bible',
  }),
  atlasRecord({ id: 'iso:jav', name: 'Javanese', countryCodes: ['ID'], scriptureStatus: 'bible' }),
];
const names = (projects: { name: string }[]) => projects.map((project) => project.name);

test('record filters keep only projects whose mapped language passes them, in snapshot order', () => {
  assert.deepEqual(names(filterProjects(records, { ...DEFAULT_FILTERS, country: 'NP' })), [
    'Bhujel',
    'Dhimal',
    'Santhali',
  ]);
  assert.deepEqual(names(filterProjects(records, { ...DEFAULT_FILTERS, scripture: 'bible' })), [
    'Javanese',
    'Santhali',
  ]);
  assert.deepEqual(names(filterProjects(records, { ...DEFAULT_FILTERS, kind: 'dialect' })), []);
});

test('an explicit language kind hides unmapped projects; the default views keep them', () => {
  assert.deepEqual(names(filterProjects(records, { ...DEFAULT_FILTERS, kind: 'language' })), [
    'Bhujel',
    'Dhimal',
    'Javanese',
    'Santhali',
  ]);
  assert.equal(filterProjects(records, { ...DEFAULT_FILTERS, kind: 'all' }).length, 23);
  assert.equal(filterProjects(records, DEFAULT_FILTERS).length, 23);
});

test('search matches the name and aliases of a loaded atlas record, trimmed and case-insensitive', () => {
  assert.deepEqual(names(filterProjects(records, { ...DEFAULT_FILTERS, query: 'bujhyal' })), [
    'Bhujel',
  ]);
  assert.deepEqual(names(filterProjects(records, { ...DEFAULT_FILTERS, query: '  SANTALI ' })), [
    'Santhali',
  ]);
  assert.deepEqual(names(filterProjects([], { ...DEFAULT_FILTERS, query: 'bujhyal' })), []);
});

test('search also matches the project language name and combines with record filters', () => {
  assert.deepEqual(names(filterProjects([], { ...DEFAULT_FILTERS, query: 'andimul' })), ['Bhujel']);
  assert.deepEqual(
    names(filterProjects(records, { ...DEFAULT_FILTERS, query: 'a', country: 'ID' })),
    ['Javanese']
  );
});

test('a project without a reported percentage says so instead of showing a number', () => {
  // The committed snapshot reports every percentage, so its JSON type has no
  // null; a regenerated snapshot can still carry one from the source.
  const unreported = JSON.parse('{"recordedPercentage":null}') as { recordedPercentage: number };
  assert.equal(projectPercentage(unreported), 'Not reported');
  assert.equal(projectPercentage({ recordedPercentage: 0 }), '0');
});

test('every mapped project is indexed by its record id and unmapped ones are not', () => {
  const mapped = projectSnapshot.projects.filter((project) => project.recordId);
  assert.equal(mapped.length, 17);
  assert.equal(projectRecordIds.size, mapped.length);
  for (const project of mapped) assert.ok(projectRecordIds.has(project.recordId!));
  assert.deepEqual(projectsForRecord('iso:unknown'), []);
});
