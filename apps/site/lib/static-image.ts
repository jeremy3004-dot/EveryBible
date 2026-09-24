import type { CSSProperties } from 'react';

/* Plain <img> attributes for images in server components, matching what
   next/image renders (lazy, async decoding, the built-in optimizer's
   srcset). Importing anything from 'next/image' registers its client
   component, which adds a 6 KB script to every page that shows a badge or
   the footer; these images never need JavaScript. */

/** Widths the built-in optimizer accepts: Next's default imageSizes + deviceSizes. */
export const OPTIMIZER_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const;

const QUALITY = 75;

const optimized = (src: string, width: number) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${QUALITY}`;

/** The smallest accepted width that covers `width` pixels. */
const covering = (width: number) =>
  OPTIMIZER_WIDTHS.find((candidate) => candidate >= width) ?? OPTIMIZER_WIDTHS.at(-1)!;

export interface StaticImageProps {
  width: number;
  height: number;
  loading: 'lazy';
  decoding: 'async';
  style: CSSProperties;
  src: string;
  srcSet?: string;
  sizes?: string;
}

export function staticImageProps(
  src: string,
  width: number,
  height: number,
  options: { sizes?: string; unoptimized?: boolean } = {}
): StaticImageProps {
  // Transparent text hides the alt text while the image loads, as next/image does.
  const base = {
    width,
    height,
    loading: 'lazy',
    decoding: 'async',
    style: { color: 'transparent' },
  } as const;
  if (options.unoptimized) return { ...base, src };
  if (options.sizes) {
    // Candidates for 1x to 3x screens at the rendered size.
    const rendered = parseInt(options.sizes, 10);
    const widths = [...new Set([1, 2, 3].map((density) => covering(rendered * density)))];
    return {
      ...base,
      sizes: options.sizes,
      srcSet: widths.map((candidate) => `${optimized(src, candidate)} ${candidate}w`).join(', '),
      src: optimized(src, widths.at(-1)!),
    };
  }
  const oneX = covering(width);
  const twoX = covering(width * 2);
  return {
    ...base,
    srcSet: `${optimized(src, oneX)} 1x, ${optimized(src, twoX)} 2x`,
    src: optimized(src, twoX),
  };
}
