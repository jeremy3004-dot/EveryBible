import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import type { View } from 'react-native';
import { mockModule, sourcePath } from '../../../testing/mockModules';
import { flattenStyle, hostAncestors, installRenderHarness, within } from '../../../testing/render';
import { serifFamily } from '../../../design/fonts';

// The picture editor the reader opens from a verse's Image action.
const harness = installRenderHarness(mock, { os: 'ios' });
// The extra faces load through expo-font's native module; here they are ready at once.
mockModule(mock, sourcePath('screens/bible/reader/verseImage/verseImageFonts.ts'), {
  useVerseImageFonts: () => true,
  VERSE_IMAGE_FONT_SOURCES: {},
});

const t = (key: string) => harness.i18n.t(key);
const VERSE = 'Later she gave birth to Cain’s brother Abel.';

async function renderSheet(text = VERSE) {
  const { VerseImageShareSheet } = await import('./VerseImageShareSheet');
  const noop = () => {};
  const view = await harness.render(
    <VerseImageShareSheet
      handleSelectVerseImageBackground={noop}
      handleShareSelectedVerseImage={async () => {}}
      isSharingVerseImage={false}
      selectedVerseImageBackground={{ uri: 'file:///background.jpg' }}
      selectedVerseImageBackgroundIndex={0}
      selectedVerseReferenceLabel="Genesis 4:2"
      selectedVerseText={text}
      handleCloseVerseImageSheet={noop}
      showVerseImageSheet
      verseImageBackgroundCount={20}
      verseImageSharePreviewRef={createRef<View>()}
    />
  );
  const tab = (key: string) => view.getByRole('tab', { name: t(`bible.verseImage.tabs.${key}`) });
  const verse = () =>
    view.getAllByText(`"${text}"`).find((node) => node.props.testID !== 'verse-image-measure')!;
  return { view, tab, verse };
}

/**
 * What the hidden copy reports from a layout: `count` lines, each as tall as the line
 * height the copy was set at when it was measured (as iOS and Android report them).
 */
const linesOf = (node: ReactTestInstance, count: number) => ({
  nativeEvent: {
    lines: Array.from({ length: count }, () => ({
      height: Number(flattenStyle(node.props.style)?.lineHeight),
    })),
  },
});

test('four tabs edit the picture: its background, font, colour and size', async () => {
  const { view } = await renderSheet();

  const names = view.getAllByRole('tab').map((node) => node.props.accessibilityLabel ?? '');
  assert.deepEqual(
    names.map((name) => String(name)),
    ['picture', 'font', 'color', 'size'].map((key) => t(`bible.verseImage.tabs.${key}`))
  );
  assert.ok(view.getAllByRole('button', { name: /1$/ }).length > 0, 'the backgrounds show first');
});

test('the picture names the passage without the translation', async () => {
  const { view } = await renderSheet();

  assert.ok(view.getAllByText('Genesis 4:2').length > 0);
  assert.equal(view.queryByText(/BSB/), null);
});

test('each font sets the verse in its own face', async () => {
  const { view, tab, verse } = await renderSheet();
  assert.equal(flattenStyle(verse().props.style)?.fontFamily, serifFamily(400, true));

  await view.press(tab('font'));
  for (const [id, family] of [
    ['script', 'DancingScript_600SemiBold'],
    ['typewriter', 'SpecialElite_400Regular'],
    ['block', 'Anton_400Regular'],
  ] as const) {
    await view.press(view.getByRole('button', { name: t(`bible.verseImage.fonts.${id}`) }));
    assert.equal(flattenStyle(verse().props.style)?.fontFamily, family, id);
  }
  const block = view.getByRole('button', { name: t('bible.verseImage.fonts.block') });
  assert.deepEqual(block.props.accessibilityState, { selected: true });
});

test('a colour recolours the words', async () => {
  const { view, tab, verse } = await renderSheet();

  await view.press(tab('color'));
  await view.press(view.getByRole('button', { name: t('bible.verseImage.colors.gold') }));
  assert.equal(flattenStyle(verse().props.style)?.color, '#E5B95F');
});

test('sixteen colours to choose from, and a deep one sets the words on a lighter wash', async () => {
  const { view, tab, verse } = await renderSheet();
  await view.press(tab('color'));

  const ids = [
    'white',
    'cream',
    'sand',
    'gold',
    'amber',
    'coral',
    'blush',
    'lavender',
    'sky',
    'mint',
    'sage',
    'rose',
    'crimson',
    'forest',
    'navy',
    'ink',
  ];
  for (const id of ids) {
    assert.ok(view.getByRole('button', { name: t(`bible.verseImage.colors.${id}`) }), id);
  }
  const washOf = () =>
    (view.queryAllByType('LinearGradient')[0]?.props.colors as string[] | undefined)?.[1] ?? '';
  assert.match(washOf(), /^rgba\(10, 9, 7/, 'white words: a dark wash');

  await view.press(view.getByRole('button', { name: t('bible.verseImage.colors.navy') }));
  assert.equal(flattenStyle(verse().props.style)?.color, '#1F2F4D');
  assert.match(washOf(), /^rgba\(248, 244, 236/, 'navy words: a light wash');
});

test('pushing the size past what fits says the words already fill the picture', async () => {
  const { view, tab, verse } = await renderSheet();
  await view.press(tab('size'));
  const slider = view.getByRole('adjustable', { name: t('bible.verseImage.size') });
  for (let step = 0; step < 10; step += 1) {
    await view.fire(slider, 'onAccessibilityAction', { nativeEvent: { actionName: 'increment' } });
  }
  assert.equal(view.queryByText(t('bible.verseImage.sizeMaxed')), null, 'not measured yet');

  await view.fire(hostAncestors(verse())[0]!, 'onLayout', {
    nativeEvent: { layout: { width: 280, height: 200 } },
  });
  const measure = () => view.getByTestId('verse-image-measure');
  await view.fire(measure(), 'onTextLayout', linesOf(measure(), 8));
  await view.fire(measure(), 'onTextLayout', linesOf(measure(), 2));

  assert.ok(view.getByText(t('bible.verseImage.sizeMaxed')));
  // A live region is Android-only; VoiceOver has to be told.
  assert.deepEqual(harness.rn.__recorded.announcements, [t('bible.verseImage.sizeMaxed')]);
});

test('a font chip grows with its name at large text rather than clipping it', async () => {
  harness.setFontScale(2);
  const { view, tab } = await renderSheet();
  await view.press(tab('font'));

  const chip = view.getByRole('button', { name: t('bible.verseImage.fonts.handwritten') });
  const style = flattenStyle(chip.props.style);
  assert.equal(style?.height, undefined, 'a fixed height would clip the scaled name');
  assert.ok(Number(style?.minHeight) >= 72);
  assert.equal(
    within(chip).getByText(t('bible.verseImage.fonts.handwritten')).props.numberOfLines,
    2
  );
});

test('a Russian verse is offered only the faces that have Cyrillic, sampled with its own word', async () => {
  const { view, tab } = await renderSheet('В начале сотворил Бог небо и землю.');
  await view.press(tab('font'));

  const offered = [
    'classic',
    'script',
    'handwritten',
    'block',
    'slab',
    'elegant',
    'typewriter',
    'modern',
  ]
    .filter((id) => view.queryByRole('button', { name: t(`bible.verseImage.fonts.${id}`) }))
    .sort();
  assert.deepEqual(offered, ['classic', 'elegant', 'handwritten']);
  assert.equal(view.getAllByText('начале').length, 3, 'each chip shows a word of the verse');
});

test('a verse in a script the faces cannot draw offers no font choice', async () => {
  const { view } = await renderSheet('आदि में परमेश्वर ने आकाश और पृथ्वी की सृष्टि की।');

  assert.equal(view.queryByRole('tab', { name: t('bible.verseImage.tabs.font') }), null);
  assert.equal(view.getAllByRole('tab').length, 3);
});
