import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle } from '../../testing/render';
import type { UserAnnotation } from '../../services/supabase/types';
import { installReaderRenderFixture, verseOf } from './BibleReaderScreen.renderFixture';

// The reader loads a chapter's highlights and notes when the chapter opens. The Bible tab
// stays mounted while the user signs in or out elsewhere, and that swaps whose private
// annotations the store holds.
const reader = installReaderRenderFixture(mock, { os: 'android' });
const { t, renderReader, annotationRows, replaceAnnotationsElsewhere } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const YELLOW = '#F4E2A8';

function verseSpan(view: View, verse: number): ReactTestInstance {
  const span = view
    .queryAllByType('Text')
    .find(
      (node) =>
        typeof node.props.onPress === 'function' &&
        node.findAllByType('Text' as never)[1]?.props.children === verse
    );
  assert.ok(span, `verse ${verse}`);
  return span;
}

const backgroundOf = (view: View, verse: number) =>
  flattenStyle(verseSpan(view, verse).props.style)?.backgroundColor;

function row(overrides: Partial<UserAnnotation>): UserAnnotation {
  return {
    id: 'account-highlight',
    user_id: 'local',
    book: 'JHN',
    chapter: 3,
    verse_start: 3,
    verse_end: null,
    type: 'highlight',
    color: YELLOW,
    content: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    synced_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

test("signing out while a chapter is open stops showing the account's highlights and notes", async () => {
  annotationRows.push(
    row({}),
    row({ id: 'account-note', type: 'note', color: null, content: 'Private thought' })
  );
  const view = await renderReader();
  assert.equal(backgroundOf(view, 3), `${YELLOW}33`);

  await replaceAnnotationsElsewhere([]);
  await view.flush();

  assert.equal(backgroundOf(view, 3), undefined, 'the highlight is gone');
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  assert.equal(
    view.getByLabelText(t('annotations.noteHint')).props.value,
    '',
    "the note sheet does not show the signed-out account's note"
  );
});

test("signing in while a chapter is open shows the account's highlights", async () => {
  const view = await renderReader();
  assert.equal(backgroundOf(view, 3), undefined);

  await replaceAnnotationsElsewhere([row({})]);
  await view.flush();

  assert.equal(backgroundOf(view, 3), `${YELLOW}33`);
});

test('switching annotation owner closes an already open private note composer', async () => {
  const { switchPrivateDataOwner } = await import('../../stores/privateDataScope');
  switchPrivateDataOwner('note-owner');
  annotationRows.push(row({ type: 'note', color: null, content: 'Private thought' }));
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Private edited draft');

  switchPrivateDataOwner(null);
  await replaceAnnotationsElsewhere([]);
  await view.flush();

  assert.equal(view.queryByLabelText(t('annotations.noteHint')), null);
  assert.equal(annotationRows.length, 0);
});

test('a retained note save callback cannot write after its annotation owner changes', async () => {
  const { switchPrivateDataOwner } = await import('../../stores/privateDataScope');
  const { AnnotationActionSheet } =
    await import('../../components/annotations/AnnotationActionSheet');
  switchPrivateDataOwner('note-owner');
  annotationRows.push(row({ type: 'note', color: null, content: 'Private thought' }));
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  const saveNote = view.root.findByType(AnnotationActionSheet).props.onNote;

  switchPrivateDataOwner('another-note-owner');
  await replaceAnnotationsElsewhere([
    row({ id: 'another-owner-note', type: 'note', color: null, content: 'Keep this other note' }),
  ]);
  let result: unknown;
  await act(async () => {
    result = await saveNote('Private edited draft');
  });

  assert.equal(result, false);
  assert.equal(annotationRows.length, 1);
  assert.equal(annotationRows[0]?.content, 'Keep this other note');
  switchPrivateDataOwner(null);
});

test('a multi-write highlight edit stops when the annotation owner changes between writes', async () => {
  const { switchPrivateDataOwner } = await import('../../stores/privateDataScope');
  const { AnnotationActionSheet } =
    await import('../../components/annotations/AnnotationActionSheet');
  switchPrivateDataOwner('highlight-owner');
  annotationRows.push(row({ verse_start: 1, verse_end: 3 }));
  const view = await renderReader();
  await view.press(verseSpan(view, 2));
  const highlight = view.root.findByType(AnnotationActionSheet).props.onHighlight;

  await act(async () => {
    // The first local write completes synchronously; its awaited result yields before
    // the second write, which must not follow the account switch into guest storage.
    const writing = highlight('#6FBF7A');
    switchPrivateDataOwner(null);
    await replaceAnnotationsElsewhere([]);
    await writing;
  });

  assert.equal(annotationRows.length, 0, 'remaining writes never enter guest storage');
});

test('an edit reload from the previous chapter cannot paint highlights onto the new chapter', async () => {
  const { AnnotationActionSheet } =
    await import('../../components/annotations/AnnotationActionSheet');
  reader.chapters.set('JHN:4', [verseOf(3, 'The next chapter.', {}, 'JHN', 4)]);
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  const highlight = view.root.findByType(AnnotationActionSheet).props.onHighlight;
  reader.holdAnnotations();
  let writing!: Promise<void>;
  await act(async () => {
    writing = highlight(YELLOW);
  });
  assert.equal(reader.annotationLoads[0]?.chapter, 'JHN:3');

  await reader.navigateReader(view, { chapter: 4 });
  await act(async () => {
    reader.annotationLoads[1]?.resolve([]);
  });
  assert.equal(backgroundOf(view, 3), undefined);

  await act(async () => {
    reader.annotationLoads[0]?.resolve([row({})]);
    await writing;
  });
  assert.equal(backgroundOf(view, 3), undefined, 'chapter 3 highlights stay on chapter 3');
});

test('an old note save completing after Back cannot close a fresh same-chapter draft', async () => {
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Saved first verse note');
  reader.holdAnnotations();
  await view.press(view.getByRole('button', { name: t('common.done') }));
  assert.equal(reader.annotationLoads[0]?.chapter, 'JHN:3', 'save reached its annotation reload');
  await act(async () => {
    assert.equal(reader.harness.rn.BackHandler.press(), true);
  });
  assert.equal(view.queryByLabelText(t('annotations.noteHint')), null);
  await view.press(verseSpan(view, 2));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(
    view.getByLabelText(t('annotations.noteHint')),
    'Keep fresh draft for verse two'
  );
  await act(async () => {
    reader.annotationLoads[0]?.resolve(annotationRows);
  });
  await view.flush();
  assert.equal(annotationRows[0]?.verse_start, 3, 'the original save retains its target');
  assert.equal(annotationRows[0]?.content, 'Saved first verse note');
  assert.equal(
    view.queryByLabelText(t('annotations.noteHint'))?.props.value,
    'Keep fresh draft for verse two',
    'old completion must preserve the newly opened draft'
  );
});

for (const reopenedVerse of [2, 3]) {
  test(`an old highlight cannot clear a fresh note draft reopened on verse ${reopenedVerse}`, async () => {
    const { AnnotationActionSheet } =
      await import('../../components/annotations/AnnotationActionSheet');
    const view = await renderReader();
    await view.press(verseSpan(view, 3));
    const highlight = view.root.findByType(AnnotationActionSheet).props.onHighlight;
    reader.holdAnnotations();
    let writing!: Promise<void>;
    await act(async () => {
      writing = highlight(YELLOW);
    });
    assert.equal(reader.annotationLoads[0]?.chapter, 'JHN:3');
    await act(async () => {
      assert.equal(reader.harness.rn.BackHandler.press(), true);
    });
    await view.press(verseSpan(view, reopenedVerse));
    await view.press(view.getByRole('button', { name: t('annotations.note') }));
    await view.changeText(
      view.getByLabelText(t('annotations.noteHint')),
      'Keep fresh draft after old highlight'
    );
    await act(async () => {
      reader.annotationLoads[0]?.resolve(annotationRows);
      await writing;
    });
    assert.equal(annotationRows[0]?.verse_start, 3);
    assert.equal(annotationRows[0]?.type, 'highlight');
    assert.equal(
      view.queryByLabelText(t('annotations.noteHint'))?.props.value,
      'Keep fresh draft after old highlight'
    );
  });
}

test('an old highlight removal cannot clear a fresh same-verse note draft', async () => {
  const { AnnotationActionSheet } =
    await import('../../components/annotations/AnnotationActionSheet');
  annotationRows.push(row({}));
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  const removeHighlight = view.root.findByType(AnnotationActionSheet).props.onRemoveHighlight;
  reader.holdAnnotations();
  let writing!: Promise<void>;
  await act(async () => {
    writing = removeHighlight(YELLOW);
  });
  assert.equal(reader.annotationLoads[0]?.chapter, 'JHN:3');
  await act(async () => {
    assert.equal(reader.harness.rn.BackHandler.press(), true);
  });
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Keep draft after removal');
  await act(async () => {
    reader.annotationLoads[0]?.resolve([]);
    await writing;
  });
  assert.ok(annotationRows[0]?.deleted_at, 'the original removal persisted');
  assert.equal(
    view.getByLabelText(t('annotations.noteHint')).props.value,
    'Keep draft after removal'
  );
});

test('changing verse selection while composing keeps the note write on its original verse', async () => {
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Original verse draft');
  await view.press(verseSpan(view, 2));
  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Original verse draft');
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();
  assert.equal(annotationRows.length, 1);
  assert.equal(annotationRows[0]?.verse_start, 3);
  assert.equal(annotationRows[0]?.verse_end, null);
  assert.equal(annotationRows[0]?.content, 'Original verse draft');
});

test('a failed note save leaves the current composer draft ready to retry', async () => {
  const view = await renderReader();
  await view.press(verseSpan(view, 3));
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Retry this note');
  reader.annotationWriteOutcome.succeeds = false;
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();
  assert.equal(view.getByLabelText(t('annotations.noteHint')).props.value, 'Retry this note');
  assert.equal(view.getByRole('button', { name: t('common.done') }).props.disabled, false);
  assert.equal(annotationRows.length, 0);
  reader.annotationWriteOutcome.succeeds = true;
  await view.press(view.getByRole('button', { name: t('common.done') }));
  await view.flush();
  assert.equal(view.queryByLabelText(t('annotations.noteHint')), null);
  assert.equal(annotationRows[0]?.verse_start, 3);
  assert.equal(annotationRows[0]?.content, 'Retry this note');
});

test("the previous chapter's highlights are not drawn on the new chapter while its own load is pending", async () => {
  annotationRows.push(row({}));
  reader.chapters.set('JHN:4', [verseOf(3, 'The next chapter.', {}, 'JHN', 4)]);
  const view = await renderReader();
  assert.equal(backgroundOf(view, 3), `${YELLOW}33`);

  reader.holdAnnotations();
  await reader.navigateReader(view, { chapter: 4 });
  await view.flush();

  assert.equal(reader.annotationLoads.at(-1)?.chapter, 'JHN:4', 'chapter 4 is still loading');
  assert.equal(backgroundOf(view, 3), undefined, 'chapter 3 highlights stay on chapter 3');
  await act(async () => {
    reader.annotationLoads.at(-1)?.resolve([]);
  });
});
