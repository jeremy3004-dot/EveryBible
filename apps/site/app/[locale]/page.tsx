import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HomePage } from '../../components/HomePage';
import { isPublishedHomeLocale, PUBLISHED_HOME_LOCALE_CODES } from '../../lib/home-locale-meta';
import { homeCopyFor } from '../../lib/home-locales';
import { homeMetadata } from '../../lib/site-metadata';

/* The 20 localized homepages. Only these codes exist: any other top-level
   path is a 404, and static routes (/bible, /plans, ...) win over this one. */
export const dynamicParams = false;
export const revalidate = 86400;

export function generateStaticParams() {
  return PUBLISHED_HOME_LOCALE_CODES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublishedHomeLocale(locale)) return {};
  return homeMetadata(locale, homeCopyFor(locale).meta);
}

export default async function LocalizedHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublishedHomeLocale(locale)) notFound();
  return <HomePage copy={homeCopyFor(locale)} localeCode={locale} />;
}
