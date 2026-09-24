import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserAnnotation } from '../../services/supabase/types';
import { buildReaderHighlightIndex } from './bibleReaderRenderModel';
import {
  applyReaderAnnotationEdits,
  planReaderHighlightApply,
  planReaderHighlightRemove,
  planReaderNoteSave,
  type ReaderAnnotationEdits,
} from './readerAnnotationEdits';

const chapter = { book: 'JHN', chapter: 3 };

function annotation(
  id: string,
  type: UserAnnotation['type'],
  verseStart: number,
  verseEnd: number | null,
  extra: Partial<UserAnnotation> = {}
): UserAnnotation {
  return {
    id,
    user_id: 'local',
    book: 'JHN',
    chapter: 3,
    verse_start: verseStart,
    verse_end: verseEnd,
    type,
    color: type === 'highlight' ? 'yellow' : null,
    content: type === 'note' ? 'note text' : null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    synced_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    ...extra,
  };
}

function idFactory() {
  let next = 0;
  return () => `new-${++next}`;
}

/** Replays the edits on the chapter's annotation list, the way the local store would. */
function replay(annotations: UserAnnotation[], edits: ReaderAnnotationEdits): UserAnnotation[] {
  const deleted = new Set(edits.softDeleteIds);
  const byId = new Map(
    annotations.filter((item) => !deleted.has(item.id)).map((item) => [item.id, item])
  );
  for (const draft of edits.upserts) {
    byId.set(draft.id, {
      ...annotation(draft.id, draft.type, draft.verse_start, draft.verse_end),
      ...draft,
    });
  }
  return [...byId.values()].sort((left, right) => left.verse_start - right.verse_start);
}

/** The colour the reader paints on each verse, which is what the listener actually sees. */
function paintedColors(annotations: UserAnnotation[], lastVerse = 10) {
  const index = buildReaderHighlightIndex(annotations, lastVerse);
  return Object.fromEntries([...index.entries()].map(([verse, item]) => [verse, item.color]));
}

test('removing a colour from one verse of a longer highlight keeps the rest highlighted', () => {
  // Verses 1-3 were highlighted together; the sheet shows yellow as active for verse 2, and
  // tapping it used to look for a highlight covering exactly 2-2, find none, and do nothing.
  const annotations = [annotation('h1', 'highlight', 1, 3)];

  const edits = planReaderHighlightRemove({
    ...chapter,
    annotations,
    selectedVerses: [2],
    color: 'yellow',
    createId: idFactory(),
  });

  assert.deepEqual(paintedColors(replay(annotations, edits)), { 1: 'yellow', 3: 'yellow' });
});

test('removing a colour across verses highlighted one at a time clears each of them', () => {
  const annotations = [
    annotation('h1', 'highlight', 1, null),
    annotation('h2', 'highlight', 2, null),
  ];

  const edits = planReaderHighlightRemove({
    ...chapter,
    annotations,
    selectedVerses: [1, 2],
    color: 'yellow',
    createId: idFactory(),
  });

  assert.deepEqual(edits.softDeleteIds, ['h1', 'h2']);
  assert.deepEqual(paintedColors(replay(annotations, edits)), {});
});

test('removing one colour leaves a different colour on the same verses alone', () => {
  const annotations = [annotation('h1', 'highlight', 4, null, { color: 'blue' })];

  const edits = planReaderHighlightRemove({
    ...chapter,
    annotations,
    selectedVerses: [4],
    color: 'yellow',
    createId: idFactory(),
  });

  assert.deepEqual(edits, { softDeleteIds: [], upserts: [] });
});

test('recolouring part of a highlight shows the new colour on the selected verses', () => {
  // The reader paints the first highlight covering a verse, so a new blue 2-2 beside an
  // older yellow 1-3 used to stay yellow on screen.
  const annotations = [annotation('h1', 'highlight', 1, 3)];

  const edits = planReaderHighlightApply({
    ...chapter,
    annotations,
    selectedVerses: [2],
    color: 'blue',
    createId: idFactory(),
  });

  assert.deepEqual(paintedColors(replay(annotations, edits)), {
    1: 'yellow',
    2: 'blue',
    3: 'yellow',
  });
});

test('recolouring exactly the highlighted verses updates that highlight in place', () => {
  const annotations = [annotation('h1', 'highlight', 5, 7)];

  const edits = planReaderHighlightApply({
    ...chapter,
    annotations,
    selectedVerses: [5, 6, 7],
    color: 'green',
    createId: idFactory(),
  });

  assert.deepEqual(edits, {
    softDeleteIds: [],
    upserts: [
      {
        id: 'h1',
        book: 'JHN',
        chapter: 3,
        verse_start: 5,
        verse_end: 7,
        type: 'highlight',
        color: 'green',
        content: null,
        deleted_at: null,
      },
    ],
  });
});

test('highlighting new verses creates one highlight per run of selected verses', () => {
  const edits = planReaderHighlightApply({
    ...chapter,
    annotations: [],
    selectedVerses: [9, 1, 2],
    color: 'yellow',
    createId: idFactory(),
  });

  assert.deepEqual(
    edits.upserts.map((draft) => [draft.id, draft.verse_start, draft.verse_end]),
    [
      ['new-1', 1, 2],
      ['new-2', 9, null],
    ]
  );
});

test('highlight edits ignore notes, bookmarks and deleted highlights', () => {
  const annotations = [
    annotation('n1', 'note', 2, null),
    annotation('b1', 'bookmark', 2, null),
    annotation('gone', 'highlight', 2, null, { deleted_at: '2026-09-02T00:00:00.000Z' }),
  ];

  const edits = planReaderHighlightRemove({
    ...chapter,
    annotations,
    selectedVerses: [2],
    color: 'yellow',
    createId: idFactory(),
  });

  assert.deepEqual(edits, { softDeleteIds: [], upserts: [] });
});

test('saving a note over an existing overlapping note edits that note instead of adding one', () => {
  // The sheet pre-fills the overlapping note; saving used to write a second note for the
  // selected range and leave the original beside it.
  const annotations = [annotation('n1', 'note', 2, null, { content: 'first thought' })];

  const edits = planReaderNoteSave({
    ...chapter,
    annotations,
    selectedVerses: [1, 2, 3],
    content: 'first thought, revised',
    createId: idFactory(),
  });

  assert.deepEqual(edits, {
    softDeleteIds: [],
    upserts: [
      {
        id: 'n1',
        book: 'JHN',
        chapter: 3,
        verse_start: 2,
        verse_end: null,
        type: 'note',
        color: null,
        content: 'first thought, revised',
        deleted_at: null,
      },
    ],
  });
});

test('saving a note with no existing note creates one per run of selected verses', () => {
  const edits = planReaderNoteSave({
    ...chapter,
    annotations: [annotation('h1', 'highlight', 1, 3)],
    selectedVerses: [1, 2, 5],
    content: 'new note',
    createId: idFactory(),
  });

  assert.deepEqual(
    edits.upserts.map((draft) => [draft.id, draft.type, draft.verse_start, draft.verse_end]),
    [
      ['new-1', 'note', 1, 2],
      ['new-2', 'note', 5, null],
    ]
  );
});

test('a failed write never loses a highlight on verses outside the selection', async () => {
  // Yellow covers 1-5 and the reader paints verse 3 blue: the yellow is split around it.
  // If a write fails partway, the yellow on 1-2 and 4-5 must survive; the old order
  // deleted the 1-5 highlight first and then failed to write its replacements.
  let stored = [annotation('yellow', 'highlight', 1, 5)];
  const edits = planReaderHighlightApply({
    ...chapter,
    annotations: stored,
    selectedVerses: [3],
    color: 'blue',
    createId: idFactory(),
  });

  const succeeded = await applyReaderAnnotationEdits(edits, {
    softDelete: async (id) => {
      stored = stored.filter((item) => item.id !== id);
      return { success: true };
    },
    upsert: async (draft) => {
      if (draft.verse_start === 1) return { success: false };
      stored = replay(stored, { softDeleteIds: [], upserts: [draft] });
      return { success: true };
    },
  });

  assert.equal(succeeded, false);
  const painted = paintedColors(stored);
  for (const verse of [1, 2, 4, 5]) {
    assert.equal(painted[verse], 'yellow', `verse ${verse} kept its highlight`);
  }
});

test('applying edits writes before it deletes and stops at the first failure', async () => {
  const calls: string[] = [];
  const edits: ReaderAnnotationEdits = {
    softDeleteIds: ['old'],
    upserts: [
      planReaderNoteSave({
        ...chapter,
        annotations: [],
        selectedVerses: [1],
        content: 'a',
        createId: () => 'first',
      }).upserts[0],
      planReaderNoteSave({
        ...chapter,
        annotations: [],
        selectedVerses: [2],
        content: 'b',
        createId: () => 'second',
      }).upserts[0],
    ],
  };

  const succeeded = await applyReaderAnnotationEdits(edits, {
    softDelete: async (id) => {
      calls.push(`delete ${id}`);
      return { success: true };
    },
    upsert: async (draft) => {
      calls.push(`upsert ${draft.id}`);
      return { success: draft.id !== 'first' };
    },
  });

  assert.equal(succeeded, false);
  assert.deepEqual(calls, ['upsert first']);
});
