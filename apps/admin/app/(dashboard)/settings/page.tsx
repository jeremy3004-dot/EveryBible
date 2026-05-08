import { AdminCard, DataTable, PageHeader } from '@/components/admin';
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

  const auditColumns = [
    { key: 'when', header: 'When' },
    { key: 'action', header: 'Action' },
    { key: 'entity', header: 'Entity' },
    { key: 'actor', header: 'Actor' },
    { key: 'summary', header: 'Summary' },
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Phase 9" title="Hardening, auditability, and role-expansion prep">
        The first admin release ships with a single `super_admin` role, but the data model, server
        actions, and audit trail are now structured so more granular roles can be introduced later
        without rewriting the platform.
      </PageHeader>

      <section className="two-column">
        <AdminCard as="article" eyebrow="Role model" title="Current access boundary">
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
        </AdminCard>

        <AdminCard as="article" eyebrow="Release confidence" title="Verification gates">
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
        </AdminCard>
      </section>

      <AdminCard eyebrow="Audit trail" title="Recent admin actions">
        <DataTable columns={auditColumns}>
          {auditLogs.map((log) => (
            <tr key={log.id}>
              <td>{formatDateTime(log.created_at)}</td>
              <td>{log.action}</td>
              <td>{log.entity_type}</td>
              <td>{log.actor_email ?? 'Unknown'}</td>
              <td>{log.summary}</td>
            </tr>
          ))}
        </DataTable>
      </AdminCard>
    </div>
  );
}
