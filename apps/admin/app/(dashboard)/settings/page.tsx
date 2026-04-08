import { AdminSetupCard } from '@/components/AdminSetupCard';
import { getRecentAuditLogs } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';

export default async function SettingsPage() {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const auditLogs = await getRecentAuditLogs(50);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Phase 9</p>
          <h2>Hardening, auditability, and role-expansion prep</h2>
          <p className="page-copy">
            The first admin release ships with a single `super_admin` role, but the data model,
            server actions, and audit trail are now structured so more granular roles can be
            introduced later without rewriting the platform.
          </p>
        </div>
      </section>

      <section className="two-column">
        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Role model</p>
              <h3>Current access boundary</h3>
            </div>
          </div>

          <ul className="bullet-list">
            <li>
              `profiles.admin_role = super_admin` is now the single trusted gate for admin access.
            </li>
            <li>
              Public and admin sessions stay isolated to the admin domain and protected proxy flow.
            </li>
            <li>
              Admin mutations run with service role only after a validated authenticated admin
              identity.
            </li>
          </ul>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Release confidence</p>
              <h3>Verification gates</h3>
            </div>
          </div>

          <ul className="bullet-list">
            <li>
              Dedicated `site:*` and `admin:*` build, lint, and typecheck commands remain available
              at repo root.
            </li>
            <li>
              Admin write paths are centralized in server actions so audit logging and revalidation
              are consistent.
            </li>
            <li>The public mobile override API can be verified independently from the admin UI.</li>
          </ul>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h3>Recent admin actions</h3>
          </div>
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
