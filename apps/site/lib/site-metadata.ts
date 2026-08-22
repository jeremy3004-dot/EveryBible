import type { Metadata, Viewport } from 'next';

export const siteMetadata: Metadata = {
  title: 'Get the Bible free on your phone, tablet, or computer. | EveryBible',
  description:
    'EveryBible helps people read, listen to, and share Scripture for free in their own language.',
};

/**
 * Browser chrome follows the Every Language paper canvas: vellum in light,
 * warm near-black in dark. Next requires themeColor on the viewport export.
 */
export const siteViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'hsl(40 26% 92%)' },
    { media: '(prefers-color-scheme: dark)', color: 'hsl(48 14% 6%)' },
  ],
};
