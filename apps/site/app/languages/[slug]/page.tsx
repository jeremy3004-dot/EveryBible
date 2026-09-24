import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  LanguageLayout,
  ScriptureStatusBadge,
  StoreBadges,
} from '../../../components/languages/LanguageLayout';
import { atlasSourceLabel, atlasSourceUrl } from '../../../lib/atlas-source-links';
import { bundledAppBibles } from '../../../lib/everybible-app-bibles';
import { languageFamily } from '../../../lib/language-family';
import {
  languageIdentity,
  languagePageMetadata,
  languagePageStructuredData,
  scriptureStatusSentence,
} from '../../../lib/language-page-seo';
import { shouldPrerenderLanguage, type LanguagePage } from '../../../lib/language-pages';
import {
  getLanguageIndex,
  getLanguagePage,
  getLanguagePagesMeta,
} from '../../../lib/language-pages-data';
import { languagePagePath } from '../../../lib/language-slug';
import { countryFlag } from '../../../lib/public-atlas-profile';
import { projectPercentage } from '../../../lib/public-atlas-projects';
import { EVERYBIBLE_SMART_DOWNLOAD_PATH } from '../../../lib/site-links';
import { serializeJsonLd } from '../../../lib/site-metadata';
import '../languages.css';

/**
 * ~2,600 languages with a Bible, New Testament or recording project are built
 * ahead of time. Every other language renders on its first request and is then
 * served from the cache like a static page, so the build stays short.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getLanguageIndex()).filter(shouldPrerenderLanguage).map(({ slug }) => ({ slug }));
}

interface LanguageRouteProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: LanguageRouteProps): Promise<Metadata> {
  const page = await getLanguagePage((await params).slug);
  // Without this the browser re-applies the homepage title and canonical over the 404.
  if (!page) notFound();
  return languagePageMetadata(page);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

function ProjectSummary({ page }: { page: LanguagePage }) {
  return (
    <>
      <h3>Every Language recording project</h3>
      <ul className="language-projects">
        {page.projects.map((project) => (
          <li key={project.name}>
            <strong>{project.name}</strong>
            {project.languageName !== project.name && <span> ({project.languageName})</span>}
            {': '}
            {projectPercentage(project)}
            {project.recordedPercentage !== null && '%'} of Bible chapters recorded (
            {formatNumber(project.chaptersRecorded)} chapters).
          </li>
        ))}
      </ul>
      <p className="language-note">
        Project report, figures not audited. Recorded chapters may still need review and approval
        before publication, and recording does not mean the audio is in the EveryBible app yet.
      </p>
    </>
  );
}

export default async function LanguageDetailPage({ params }: LanguageRouteProps) {
  const { slug } = await params;
  const [page, meta] = await Promise.all([getLanguagePage(slug), getLanguagePagesMeta()]);
  if (!page) notFound();

  const appBibles = bundledAppBibles(page.iso6393);
  const sources = meta.sources.filter((source) => page.sourceIds.includes(source.id));
  const details = [
    ['Language family', languageFamily(page.family)],
    ['ISO 639-3 code', page.iso6393],
    ['Glottocode', page.glottocode],
    ['ROLV code', page.rolvCode],
    ['Reported population', page.population === null ? null : formatNumber(page.population)],
    ['Also known as', page.aliases.length ? page.aliases.join(' · ') : null],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <LanguageLayout
      current={page.label}
      eyebrow="Language"
      title={page.name}
      intro={languageIdentity(page)}
      status={page.status}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(languagePageStructuredData(page, meta.generatedAt)),
        }}
      />

      <section aria-labelledby="scripture-heading">
        <h2 id="scripture-heading">Scripture in {page.name}</h2>
        <p>{scriptureStatusSentence(page.status, page.name)}</p>
        <p className="language-note">
          From the Every Language research atlas and its sources. “No known Scripture” means none is
          recorded in those sources, not that none exists.
        </p>
        {page.projects.length > 0 && <ProjectSummary page={page} />}
      </section>

      <section aria-labelledby="app-heading">
        <h2 id="app-heading">Read the Bible with EveryBible</h2>
        {appBibles.length > 0 ? (
          <p>
            The free EveryBible app includes the {appBibles.join(' and ')} in {page.name}, ready to
            read offline.
          </p>
        ) : (
          <p>
            EveryBible is a free Bible app for iPhone and Android. Its library grows as translations
            and recordings are published, so open the app to see what is available in {page.name}.
          </p>
        )}
        <StoreBadges />
        <p>
          <a href={EVERYBIBLE_SMART_DOWNLOAD_PATH}>Get the app for this phone</a>
        </p>
      </section>

      <section aria-labelledby="where-heading">
        <h2 id="where-heading">Where {page.name} is spoken</h2>
        {page.countries.length ? (
          <ul className="language-countries">
            {page.countries.map((country) => (
              <li key={country.code}>
                {countryFlag(country.code) && (
                  <span aria-hidden="true">{countryFlag(country.code)} </span>
                )}
                {country.name}
              </li>
            ))}
          </ul>
        ) : (
          <p>No country is recorded in our sources.</p>
        )}
        <p>
          <a href={`/?language=${encodeURIComponent(page.id)}`}>
            See {page.name} on the language map
          </a>
        </p>
      </section>

      {details.length > 0 && (
        <section aria-labelledby="details-heading">
          <h2 id="details-heading">About {page.name}</h2>
          <dl className="language-details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {page.dialects.length > 0 && (
        <section aria-labelledby="dialects-heading">
          <h2 id="dialects-heading">
            Dialects and varieties <span className="language-count">{page.dialects.length}</span>
          </h2>
          <p className="language-note">
            Each variety shows Scripture recorded for that exact variety; it may differ from{' '}
            {page.name} as a whole.
          </p>
          <ul className="language-list language-list--grid">
            {page.dialects.map((dialect) => (
              <li key={`${dialect.name}-${dialect.status}`}>
                <span>{dialect.name}</span>
                <ScriptureStatusBadge status={dialect.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.related && (
        <section aria-labelledby="related-heading">
          <h2 id="related-heading">Other languages of {page.related.country.name}</h2>
          <ul className="language-list">
            {page.related.languages.map((language) => (
              <li key={language.slug}>
                <a href={languagePagePath(language.slug)}>{language.label}</a>
                <ScriptureStatusBadge status={language.status} />
              </li>
            ))}
          </ul>
          <p>
            <a href="/languages">Browse all languages</a>
          </p>
        </section>
      )}

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources</h2>
        <ul className="language-sources">
          {sources.map((source) => {
            const url = atlasSourceUrl(source, { ...page, kind: 'language' });
            const label = atlasSourceLabel(source);
            return (
              <li key={source.id}>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    {label}
                  </a>
                ) : (
                  label
                )}
                <small>
                  {source.attribution} · {source.license}
                </small>
              </li>
            );
          })}
        </ul>
        <p className="language-note">
          Atlas data as of {meta.generatedAt}. Joshua Project data is used with permission for
          noncommercial ministry research and education. Glottolog data: CC BY 4.0.
        </p>
      </section>
    </LanguageLayout>
  );
}
