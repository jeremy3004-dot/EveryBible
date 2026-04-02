import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { getSupportUserDetail } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDate, formatDateTime } from '@/lib/format';

interface SupportUserDetailPageProps {
  params: Promise<{ userId: string }>;
}

export default async function SupportUserDetailPage({
  params,
}: SupportUserDetailPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const { userId } = await params;
  const detail = await getSupportUserDetail(userId);

  if (!detail || !detail.profile) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Support detail</p>
          <h2>{detail.profile.display_name ?? detail.profile.email ?? 'EveryBible user'}</h2>
          <p className="page-copy">
            Read-only support context across profile, preferences, devices, sessions, and recent
            admin actions tied to this user.
          </p>
        </div>
        <Link href="/support/users" className="button">
          Back to users
        </Link>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Sessions</span>
          <strong>{detail.sessionCount}</strong>
        </article>
        <article className="metric-card">
          <span>Plans</span>
          <strong>{detail.planCount}</strong>
        </article>
        <article className="metric-card">
          <span>Feedback items</span>
          <strong>{detail.feedbackCount}</strong>
        </article>
        <article className="metric-card">
          <span>Devices</span>
          <strong>{detail.devices.length}</strong>
        </article>
      </section>

      <section className="two-column">
        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Profile</p>
              <h3>Identity and preferences</h3>
            </div>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Email</dt>
              <dd>{detail.profile.email ?? 'No email'}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(detail.profile.created_at)}</dd>
            </div>
            <div>
              <dt>Theme</dt>
              <dd>{detail.preferences?.theme ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Interface language</dt>
              <dd>{detail.preferences?.language ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{detail.preferences?.country_name ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Content language</dt>
              <dd>{detail.preferences?.content_language_name ?? 'Unknown'}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Reading state</p>
              <h3>Progress and engagement</h3>
            </div>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Current location</dt>
              <dd>
                {detail.progress?.current_book ?? 'Unknown'}
                {detail.progress?.current_chapter ? ` ${detail.progress.current_chapter}` : ''}
              </dd>
            </div>
            <div>
              <dt>Last active</dt>
              <dd>{formatDate(detail.engagement?.last_active_date)}</dd>
            </div>
            <div>
              <dt>Engagement score</dt>
              <dd>{detail.engagement?.engagement_score ?? 0}</dd>
            </div>
            <div>
              <dt>Total listening minutes</dt>
              <dd>{detail.engagement?.total_listening_minutes ?? 0}</dd>
            </div>
            <div>
              <dt>Total chapters read</dt>
              <dd>{detail.engagement?.total_chapters_read ?? 0}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Devices</p>
            <h3>Registered push and app installations</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Version</th>
                <th>Created</th>
                <th>Status</th>
                <th>Push token</th>
              </tr>
            </thead>
            <tbody>
              {detail.devices.map((device) => (
                <tr key={device.id}>
                  <td>{device.platform}</td>
                  <td>{device.app_version ?? 'Unknown'}</td>
                  <td>{formatDateTime(device.created_at)}</td>
                  <td>{device.is_active ? 'active' : 'inactive'}</td>
                  <td className="table-preview">{device.push_token}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h3>Recent admin actions mentioning this user</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {detail.recentAuditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.action}</td>
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
