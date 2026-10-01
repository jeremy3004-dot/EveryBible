import type { Metadata } from 'next';

import { HomePage } from '../components/HomePage';
import { homeCopyEn } from '../lib/home-copy';
import { homeAlternateLanguages } from '../lib/home-locale-meta';

/* Re-rendered daily so the reading plans shelf follows the church year
   (Advent, Christmas) without a deploy. */
export const revalidate = 86400;

/* Title, description and share card come from the root layout; this adds the
   hreflang links to the 20 localized homepages. */
export const metadata: Metadata = {
  alternates: { canonical: '/', languages: homeAlternateLanguages() },
};

export default function Home() {
  return <HomePage copy={homeCopyEn} localeCode="en" />;
}
