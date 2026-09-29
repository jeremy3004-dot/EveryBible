import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canVerseImageFontDraw,
  getDrawableVerseImageFonts,
  getNextVerseImageFitSize,
  getVerseImageFontSample,
  VERSE_IMAGE_COLORS,
  VERSE_IMAGE_FONTS,
  VERSE_IMAGE_MIN_FIT_SIZE,
} from './verseImageStyle';

test('eight faces, each its own family, not one face in different weights', () => {
  assert.equal(VERSE_IMAGE_FONTS.length, 8);
  assert.equal(new Set(VERSE_IMAGE_FONTS.map((font) => font.fontFamily)).size, 8);
  assert.deepEqual(
    VERSE_IMAGE_FONTS.map((font) => font.id),
    ['classic', 'script', 'handwritten', 'block', 'slab', 'elegant', 'typewriter', 'modern']
  );
});

test('sixteen text colours, light ones first, each its own', () => {
  assert.deepEqual(
    VERSE_IMAGE_COLORS.map((color) => color.id),
    [
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
    ]
  );
  assert.equal(new Set(VERSE_IMAGE_COLORS.map((color) => color.hex)).size, 16);
});

test('light words get a dark wash and dark words a light one', () => {
  const light = (id: string) => VERSE_IMAGE_COLORS.find((color) => color.id === id)!.light;
  assert.equal(light('white'), true);
  assert.equal(light('sky'), true);
  assert.equal(light('navy'), false);
  assert.equal(light('crimson'), false);
});

test('a verse that fits is left at its size', () => {
  assert.equal(
    getNextVerseImageFitSize({ size: 24, measuredHeight: 180, availableHeight: 200 }),
    null
  );
});

test('a verse that overflows shrinks, and settles inside the picture in a few steps', () => {
  // Wrapped text grows with the square of its size: model 0.5 * size^2 points tall.
  const heightAt = (size: number) => 0.5 * size * size;
  const available = 200;
  let size = 64;
  let steps = 0;
  for (;;) {
    const next = getNextVerseImageFitSize({
      size,
      measuredHeight: heightAt(size),
      availableHeight: available,
    });
    if (next == null) break;
    assert.ok(next < size, 'each step is smaller');
    size = next;
    steps += 1;
  }
  assert.ok(heightAt(size) <= available, `fits at ${size}`);
  assert.ok(steps <= 3, `${steps} steps`);
  assert.ok(size > 18, 'and does not shrink far past what fits');
});

test('a verse too long to fit at any size stops at the smallest size rather than looping', () => {
  assert.equal(
    getNextVerseImageFitSize({ size: 10, measuredHeight: 10_000, availableHeight: 200 }),
    VERSE_IMAGE_MIN_FIT_SIZE
  );
  assert.equal(
    getNextVerseImageFitSize({
      size: VERSE_IMAGE_MIN_FIT_SIZE,
      measuredHeight: 10_000,
      availableHeight: 200,
    }),
    null
  );
});

const drawable = (text: string) => getDrawableVerseImageFonts(text).map((font) => font.id);

// The picture is set in the verse's language, not the app's: which faces are offered
// follows from the characters each face can draw.
test('an English verse can use all eight faces', () => {
  assert.equal(drawable('"Later she gave birth to Cain’s brother Abel."').length, 8);
});

test('a Russian verse is offered only the faces with Cyrillic', () => {
  assert.deepEqual(drawable('"В начале сотворил Бог небо и землю."'), [
    'classic',
    'handwritten',
    'elegant',
  ]);
});

test('accented Latin narrows the list to faces with those letters', () => {
  const turkish = drawable('"Başlangıçta Tanrı göğü ve yeri yarattı."');
  assert.equal(turkish.includes('modern'), false, 'Alte Haas has no ğ or ı');
  assert.equal(turkish.includes('classic'), true);
  const vietnamese = drawable('"Ban đầu Đức Chúa Trời dựng nên trời đất."');
  assert.equal(vietnamese.includes('typewriter'), false);
  assert.equal(vietnamese.includes('classic'), true);
});

test('Hindi, Arabic and Chinese verses have no face to offer', () => {
  for (const verse of [
    '"आदि में परमेश्वर ने आकाश और पृथ्वी की सृष्टि की।"',
    '"فِي الْبَدْءِ خَلَقَ اللهُ السَّمَاوَاتِ وَالأَرْضَ."',
    '"起初，神创造天地。"',
  ]) {
    assert.deepEqual(drawable(verse), [], verse);
  }
});

test('spaces and invisible joiners need no glyph', () => {
  assert.equal(canVerseImageFontDraw('modern', 'In the\u00A0beginning\u200D'), true);
});

test('the font chips show a word from the verse, in its own script', () => {
  assert.equal(getVerseImageFontSample('"Later she gave birth"'), 'Later');
  assert.equal(getVerseImageFontSample('"В начале сотворил"'), 'начале');
  assert.equal(getVerseImageFontSample('"Jesus wept."'), 'Jesus');
  assert.equal(getVerseImageFontSample('"起初，神创造天地。"'), '起初神创造天地');
  assert.equal(getVerseImageFontSample('"— !"'), 'Aa');
});
