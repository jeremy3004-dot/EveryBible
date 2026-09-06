import type { Metadata, Viewport } from 'next';

export const siteMetadata: Metadata = {
  title: 'Every language. Every person. | EveryBible',
  description:
    'Explore the world’s languages and dialects. Discover Scripture coverage and get EveryBible to read and listen for free.',
};

/** Browser chrome matches the default FIELD dark surface. */
export const siteViewport: Viewport = {
  themeColor: 'hsl(48 14% 6%)',
  colorScheme: 'dark',
};
