import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import type { View } from 'react-native';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../../testing/render';
import { serifFamily } from '../../../design/fonts';
import { WCAG_AA_TEXT, contrastRatio } from '../../../design/contrast';
import {
  DEFAULT_VERSE_IMAGE_STYLE,
  VERSE_IMAGE_COLORS,
  type VerseImageStyle,
} from './verseImage/verseImageStyle';

// The verse card the reader's share sheet captures with react-native-view-shot and shares.
const harness = installRenderHarness(mock, { os: 'ios' });

const renderCard = async (
  selectedText: string,
  style: VerseImageStyle = DEFAULT_VERSE_IMAGE_STYLE,
  onFitChange?: (capped: boolean) => void
) => {
  const { VerseImageSharePreview } = await import('./VerseImageSharePreview');
  return harness.render(
    <VerseImageSharePreview
      previewRef={createRef<View>()}
      backgroundSource={{ uri: 'file:///background.jpg' }}
      referenceLabel="John 3:16"
      selectedText={selectedText}
      style={style}
      onFitChange={onFitChange}
    />
  );
};

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

test('an English verse card sets the Scripture in Lora italic above its reference, without the translation', async () => {
  const view = await renderCard(' For God so loved the world ');

  const verse = view.getByText('“For God so loved the world”');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, serifFamily(400, true));
  assert.ok(view.getByText('John 3:16'));
});

test('a Hindi verse card uses the platform serif, since Lora has no Devanagari glyphs', async () => {
  // Lora carries no Devanagari (or Arabic, Bengali, ...), so a card set in it would share a
  // fallback face. The reader and the Home card already route these scripts to the platform serif.
  const view = await renderCard('क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा');

  const verse = view.getByText('“क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा”');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, undefined);
});

test('an Arabic verse card also falls back to the platform serif', async () => {
  const view = await renderCard('لأَنَّهُ هكَذَا أَحَبَّ اللهُ الْعَالَمَ');

  const verse = view.getByText('“لأَنَّهُ هكَذَا أَحَبَّ اللهُ الْعَالَمَ”');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, undefined);
});

test('Latin text keeps Lora italic whatever language it is labelled', async () => {
  const view = await renderCard('In the beginning');

  const verse = view.getByText('“In the beginning”');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, serifFamily(400, true));
});

test('the reference keeps the app’s own chip, whatever colour the verse is set in', async () => {
  // The card's wash is translucent over a photo, so the reference keeps an opaque
  // backdrop of its own: the page surface and ink of the current theme, as it was
  // before the verse could be recoloured.
  const { createThemeColors } = await import('../../../contexts/ThemeContext');
  const failures: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    harness.authStore.getState().setPreferences({ theme });
    const palette = harness.authStore.getState().preferences.appearancePalette as never;
    const expected = createThemeColors(theme, palette);
    for (const color of VERSE_IMAGE_COLORS) {
      const view = await renderCard('For God so loved the world', {
        ...DEFAULT_VERSE_IMAGE_STYLE,
        colorId: color.id,
      });
      const reference = view.getByText('John 3:16');
      const text = flattenStyle(reference.props.style)?.color;
      const backdrop = [reference, ...hostAncestors(reference)]
        .map((node) => flattenStyle(node.props.style)?.backgroundColor)
        .find((value) => value !== undefined);
      if (text !== expected.biblePrimaryText || backdrop !== expected.bibleSurface) {
        failures.push(`${theme}/${color.id}: ${String(text)} on ${String(backdrop)}`);
      } else if (contrastRatio(text, backdrop) < WCAG_AA_TEXT) {
        failures.push(`${theme}/${color.id}: ${contrastRatio(text, backdrop).toFixed(2)}:1`);
      }
      await view.unmount();
    }
  }
  harness.authStore.getState().setPreferences({ theme: 'light' });
  assert.deepEqual(failures, []);
});

test('the reference chip is outlined, so it stays visible over a dark picture', async () => {
  const { createThemeColors } = await import('../../../contexts/ThemeContext');
  for (const theme of ['light', 'dark'] as const) {
    harness.authStore.getState().setPreferences({ theme });
    const palette = harness.authStore.getState().preferences.appearancePalette as never;
    const view = await renderCard('For God so loved the world');
    const reference = view.getByText('John 3:16');
    const chip = flattenStyle(
      [reference, ...hostAncestors(reference)].find(
        (node) => flattenStyle(node.props.style)?.backgroundColor !== undefined
      )?.props.style
    );
    assert.equal(chip?.borderColor, createThemeColors(theme, palette).bibleSecondaryText);
    assert.ok(Number(chip?.borderWidth) > 0);
    await view.unmount();
  }
  harness.authStore.getState().setPreferences({ theme: 'light' });
});

test('the chosen face sets the verse: Block is set in Anton capitals', async () => {
  const view = await renderCard('For God so loved the world', {
    ...DEFAULT_VERSE_IMAGE_STYLE,
    fontId: 'block',
  });

  const verse = flattenStyle(view.getByText('“For God so loved the world”').props.style) ?? {};
  assert.equal(verse.fontFamily, 'Anton_400Regular');
  assert.equal(verse.textTransform, 'uppercase');
});

test('a Russian verse keeps a chosen face that has Cyrillic, and falls back from one without', async () => {
  const elegant = await renderCard('В начале сотворил Бог', {
    ...DEFAULT_VERSE_IMAGE_STYLE,
    fontId: 'elegant',
  });
  assert.equal(
    flattenStyle(elegant.getByText('“В начале сотворил Бог”').props.style)?.fontFamily,
    'PlayfairDisplay_600SemiBold_Italic'
  );
  await elegant.unmount();

  const script = await renderCard('В начале сотворил Бог', {
    ...DEFAULT_VERSE_IMAGE_STYLE,
    fontId: 'script',
  });
  assert.equal(
    flattenStyle(script.getByText('“В начале сотворил Бог”').props.style)?.fontFamily,
    serifFamily(400, true),
    'Dancing Script has no Cyrillic, so Classic'
  );
});

test('a Hindi verse keeps the platform serif whichever face was picked', async () => {
  const view = await renderCard('क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा', {
    ...DEFAULT_VERSE_IMAGE_STYLE,
    fontId: 'script',
  });

  const verse = view.getByText('“क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा”');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, undefined);
});

test('the chosen colour sets the words, with a dark wash under light words and a light one under Ink', async () => {
  const white = await renderCard('In the beginning');
  const whiteWash = white.queryAllByType('LinearGradient')[0]?.props.colors as string[];
  assert.equal(flattenStyle(white.getByText('“In the beginning”').props.style)?.color, '#FFFFFF');
  await white.unmount();

  const ink = await renderCard('In the beginning', {
    ...DEFAULT_VERSE_IMAGE_STYLE,
    colorId: 'ink',
  });
  const inkWash = ink.queryAllByType('LinearGradient')[0]?.props.colors as string[];
  assert.equal(flattenStyle(ink.getByText('“In the beginning”').props.style)?.color, '#1A1914');
  assert.match(whiteWash[1] ?? '', /^rgba\(10, 9, 7/);
  assert.match(inkWash[1] ?? '', /^rgba\(248, 244, 236/);
});

// Asked for a size the verse cannot fill the picture at, the words shrink to fit
// rather than run past its edge, and the sheet is told so it can say why.
test('a size too big for the picture shrinks to fit, and says it was capped', async () => {
  const fits: boolean[] = [];
  const view = await renderCard(
    'For God so loved the world',
    { ...DEFAULT_VERSE_IMAGE_STYLE, size: 60 },
    (capped) => fits.push(capped)
  );
  // The hidden measuring copy carries the same words; the visible verse is the other one.
  const visible = () =>
    view
      .getAllByText('“For God so loved the world”')
      .find((node) => node.props.testID !== 'verse-image-measure')!;
  const box = hostAncestors(visible())[0]!;
  await view.fire(box, 'onLayout', { nativeEvent: { layout: { width: 280, height: 200 } } });

  const measure = () => view.getByTestId('verse-image-measure');
  const sizeOf = (node: ReturnType<typeof visible>) =>
    Number(flattenStyle(node.props.style)?.fontSize);
  // Too tall at 60 (five 80pt lines in a 200pt box): the hidden copy is tried smaller...
  const atSixty = linesOf(measure(), 5);
  await view.fire(measure(), 'onTextLayout', atSixty);
  const trial = sizeOf(measure());
  assert.ok(trial < 60, `tried ${trial}`);
  // ...a late report from the 60pt layout is recognised by its line height and ignored...
  await view.fire(measure(), 'onTextLayout', atSixty);
  assert.equal(sizeOf(measure()), trial, 'a stale layout does not shrink it again');
  // ...and once it fits, the visible verse takes that size.
  await view.fire(measure(), 'onTextLayout', linesOf(measure(), 2));
  assert.equal(sizeOf(visible()), trial);
  assert.equal(fits.at(-1), true, 'the sheet hears it was capped');
});

test('a size that fits is used as asked, and is not reported as capped', async () => {
  const fits: boolean[] = [];
  const view = await renderCard(
    'Jesus wept.',
    { ...DEFAULT_VERSE_IMAGE_STYLE, size: 30 },
    (capped) => fits.push(capped)
  );
  const visible = view.getByText('“Jesus wept.”');
  await view.fire(hostAncestors(visible)[0]!, 'onLayout', {
    nativeEvent: { layout: { width: 280, height: 200 } },
  });
  const measure = view.getByTestId('verse-image-measure');
  await view.fire(measure, 'onTextLayout', linesOf(measure, 1));

  const shown = view
    .getAllByText('“Jesus wept.”')
    .find((node) => node.props.testID !== 'verse-image-measure')!;
  assert.equal(Number(flattenStyle(shown.props.style)?.fontSize), 30);
  assert.equal(fits.at(-1), false);
});

test('the shared card draws at its own size, whatever the OS text size', async () => {
  harness.setFontScale(3.12);
  const view = await renderCard('For God so loved the world');

  // The card is exported as an image of a fixed frame: OS scaling would push the
  // verse past its eight lines at accessibility sizes and cut the shared picture.
  assert.equal(view.getByText('“For God so loved the world”').props.allowFontScaling, false);
  assert.equal(view.getByText('John 3:16').props.allowFontScaling, false);
});

test('a verse that quotes speech nests it as single quotes inside the card quotes', async () => {
  const view = await renderCard('And God said, “Let there be light,” and there was light.');

  assert.ok(view.getByText('“And God said, ‘Let there be light,’ and there was light.”'));
});

test('the reference pill stays on one line and shrinks to fit rather than wrapping', async () => {
  const view = await renderCard('In the beginning');

  const reference = view.getByText('John 3:16');
  assert.equal(reference.props.numberOfLines, 1);
  assert.equal(reference.props.adjustsFontSizeToFit, true);
});
