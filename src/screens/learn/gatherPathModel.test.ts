import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGatherUpNext } from './gatherPathModel';
import { gatherFoundations } from '../../data/gatherFoundations';

const spanishBookNames: Record<string, string> = { GEN: 'Génesis', EXO: 'Éxodo' };
const resolveSpanish = (bookId: string) => spanishBookNames[bookId] ?? bookId;

test('with nothing completed, up next is the first lesson of the first foundation', () => {
  const upNext = resolveGatherUpNext({}, resolveSpanish);

  assert.equal(upNext?.foundation.id, 'foundation-1');
  assert.equal(upNext?.lesson.id, 'f1-01');
});

test('the up-next reference names the book in the reader language, not English', () => {
  // The card used the data file's English `referenceLabel` ("Genesis 1") while
  // every other Gather surface localised the book name.
  const upNext = resolveGatherUpNext({}, resolveSpanish);

  assert.equal(upNext?.referenceLabel, 'Génesis 1');
});

test('up next skips completed lessons and crosses into the next foundation', () => {
  const first = gatherFoundations[0];
  const upNext = resolveGatherUpNext(
    { [first.id]: first.lessons.map((lesson) => lesson.id) },
    resolveSpanish
  );

  assert.equal(upNext?.foundation.id, 'foundation-2');
  assert.equal(upNext?.lesson.id, gatherFoundations[1].lessons[0].id);
});

test('a gap in the middle of a foundation is resumed before later lessons', () => {
  const upNext = resolveGatherUpNext({ 'foundation-1': ['f1-01', 'f1-03'] }, resolveSpanish);

  assert.equal(upNext?.lesson.id, 'f1-02');
});

test('once every foundation lesson is complete there is nothing up next', () => {
  const everything = Object.fromEntries(
    gatherFoundations.map((foundation) => [
      foundation.id,
      foundation.lessons.map((lesson) => lesson.id),
    ])
  );

  assert.equal(resolveGatherUpNext(everything, resolveSpanish), null);
});
