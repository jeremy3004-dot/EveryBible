import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { imageConfigDefault } from 'next/dist/shared/lib/image-config';
import { OPTIMIZER_WIDTHS, staticImageProps } from './static-image';

test('optimizer widths are the ones Next accepts, and the site does not change them', () => {
  const accepted = [...imageConfigDefault.imageSizes, ...imageConfigDefault.deviceSizes].sort(
    (a, b) => a - b
  );
  assert.deepEqual([...OPTIMIZER_WIDTHS], accepted);
  const config = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /\bimages\s*:/, 'a custom images config would need these widths');
});

test('a fixed-size image gets 1x and 2x candidates from the optimizer, like next/image', () => {
  assert.deepEqual(staticImageProps('/everybible/badge-google-play.png', 141, 42), {
    width: 141,
    height: 42,
    loading: 'lazy',
    decoding: 'async',
    style: { color: 'transparent' },
    srcSet:
      '/_next/image?url=%2Feverybible%2Fbadge-google-play.png&w=256&q=75 1x, ' +
      '/_next/image?url=%2Feverybible%2Fbadge-google-play.png&w=384&q=75 2x',
    src: '/_next/image?url=%2Feverybible%2Fbadge-google-play.png&w=384&q=75',
  });
});

test('an image with sizes gets width candidates covering 1x to 3x screens', () => {
  const props = staticImageProps('/everylanguage/wordmark-blue.png', 878, 242, {
    sizes: '104px',
  });
  assert.equal(props.sizes, '104px');
  assert.equal(
    props.srcSet,
    ['128', '256', '384']
      .map((w) => `/_next/image?url=%2Feverylanguage%2Fwordmark-blue.png&w=${w}&q=75 ${w}w`)
      .join(', ')
  );
  assert.equal(props.src, '/_next/image?url=%2Feverylanguage%2Fwordmark-blue.png&w=384&q=75');
});

test('unoptimized images (SVGs) are served as they are', () => {
  assert.deepEqual(
    staticImageProps('/everybible/download-qr.svg', 104, 104, { unoptimized: true }),
    {
      width: 104,
      height: 104,
      loading: 'lazy',
      decoding: 'async',
      style: { color: 'transparent' },
      src: '/everybible/download-qr.svg',
    }
  );
});
