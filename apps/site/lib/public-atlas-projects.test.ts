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
