import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { getTranslationDetail } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime, getError, getNotice } from '@/lib/format';

import { updateTranslationMetadataAction } from '../../actions';

interface TranslationDetailPageProps {
  params: Promise<{ translationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TranslationDetailPage({
  params,
  searchParams,
}: TranslationDetailPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const { translationId } = await params;
  const detail = await getTranslationDetail(translationId);
  const resolvedSearchParams = await searchParams;
  const notice = getNotice(resolvedSearchParams);
  const error = getError(resolvedSearchParams);

  if (!detail) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Translation detail</p>
          <h2>
            {detail.name} ({detail.abbreviation})
          </h2>
          <p className="page-copy">
            Separate upstream state from EveryBible-local delivery controls. This page is where
            super-admins adjust internal readiness and availability without pretending to author
            the translation itself.
          </p>
        </div>
        <Link href="/translations" className="button">
          Back to translations
        </Link>
      </section>

      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--danger">{error}</p> : null}

      <section className="two-column">
        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">EveryBible-local controls</p>
              <h3>Distribution metadata</h3>
            </div>
          </div>

          <form action={updateTranslationMetadataAction} className="stack-form">
            <input type="hidden" name="translationId" value={detail.translationId} />

            <label>
              Distribution state
              <select name="distributionState" defaultValue={detail.distributionState}>
                <option value="draft">draft</option>
                <option value="ready">ready</option>
                <option value="published">published</option>
                <option value="hidden">hidden</option>
              </select>
            </label>

            <label className="checkbox-row">
              <input type="checkbox" name="isAvailable" defaultChecked={detail.isAvailable} />
              <span>Visible in public/mobile catalog</span>
            </label>

            <label>
              Admin notes
              <textarea
                name="adminNotes"
                defaultValue={detail.adminNotes ?? ''}
                rows={6}
                placeholder="Operational notes, rollout caveats, or support context"
              />
            </label>

            <button type="submit" className="button button--primary">
              Save metadata
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Upstream state</p>
              <h3>Imported contract snapshot</h3>
            </div>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Language</dt>
              <dd>{detail.languageName}</dd>
            </div>
            <div>
              <dt>Current version</dt>
              <dd>{detail.currentVersion ?? 'Not versioned yet'}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{formatDateTime(detail.upstreamLastSyncedAt)}</dd>
            </div>
            <div>
              <dt>Text / Audio</dt>
              <dd>
                {detail.hasText ? 'Text' : 'No text'} / {detail.hasAudio ? 'Audio' : 'No audio'}
              </dd>
            </div>
          </dl>

          <pre className="json-block">
            {JSON.stringify(detail.upstreamPayload ?? { message: 'No upstream payload stored yet.' }, null, 2)}
          </pre>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Version history</p>
            <h3>Known translation versions</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Published</th>
                <th>Books</th>
                <th>Chapters</th>
                <th>Verses</th>
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((version) => (
                <tr key={version.id}>
                  <td>{version.version_number}</td>
                  <td>
                    <StatusPill tone={version.is_current ? 'success' : 'default'}>
                      {version.is_current ? 'current' : 'historic'}
                    </StatusPill>
                  </td>
                  <td>{formatDateTime(version.published_at)}</td>
                  <td>{version.total_books ?? '—'}</td>
                  <td>{version.total_chapters ?? '—'}</td>
                  <td>{version.total_verses ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Recent sync runs</p>
            <h3>Operational history</h3>
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
                <th>Failed</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {detail.recentRuns.map((run) => (
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
                  <td>{run.failed_count}</td>
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
