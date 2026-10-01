import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installReaderRenderFixture, JOHN_3 } from './BibleReaderScreen.renderFixture';
import { assertDefined } from '../../utils/assertDefined';

const reader = installReaderRenderFixture(mock);
const { t, renderReader, annotationRows } = reader;

test('changing the verse selection while writing a note cannot overwrite another verse note', async () => {
  annotationRows.push({
    id: 'saved-on-verse-3',
    user_id: 'local',
    book: 'JHN',
    chapter: 3,
    verse_start: 3,
    verse_end: null,
    type: 'note',
    color: null,
    content: 'Keep this thought on verse 3',
    created_at: '2026-09-26T00:00:00.000Z',
    updated_at: '2026-09-26T00:00:00.000Z',
    synced_at: '2026-09-26T00:00:00.000Z',
    deleted_at: null,
  });
  const view = await renderReader();
  await view.press(
    view.getByText(new RegExp(assertDefined(JOHN_3[0], 'JOHN_3[0]').text.slice(0, 20)))
  );
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'My thought on verse 1');

  // The inline sheet leaves the Bible tappable above it.
  await view.press(
    view.getByText(new RegExp(assertDefined(JOHN_3[2], 'JOHN_3[2]').text.slice(0, 20)))
  );
  await view.press(view.getByText(t('common.done')));
  await view.flush();

  assert.equal(
    annotationRows.find((row) => row.id === 'saved-on-verse-3')?.content,
    'Keep this thought on verse 3'
  );
  assert.equal(
    annotationRows.find((row) => row.type === 'note' && row.verse_start === 1)?.content,
    'My thought on verse 1'
  );
});

test('a failed note save keeps the draft open so the listener can retry', async () => {
  const view = await renderReader();
  await view.press(
    view.getByText(new RegExp(assertDefined(JOHN_3[0], 'JOHN_3[0]').text.slice(0, 20)))
  );
  await view.press(view.getByRole('button', { name: t('annotations.note') }));
  await view.changeText(view.getByLabelText(t('annotations.noteHint')), 'Keep my unsaved thought');
  reader.annotationWriteOutcome.succeeds = false;

  await view.press(view.getByText(t('common.done')));
  await view.flush();

  assert.equal(annotationRows.length, 0);
  assert.equal(
    view.getByLabelText(t('annotations.noteHint')).props.value,
    'Keep my unsaved thought'
  );
  reader.annotationWriteOutcome.succeeds = true;
  await view.press(view.getByText(t('common.done')));
  await view.flush();

  assert.equal(annotationRows[0]?.content, 'Keep my unsaved thought');
  assert.equal(view.queryByLabelText(t('annotations.noteHint')), null);
});
