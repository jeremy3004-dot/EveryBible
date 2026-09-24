import Link from 'next/link';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import {
  APP_ERROR_WINDOW_OPTIONS,
  getAppErrorSummary,
  normalizeAppErrorWindow,
  type AppErrorCount,
} from '@/lib/app-errors';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';

interface AppErrorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatCounts(counts: AppErrorCount[], limit = 4): string {
  if (counts.length === 0) return 'None';
  const shown = counts.slice(0, limit).map(({ label, count }) => `${label} ×${count}`);
  const hidden = counts.length - shown.length;
  return hidden > 0 ? `${shown.join(', ')} +${hidden} more` : shown.join(', ');
}

export default async function AppErrorsPage({ searchParams }: AppErrorsPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const windowDays = normalizeAppErrorWindow((await searchParams).window);
  const summary = await getAppErrorSummary(windowDays);

  return (
    <div className="page-stack">
      <section className="page-header page-header--inline">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>App errors</h2>
          <p className="page-copy">
            Crashes and caught screen errors reported anonymously by the mobile app, grouped by
            error type, message and screen. Reports carry no user or account data and are deleted
            after 90 days.
          </p>
        </div>
        <div className="stack-inline" role="group" aria-label="Time range">
          {APP_ERROR_WINDOW_OPTIONS.map((days) => (
            <Link
              key={days}
              href={`/app-errors?window=${days}`}
              className={days === windowDays ? 'button button--primary' : 'button'}
              aria-current={days === windowDays ? 'true' : undefined}
              prefetch={false}
            >
              Last {days} days
            </Link>
          ))}
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Reports</span>
          <strong>{summary.totals.reports}</strong>
        </article>
        <article className="metric-card">
          <span>Fatal crashes</span>
          <strong>{summary.totals.fatal}</strong>
        </article>
        <article className="metric-card">
          <span>Affected installs</span>
          <strong>{summary.totals.installs}</strong>
        </article>
        <article className="metric-card">
          <span>Distinct errors</span>
          <strong>{summary.totals.fingerprints}</strong>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Breakdown</p>
            <h3>By app version and platform</h3>
          </div>
        </div>
        <p className="table-note">Versions: {formatCounts(summary.byVersion, 8)}</p>
        <p className="table-note">Platforms: {formatCounts(summary.byPlatform)}</p>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Top errors</p>
            <h3>Most reported in the last {windowDays} days</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Error</th>
                <th>Screen</th>
                <th>Reports</th>
                <th>Installs</th>
                <th>Versions</th>
                <th>Platforms</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {summary.fingerprints.length === 0 ? (
                <tr>
                  <td className="data-table__empty" colSpan={7}>
                    No app errors reported in this window.
                  </td>
                </tr>
              ) : (
                summary.fingerprints.map((row) => (
                  <tr key={row.fingerprint}>
                    <td>
                      <strong>{row.errorName}</strong>{' '}
                      {row.fatalCount > 0 ? (
                        <StatusPill tone="danger">{`${row.fatalCount} fatal`}</StatusPill>
                      ) : (
                        <StatusPill tone="warning">{row.kind}</StatusPill>
                      )}
                      <p className="table-note">{row.message || 'No message'}</p>
                      {row.stackFrames.length > 0 ? (
                        <p className="table-note">
                          <code>{row.stackFrames.slice(0, 3).join(' → ')}</code>
                        </p>
                      ) : null}
                      {row.componentStack ? (
                        <p className="table-note">Components: {row.componentStack}</p>
                      ) : null}
                      <p className="table-note">Fingerprint {row.fingerprint}</p>
                    </td>
                    <td>{row.screen ?? 'Unknown'}</td>
                    <td>{row.reportCount}</td>
                    <td>{row.installCount}</td>
                    <td>{formatCounts(row.byVersion)}</td>
                    <td>{formatCounts(row.byPlatform)}</td>
                    <td>{formatDateTime(row.lastSeen)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
