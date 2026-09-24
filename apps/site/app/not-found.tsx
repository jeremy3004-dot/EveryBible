import type { Metadata } from 'next';

import { ErrorPageScreen } from '../components/ErrorPageScreen';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';

/**
 * App-route 404s (such as an unknown /languages/<slug>) keep the site's header
 * and footer. Next adds the noindex robots tag itself.
 */
export const metadata: Metadata = {
  title: 'Page not found | EveryBible',
  description: 'This page is not on EveryBible. Browse languages or return to the homepage.',
  // The root layout's canonical is the homepage; a missing page must not claim it.
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <ErrorPageScreen statusCode={404} />
      <SiteFooter />
    </>
  );
}
