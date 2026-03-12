import test from 'node:test';
import assert from 'node:assert/strict';
import { harvestStudySections, type HarvestStudySection } from './harvestStudies';

test('exports a typed sectioned harvest study model', () => {
  const typedSections: HarvestStudySection[] = harvestStudySections;
  assert.equal(Array.isArray(typedSections), true);
  assert.equal(typedSections.length, 7);
});

test('uses chapter-only references for every harvest chapter entry', () => {
  for (const section of harvestStudySections) {
    for (const group of section.groups) {
      for (const entry of group.entries) {
        assert.deepEqual(Object.keys(entry).sort(), ['bookId', 'chapter']);
        assert.equal(typeof entry.bookId, 'string');
        assert.equal(Number.isInteger(entry.chapter), true);
        assert.equal(entry.chapter > 0, true);
        assert.equal('verse' in entry, false);
      }
    }
  }
});

test('includes the requested top-level harvest sections', () => {
  assert.deepEqual(
    harvestStudySections.map((section) => section.title),
    [
      'Christology',
      'The Gospel',
      'Prayer',
      'Love and Christian Living',
      'Discipleship',
      'The Church',
      'Mission / Harvest',
    ]
  );
});

test('models Christology with six sustained chapter groups', () => {
  const christology = harvestStudySections.find((section) => section.id === 'christology');
  assert.ok(christology);

  assert.deepEqual(
    christology.groups.map((group) => group.title),
    [
      'The Eternal Christ (Pre-existence)',
      'The Birth of Jesus (Incarnation)',
      'The Mission of Jesus',
      'The Death of Jesus (Atonement)',
      'The Resurrection of Jesus',
      'The Exalted Christ',
    ]
  );
});

test('keeps an explicit chapter ordering for every study group', () => {
  const actualReferences = harvestStudySections.map((section) => ({
    id: section.id,
    groups: section.groups.map((group) => ({
      title: group.title,
      references: group.entries.map((entry) => `${entry.bookId} ${entry.chapter}`),
    })),
  }));

  assert.deepEqual(actualReferences, [
    {
      id: 'christology',
      groups: [
        {
          title: 'The Eternal Christ (Pre-existence)',
          references: ['JHN 1', 'COL 1', 'HEB 1'],
        },
        {
          title: 'The Birth of Jesus (Incarnation)',
          references: ['MAT 1', 'MAT 2', 'LUK 1', 'LUK 2'],
        },
        {
          title: 'The Mission of Jesus',
          references: ['MRK 1', 'LUK 4', 'JHN 3'],
        },
        {
          title: 'The Death of Jesus (Atonement)',
          references: ['MAT 26', 'MAT 27', 'JHN 19'],
        },
        {
          title: 'The Resurrection of Jesus',
          references: ['MAT 28', 'LUK 24', '1CO 15'],
        },
        {
          title: 'The Exalted Christ',
          references: ['ACT 1', 'PHP 2', 'REV 1'],
        },
      ],
    },
    {
      id: 'gospel',
      groups: [
        {
          title: 'The Gospel (Salvation)',
          references: ['ROM 3', 'ROM 5', 'ROM 8', 'EPH 2', '1CO 15'],
        },
      ],
    },
    {
      id: 'prayer',
      groups: [
        {
          title: 'Prayer',
          references: ['MAT 6', 'LUK 11', 'JHN 17', 'PSA 51'],
        },
      ],
    },
    {
      id: 'love-and-christian-living',
      groups: [
        {
          title: 'Love and Christian Living',
          references: ['1CO 13', 'ROM 12', 'GAL 5', 'COL 3'],
        },
      ],
    },
    {
      id: 'discipleship',
      groups: [
        {
          title: 'Discipleship',
          references: ['MAT 5', 'MAT 6', 'MAT 7', 'LUK 14'],
        },
      ],
    },
    {
      id: 'church',
      groups: [
        {
          title: 'The Church',
          references: ['ACT 2', 'ACT 4', 'EPH 4'],
        },
      ],
    },
    {
      id: 'mission-harvest',
      groups: [
        {
          title: 'Mission / Harvest',
          references: ['MAT 9', 'MAT 28', 'ACT 1'],
        },
      ],
    },
  ]);
});
