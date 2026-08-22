import type { ReactNode } from 'react';

import { AdminNavLink } from '@/components/AdminNavLink';
import { AdminSetupCard } from '@/components/AdminSetupCard';
import { OperatorLauncher } from '@/components/OperatorLauncher';
import { StatusPill } from '@/components/StatusPill';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { getAdminNavigationSections } from '@/lib/admin-navigation';

import { signOutAction } from '../(auth)/login/actions';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const adminIdentity = await requireAdminIdentity();
  const navigationSections = getAdminNavigationSections();

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar__brand">
          <span className="brand-mark">EB</span>
          <div>
            <p className="dashboard-sidebar__eyebrow">EveryBible</p>
            <h1>Admin Platform</h1>
          </div>
        </div>

        <nav className="dashboard-sidebar__nav" aria-label="Admin navigation">
          {navigationSections.map((section) => (
            <div key={section.group} className="nav-group">
              <p className="nav-group__label">{section.group}</p>
              <div className="nav-group__items">
                {section.items.map((item) => (
                  <AdminNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    description={item.description}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="dashboard-sidebar__footer">
          <div className="dashboard-sidebar__identity">
            <p>{adminIdentity.name}</p>
            <span>{adminIdentity.email}</span>
          </div>
          <StatusPill tone="success">super_admin</StatusPill>
          <form action={signOutAction}>
            <button type="submit" className="button">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="dashboard-main">{children}</main>
      <OperatorLauncher />
    </div>
  );
}
