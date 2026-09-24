import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle } from '../../testing/render';
import type { UserAnnotation } from '../../services/supabase/types';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

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
