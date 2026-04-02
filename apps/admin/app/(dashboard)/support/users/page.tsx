import Link from 'next/link';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { listSupportUsers } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDate } from '@/lib/format';

interface SupportUsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SupportUsersPage({ searchParams }: SupportUsersPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const resolvedSearchParams = await searchParams;
  const query = typeof resolvedSearchParams.query === 'string' ? resolvedSearchParams.query : '';
  const users = await listSupportUsers(query);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Phase 7</p>
          <h2>User and support visibility</h2>
          <p className="page-copy">
            Give internal staff enough account, device, engagement, and sync context to answer
            support questions safely without exposing write-heavy tooling too early.
          </p>
        </div>
      </section>

      <section className="card">
        <form className="filter-form">
          <input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search by email or display name"
          />
          <button type="submit" className="button">
            Search
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Joined</th>
                <th>Country</th>
                <th>Reading</th>
                <th>Devices</th>
                <th>Engagement</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.displayName ?? 'Unnamed user'}</strong>
                    <p className="table-note">{user.email ?? 'No email'}</p>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{user.countryName ?? 'Unknown'}</td>
                  <td>
                    {user.currentBook ?? 'No reading yet'}
                    {user.currentChapter ? ` ${user.currentChapter}` : ''}
                    <p className="table-note">Streak {user.streakDays} days</p>
                  </td>
                  <td>{user.deviceCount}</td>
                  <td>{user.engagementScore}</td>
                  <td>
                    <Link href={`/support/users/${user.id}`} className="button">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
