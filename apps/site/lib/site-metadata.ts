import type { Metadata, Viewport } from 'next';

export const siteMetadata: Metadata = {
  title: 'God’s Word. In your heart language. | EveryBible',
  description:
    'Read, listen, and grow closer to God through Scripture in your own language. Explore Every Language’s vision for the whole Bible in every language, in this generation.',
};

/** Browser chrome matches the default FIELD dark surface. */
export const siteViewport: Viewport = {
  themeColor: 'hsl(48 14% 6%)',
  colorScheme: 'dark',
};
