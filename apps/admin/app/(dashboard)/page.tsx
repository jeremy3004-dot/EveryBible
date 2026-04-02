import Link from 'next/link';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { getDashboardSummary, getHealthIssues, getRecentAuditLogs } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';

export default async function AdminOverviewPage() {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const [summary, healthIssues, auditLogs] = await Promise.all([
    getDashboardSummary(),
    getHealthIssues(),
    getRecentAuditLogs(),
  ]);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Operate translation delivery, dynamic content, support, and reporting from one place.</h2>
          <p className="page-copy">
            The admin platform is now wired for secure access, operational visibility, and
            the full set of content and reporting workflows defined in the web-platform roadmap.
          </p>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Translations</span>
          <strong>{summary.translationCount}</strong>
        </article>
        <article className="metric-card">
          <span>Failed syncs</span>
          <strong>{summary.failedSyncCount}</strong>
        </article>
        <article className="metric-card">
          <span>Live verses</span>
          <strong>{summary.liveVerseCount}</strong>
        </article>
        <article className="metric-card">
          <span>Live images</span>
          <strong>{summary.liveImageCount}</strong>
        </article>
        <article className="metric-card">
          <span>Support users</span>
          <strong>{summary.supportUserCount}</strong>
        </article>
        <article className="metric-card">
          <span>Admin modules</span>
          <strong>{summary.adminPathCount}</strong>
        </article>
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
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.action}</td>
                  <td>{log.entity_type}</td>
                  <td>{log.actor_email ?? 'Unknown'}</td>
                  <td>{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
