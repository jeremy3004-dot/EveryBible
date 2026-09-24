import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { flattenStyle, installRenderHarness, textContent } from '../../testing/render';

const harness = installRenderHarness(mock);

const verseTextStyle = { fontSize: 18, lineHeight: 30 };
const verseNumberStyle = { fontSize: 11 };

async function renderVerse(overrides: { isSelected?: boolean; onPress?: () => void } = {}) {
  const { HighlightedVerseText } = await import('./HighlightedVerseText');
  return harness.render(
    <HighlightedVerseText
      verseNumber={16}
      verseText="For God so loved the world that he gave his one and only Son."
      verseTextStyle={verseTextStyle}
      verseNumberStyle={verseNumberStyle}
      highlightColor="#F4E2A8"
      isSelected={overrides.isSelected}
      onPress={overrides.onPress ?? (() => {})}
    />
  );
}

type View = Awaited<ReturnType<typeof renderVerse>>;

const layoutLines = (view: View, lines: string[]) =>
  view.fire(view.queryAllByType('Text')[0], 'onTextLayout', {
    nativeEvent: { lines: lines.map((text) => ({ text })) },
  });

test('the verse is announced as one element with its number, whatever lines it is drawn in', async () => {
  let presses = 0;
  const view = await renderVerse({
    isSelected: true,
    onPress: () => {
      presses += 1;
    },
  });

  const verse = view.getByLabelText(
    '16\u00A0For God so loved the world that he gave his one and only Son.'
  );
  assert.deepEqual(verse.props.accessibilityState, { selected: true });
  await view.press(verse);
  assert.equal(presses, 1);
});

test('before the text is measured the verse is highlighted as one block', async () => {
  const view = await renderVerse();

  const rows = view.queryAllByType('Text').filter((node) => node.props.accessible !== false);
  assert.ok(
    rows.some(
      (node) =>
        textContent(node) ===
        '16\u00A0For God so loved the world that he gave his one and only Son.'
    )
  );
});

test('once measured, each wrapped line gets its own highlight, the number only on the first', async () => {
  const view = await renderVerse();

  await layoutLines(view, [
    '16\u00A0For God so loved the world   ',
    'that he gave his one and only',
    '   ',
    'Son.',
  ]);

  const lineTexts = view
    .queryAllByType('Text')
    .filter((node) => flattenStyle(node.props.style)?.flexShrink === 1)
    .map((node) => textContent(node));
  assert.deepEqual(lineTexts, [
    '16\u00A0For God so loved the world',
    'that he gave his one and only',
    'Son.',
  ]);
  // One translucent highlight per drawn line.
  const highlights = view
    .queryAllByType('View')
    .filter((node) => node.props.pointerEvents === 'none');
  assert.equal(highlights.length, 3);
  assert.equal(flattenStyle(highlights[0].props.style)?.backgroundColor, '#F4E2A84d');
});

test('the same measurement twice does not redraw the lines', async () => {
  const view = await renderVerse();
  await layoutLines(view, ['16\u00A0For God so loved', 'the world.']);
  const before = view.queryAllByType('View').filter((node) => node.props.pointerEvents === 'none');

  await layoutLines(view, ['16\u00A0For God so loved', 'the world.']);
  const after = view.queryAllByType('View').filter((node) => node.props.pointerEvents === 'none');

  assert.equal(after.length, 2);
  assert.equal(after[0], before[0]);
});
