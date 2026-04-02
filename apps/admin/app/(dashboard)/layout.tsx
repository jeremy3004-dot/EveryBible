import Link from 'next/link';
import type { ReactNode } from 'react';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { adminNavigation } from '@/lib/admin-navigation';

import { signOutAction } from '../(auth)/login/actions';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const adminIdentity = await requireAdminIdentity();

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
          {adminNavigation.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              <span>{item.label}</span>
              <small>{item.description}</small>
            </Link>
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
    </div>
  );
}
