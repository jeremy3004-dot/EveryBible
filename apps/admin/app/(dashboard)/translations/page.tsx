import Link from 'next/link';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { listSyncRuns, listTranslations } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime, getError, getNotice } from '@/lib/format';

import { runTranslationSyncAction } from '../actions';

interface TranslationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TranslationsPage({ searchParams }: TranslationsPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const resolvedSearchParams = await searchParams;
  const query = typeof resolvedSearchParams.query === 'string' ? resolvedSearchParams.query : '';
  const notice = getNotice(resolvedSearchParams);
  const error = getError(resolvedSearchParams);

  const [translations, syncRuns] = await Promise.all([
    listTranslations(query),
    listSyncRuns(),
  ]);

  return (
    <div className="page-stack">
      <section className="page-header page-header--inline">
        <div>
          <p className="eyebrow">Phase 4</p>
          <h2>Upstream translation sync and EveryBible distribution operations</h2>
          <p className="page-copy">
            Review the imported translation catalog, inspect freshness, and safely trigger manual
            resyncs without letting admin users mutate upstream source-of-truth records.
          </p>
        </div>

        <form action={runTranslationSyncAction}>
          <button type="submit" className="button button--primary">
            Run upstream sync
          </button>
        </form>
      </section>

      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--danger">{error}</p> : null}

      <section className="card">
        <form className="filter-form">
          <input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search by id, name, abbreviation, or language"
          />
          <button type="submit" className="button">
            Filter
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Translation</th>
                <th>Language</th>
                <th>Delivery</th>
                <th>Current version</th>
                <th>Freshness</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {translations.map((translation) => (
                <tr key={translation.translationId}>
                  <td>
                    <strong>{translation.name}</strong>
                    <p className="table-note">
                      {translation.translationId} / {translation.abbreviation}
                    </p>
                  </td>
                  <td>{translation.languageName}</td>
                  <td>
                    <div className="stack-inline">
                      <StatusPill
                        tone={
                          translation.distributionState === 'published'
                            ? 'success'
                            : translation.distributionState === 'ready'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        {translation.distributionState}
                      </StatusPill>
                      <span className="table-note">
                        {translation.hasText ? 'Text' : 'No text'} /{' '}
                        {translation.hasAudio ? 'Audio' : 'No audio'}
                      </span>
                    </div>
                  </td>
                  <td>{translation.currentVersion ?? 'Not versioned yet'}</td>
                  <td>{formatDateTime(translation.upstreamLastSyncedAt)}</td>
                  <td>
                    <Link href={`/translations/${translation.translationId}`} className="button">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Sync history</p>
            <h3>Recent upstream runs</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Inserted</th>
                <th>Updated</th>
                <th>Finished</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.map((run) => (
                <tr key={run.id}>
                  <td>{formatDateTime(run.started_at)}</td>
                  <td>
                    <StatusPill
                      tone={
                        run.state === 'succeeded'
                          ? 'success'
                          : run.state === 'failed'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {run.state}
                    </StatusPill>
                  </td>
                  <td>{run.inserted_count}</td>
                  <td>{run.updated_count}</td>
                  <td>{formatDateTime(run.finished_at)}</td>
                  <td>{run.message ?? 'No message'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
