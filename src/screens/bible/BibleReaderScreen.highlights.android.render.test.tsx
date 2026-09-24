import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { flattenStyle } from '../../testing/render';
import { installReaderRenderFixture } from './BibleReaderScreen.renderFixture';

// Highlights drawn over the read-mode text on Android, where a verse is a span nested in
// its paragraph's Text. Android redraws a span's colour when it changes, but a span that
// loses its background keeps the old one on screen until it is mounted again: removing a
// highlight left it visible until the chapter was swiped away and back.
const reader = installReaderRenderFixture(mock, { os: 'android' });
const { t, renderReader, serviceCalls, annotationRows } = reader;

type View = Awaited<ReturnType<typeof renderReader>>;

const YELLOW = '#F4E2A8';
const GREEN = '#6FBF7A';

/** The inline span for a verse: the pressable Text whose first child is the verse number. */
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

/** Select the verse and press a colour in the action sheet (an active colour removes it). */
async function pressColour(view: View, verse: number, colour: 'yellow' | 'green') {
  await view.press(verseSpan(view, verse));
  await view.press(view.getByRole('button', { name: t(`annotations.colors.${colour}`) }));
  await view.flush();
}

const liveHighlights = () =>
  annotationRows
    .filter((row) => row.type === 'highlight' && row.deleted_at == null)
    .map((row) => [row.verse_start, row.color]);

test('removing a highlight clears it from the verse at once, on a freshly mounted span', async () => {
  const view = await renderReader();
  await pressColour(view, 3, 'yellow');
  assert.equal(backgroundOf(view, 3), `${YELLOW}33`);
  const highlightedSpan = verseSpan(view, 3);

  await pressColour(view, 3, 'yellow');

  assert.deepEqual(liveHighlights(), [], 'the highlight is deleted');
  assert.equal(
    serviceCalls.filter(([call]) => call === 'softDeleteAnnotation').length,
    1,
    'one delete'
  );
  assert.equal(view.queryByText(/John 3:3 BSB/), null, 'the action sheet closed');
  assert.equal(backgroundOf(view, 3), undefined, 'the verse is drawn without a highlight');
  // The test renderer keeps one instance per mounted element, so a new one is a remount.
  assert.notEqual(
    verseSpan(view, 3),
    highlightedSpan,
    'the span is mounted again, so Android does not keep the removed background'
  );
  assert.equal(backgroundOf(view, 2), undefined, 'the neighbouring verse stays plain');
});

test('changing a highlight colour draws the new colour', async () => {
  const view = await renderReader();
  await pressColour(view, 3, 'yellow');

  await pressColour(view, 3, 'green');

  assert.deepEqual(liveHighlights(), [[3, GREEN]]);
  assert.equal(backgroundOf(view, 3), `${GREEN}33`);
});
