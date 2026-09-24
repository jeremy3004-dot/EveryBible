import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../../testing/mockModules';

// The planner's edits applied through the real annotation service and store, which
// match an existing highlight by id or by its book, chapter, first verse and type.
mockMmkvStorage(mock);

type Edits = typeof import('./readerAnnotationEdits');
type Service = typeof import('../../services/annotations/annotationService');
type Store = typeof import('../../stores/annotationStore');

let edits: Edits;
let service: Service;
let store: Store;

before(async () => {
  edits = await import('./readerAnnotationEdits');
  service = await import('../../services/annotations/annotationService');
  store = await import('../../stores/annotationStore');
});

beforeEach(() => {
  store.useAnnotationStore.setState(store.useAnnotationStore.getInitialState(), true);
});

let nextId = 0;
const createId = () => `new-${++nextId}`;

async function highlight(verseStart: number, verseEnd: number, color: string) {
  const result = await service.upsertAnnotation({
    id: createId(),
    book: 'JHN',
    chapter: 3,
    verse_start: verseStart,
    verse_end: verseStart === verseEnd ? null : verseEnd,
    type: 'highlight',
    color,
    content: null,
    deleted_at: null,
  });
  assert.ok(result.success);
}

const chapterAnnotations = async () =>
  (await service.getAnnotationsForChapter('JHN', 3)).data ?? [];

/** The chapter's live highlights as "start-end colour", in verse order. */
const liveHighlights = async () =>
  (await chapterAnnotations())
    .filter((annotation) => annotation.type === 'highlight')
    .map(
      (annotation) =>
        `${annotation.verse_start}-${annotation.verse_end ?? annotation.verse_start} ${annotation.color}`
    );

const apply = async (planned: import('./readerAnnotationEdits').ReaderAnnotationEdits) =>
  edits.applyReaderAnnotationEdits(planned, {
    softDelete: service.softDeleteAnnotation,
    upsert: service.upsertAnnotation,
  });

test('removing a colour from the middle of a highlight succeeds and keeps both ends', async () => {
  await highlight(10, 14, 'yellow');

  const planned = edits.planReaderHighlightRemove({
    book: 'JHN',
    chapter: 3,
    annotations: await chapterAnnotations(),
    selectedVerses: [12],
    createId,
    color: 'yellow',
  });

  assert.equal(await apply(planned), true);
  assert.deepEqual(await liveHighlights(), ['10-11 yellow', '13-14 yellow']);
});

test('painting across two highlights gives each verse exactly one colour', async () => {
  await highlight(3, 4, 'yellow');
  await highlight(5, 7, 'green');

  const planned = edits.planReaderHighlightApply({
    book: 'JHN',
    chapter: 3,
    annotations: await chapterAnnotations(),
    selectedVerses: [4, 5],
    createId,
    color: 'red',
  });

  assert.equal(await apply(planned), true);
  assert.deepEqual(await liveHighlights(), ['3-3 yellow', '4-5 red', '6-7 green']);
});

test('painting the start of a highlight another colour recolours those verses only', async () => {
  await highlight(5, 7, 'green');

  const planned = edits.planReaderHighlightApply({
    book: 'JHN',
    chapter: 3,
    annotations: await chapterAnnotations(),
    selectedVerses: [5, 6],
    createId,
    color: 'red',
  });

  assert.equal(await apply(planned), true);
  assert.deepEqual(await liveHighlights(), ['5-6 red', '7-7 green']);
});

test('removing a colour from the first verse of a highlight keeps the rest', async () => {
  await highlight(5, 7, 'green');

  const planned = edits.planReaderHighlightRemove({
    book: 'JHN',
    chapter: 3,
    annotations: await chapterAnnotations(),
    selectedVerses: [5],
    createId,
    color: 'green',
  });

  assert.equal(await apply(planned), true);
  assert.deepEqual(await liveHighlights(), ['6-7 green']);
});

test('clearing a saved note removes it, and a later note on that verse starts fresh', async () => {
  const saveNote = async (content: string) =>
    apply(
      edits.planReaderNoteSave({
        book: 'JHN',
        chapter: 3,
        annotations: await chapterAnnotations(),
        selectedVerses: [16],
        createId,
        content,
      })
    );
  const liveNotes = async () =>
    (await chapterAnnotations())
      .filter((annotation) => annotation.type === 'note')
      .map((annotation) => annotation.content);

  assert.equal(await saveNote('God so loved'), true);
  assert.equal(await saveNote(''), true);
  assert.deepEqual(await liveNotes(), []);

  assert.equal(await saveNote('Born again'), true);
  assert.deepEqual(await liveNotes(), ['Born again']);
});
