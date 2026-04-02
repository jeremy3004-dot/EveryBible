import Link from 'next/link';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { getHealthIssues, listSyncRuns } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';

export default async function HealthPage() {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const [issues, syncRuns] = await Promise.all([getHealthIssues(), listSyncRuns(20)]);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Phase 6</p>
          <h2>Content health and readiness checks</h2>
          <p className="page-copy">
            Focus the first health layer on operational readiness: stale upstream syncs, missing
            live content, and mismatched delivery state before app users ever feel the breakage.
          </p>
        </div>
      </section>

      <section className="issue-list">
        {issues.map((issue) => (
          <Link key={issue.title} href={issue.href} className="issue-card">
            <div className="issue-card__header">
              <h3>{issue.title}</h3>
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
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Translation sync timeline</p>
            <h3>Recent runs</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Finished</th>
                <th>Inserted</th>
                <th>Updated</th>
                <th>Failed</th>
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
                  <td>{formatDateTime(run.finished_at)}</td>
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
