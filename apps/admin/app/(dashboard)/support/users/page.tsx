import Link from 'next/link';

import { AdminCard, DataTable, FilterForm, PageHeader } from '@/components/admin';
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

  const columns = [
    { key: 'user', header: 'User' },
    { key: 'joined', header: 'Joined' },
    { key: 'country', header: 'Country' },
    { key: 'reading', header: 'Reading' },
    { key: 'devices', header: 'Devices' },
    { key: 'engagement', header: 'Engagement' },
    { key: 'details', header: 'Details' },
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Phase 7" title="User and support visibility">
        Give internal staff enough account, device, engagement, and sync context to answer support
        questions safely without exposing write-heavy tooling too early.
      </PageHeader>

      <AdminCard>
        <FilterForm>
          <input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search by email or display name"
          />
          <button type="submit" className="button">
            Search
          </button>
        </FilterForm>

        <DataTable columns={columns}>
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
        </DataTable>
      </AdminCard>
    </div>
  );
}
