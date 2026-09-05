import Link from 'next/link';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import {
  getAnalyticsOverview,
  getDashboardSummary,
  getHealthIssues,
  getRecentAuditLogs,
} from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { formatNumber } from '@/lib/analytics-atlas';

export default async function AdminOverviewPage() {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const [summary, healthIssues, auditLogs, analytics] = await Promise.all([
    getDashboardSummary(),
    getHealthIssues(),
    getRecentAuditLogs(),
    getAnalyticsOverview(30),
  ]);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>EveryBible at a glance</h2>
          <p className="page-copy">
            See where Scripture is reaching people, review content, and keep translation delivery
            healthy.
          </p>
        </div>
      </section>

      <section className="atlas-panel">
        <div className="atlas-panel-header">
          <div>
            <p className="eyebrow">Last 30 days</p>
            <h3>Scripture around the world</h3>
          </div>
          <Link className="button button-primary" href="/analytics?window=30">
            Explore activity atlas
          </Link>
        </div>
        <div className="atlas-kpis overview-reach">
          <article>
            <span>Listening minutes</span>
            <strong>{formatNumber(analytics.listeningTotalMinutes)}</strong>
            <small>Across all translations</small>
          </article>
          <article>
            <span>Reading minutes</span>
            <strong>{formatNumber(analytics.readingTotalMinutes)}</strong>
            <small>Time in Scripture</small>
          </article>
          <article>
            <span>Listeners</span>
            <strong>{formatNumber(analytics.userCountWithListening)}</strong>
            <small>{formatNumber(analytics.locatedListenerCount)} with map location</small>
          </article>
          <article>
            <span>Countries reached</span>
            <strong>{formatNumber(analytics.activeCountryCount)}</strong>
            <small>{formatNumber(analytics.totalDownloadUnits)} download units</small>
          </article>
        </div>
        <div className="atlas-source">
          Source: EveryBible analytics · last 30 days · Read country, translation and location
          details in the atlas.
        </div>
      </section>

      <section className="metric-grid">
        <Link href="/translations" className="metric-card">
          <span>Translations</span>
          <strong>{summary.translationCount}</strong>
        </Link>
        <Link href="/translations" className="metric-card">
          <span>Failed syncs</span>
          <strong>{summary.failedSyncCount}</strong>
        </Link>
        <Link href="/content/verse-of-day" className="metric-card">
          <span>Live verses</span>
          <strong>{summary.liveVerseCount}</strong>
        </Link>
        <Link href="/content/images" className="metric-card">
          <span>Live images</span>
          <strong>{summary.liveImageCount}</strong>
        </Link>
        <Link href="/support/users" className="metric-card">
          <span>Support users</span>
          <strong>{summary.supportUserCount}</strong>
        </Link>
        <Link href="/feedback" className="metric-card">
          <span>Chapter feedback</span>
          <strong>{summary.feedbackCount}</strong>
          <small>Open review queue</small>
        </Link>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Health snapshot</p>
            <h3>Catch issues before they hurt the mobile experience.</h3>
          </div>
          <Link href="/health" className="button">
            Open health dashboard
          </Link>
        </div>

        <div className="issue-list">
          {healthIssues.map((issue) => (
            <Link key={issue.title} href={issue.href} className="issue-card">
              <div className="issue-card__header">
                <h4>{issue.title}</h4>
                <StatusPill
                  tone={
                    issue.severity === 'critical'
                      ? 'danger'
                      : issue.severity === 'warning'
                        ? 'warning'
                        : 'default'
                  }
                >
                  {issue.severity}
                </StatusPill>
              </div>
              <p>{issue.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Audit</p>
            <h3>Recent admin actions</h3>
          </div>
          <Link href="/settings" className="button">
            View full audit trail
          </Link>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="data-table__empty">
                    No admin actions recorded yet — actions appear here when you publish, sync, or
                    moderate.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.action}</td>
                    <td>{log.entity_type}</td>
                    <td>{log.actor_email ?? 'Unknown'}</td>
                    <td>{log.summary}</td>
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
