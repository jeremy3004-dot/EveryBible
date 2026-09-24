import type { Metadata } from 'next';

import {
  LanguageLayout,
  ScriptureStatusBadge,
  StoreBadges,
} from '../../components/languages/LanguageLayout';
import {
  LANGUAGES_HUB_DESCRIPTION,
  LANGUAGES_HUB_TITLE,
  SCRIPTURE_STATUS_ORDER,
} from '../../lib/language-page-seo';
import { getLanguageIndex, getLanguagePagesMeta } from '../../lib/language-pages-data';
import { LANGUAGES_PATH, languagePagePath } from '../../lib/language-slug';
import { pageMetadata } from '../../lib/site-metadata';
import './languages.css';

export const metadata: Metadata = pageMetadata({
  title: LANGUAGES_HUB_TITLE,
  description: LANGUAGES_HUB_DESCRIPTION,
  path: LANGUAGES_PATH,
});

const formatCount = (value: number) => new Intl.NumberFormat('en').format(value);

export default async function LanguagesPage() {
  const [meta, index] = await Promise.all([getLanguagePagesMeta(), getLanguageIndex()]);
  const projects = index.filter((entry) => entry.project);
  const bibles = index.filter((entry) => entry.status === 'bible');

  return (
    <LanguageLayout
      eyebrow="Languages"
      title="Scripture in every language"
      intro={`Bible translation status for ${formatCount(meta.languageCount)} languages, from the Every Language research atlas. Search the map to find any language or dialect.`}
    >
      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Where Bible translation stands</h2>
        <ul className="language-list">
          {SCRIPTURE_STATUS_ORDER.map((status) => (
            <li key={status}>
              <ScriptureStatusBadge status={status} />
              <span>{formatCount(meta.statusCounts[status] ?? 0)} languages</span>
            </li>
          ))}
        </ul>
        <p className="language-note">
          Counts are research registry records, not a definitive count of living languages or of the
          Bibles in the EveryBible app. “No known Scripture” means none is recorded in our sources.
        </p>
        <p>
          <a href="/">Search every language and dialect on the map</a>
        </p>
      </section>

      {projects.length > 0 && (
        <section aria-labelledby="projects-heading">
          <h2 id="projects-heading">Every Language recording projects</h2>
          <ul className="language-list">
            {projects.map((entry) => (
              <li key={entry.slug}>
                <a href={languagePagePath(entry.slug)}>{entry.label}</a>
                <ScriptureStatusBadge status={entry.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="bibles-heading">
        <h2 id="bibles-heading">
          Languages with a complete Bible{' '}
          <span className="language-count">{formatCount(bibles.length)}</span>
        </h2>
        <ul className="language-columns">
          {bibles.map((entry) => (
            <li key={entry.slug}>
              <a href={languagePagePath(entry.slug)}>{entry.label}</a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="app-heading">
        <h2 id="app-heading">Read the Bible free with EveryBible</h2>
        <p>
          EveryBible is a free Bible app for iPhone and Android, with Scripture to read and hear in
          a growing number of languages.
        </p>
        <StoreBadges />
      </section>
    </LanguageLayout>
  );
}
