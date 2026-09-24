import { AdminCard, DataTable, PageHeader } from '@/components/admin';
import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import {
  FILTER_TERM_MAX_LENGTH,
  PRAYER_REPORT_AUTO_HIDE_THRESHOLD,
  getPrayerFilterTerms,
  getPrayerReportQueue,
  type PrayerReportQueueFilter,
  type ReportedPrayerRequest,
} from '@/lib/prayer-moderation';

import {
  addPrayerFilterTermAction,
  banPrayerAuthorAction,
  deletePrayerRequestAction,
  hidePrayerRequestAction,
  removePrayerFilterTermAction,
  restorePrayerRequestAction,
  unbanPrayerAuthorAction,
} from './actions';

interface PrayerReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function visibility(item: ReportedPrayerRequest) {
  if (!item.requestExists) return <StatusPill tone="default">Deleted</StatusPill>;
  if (item.hiddenReason === 'reports') {
    return <StatusPill tone="danger">Hidden by reports</StatusPill>;
  }
  if (item.hiddenReason === 'admin') return <StatusPill tone="warning">Hidden by admin</StatusPill>;
  return <StatusPill tone="success">Visible</StatusPill>;
}

function RequestActions({ item, returnTo }: { item: ReportedPrayerRequest; returnTo: string }) {
  if (!item.requestExists) return <span className="table-note">No actions</span>;

  return (
    <div className="stack-form stack-form--compact">
      <form action={item.hiddenAt ? restorePrayerRequestAction : hidePrayerRequestAction}>
        <input type="hidden" name="requestId" value={item.requestId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button type="submit" className="button button-secondary">
          {item.hiddenAt ? 'Restore' : 'Hide'}
        </button>
      </form>
      <form action={deletePrayerRequestAction} className="stack-inline">
        <input type="hidden" name="requestId" value={item.requestId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="filter-form__check">
          <input type="checkbox" name="confirm" value="yes" required />
          Confirm
        </label>
        <button type="submit" className="button button-secondary">
          Delete
        </button>
      </form>
      {item.authorBanned ? (
        <span className="table-note">Author is banned</span>
      ) : (
        <form action={banPrayerAuthorAction} className="stack-inline">
          <input type="hidden" name="userId" value={item.authorId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input
            type="text"
            name="reason"
            maxLength={500}
            placeholder="Ban reason (optional)"
            aria-label={`Ban reason for ${item.authorId}`}
          />
          <label className="filter-form__check">
            <input type="checkbox" name="confirm" value="yes" required />
            Confirm
          </label>
          <button type="submit" className="button button-secondary">
            Ban author
          </button>
        </form>
      )}
    </div>
  );
}

export default async function PrayerReportsPage({ searchParams }: PrayerReportsPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  await requireAdminIdentity();
  const resolvedSearchParams = await searchParams;
  const filter: PrayerReportQueueFilter =
    firstParam(resolvedSearchParams.status) === 'all' ? 'all' : 'open';
  const returnTo = filter === 'all' ? '/prayer-reports?status=all' : '/prayer-reports';
  const notice = firstParam(resolvedSearchParams.notice);
  const error = firstParam(resolvedSearchParams.error);
  const [queue, terms] = await Promise.all([getPrayerReportQueue(filter), getPrayerFilterTerms()]);

  const reportColumns = [
    { key: 'request', header: 'Request' },
    { key: 'group', header: 'Group / author' },
    { key: 'reports', header: 'Reports' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions' },
  ];
  const banColumns = [
    { key: 'user', header: 'Author' },
    { key: 'reason', header: 'Reason' },
    { key: 'since', header: 'Banned' },
    { key: 'actions', header: 'Actions' },
  ];
  const termColumns = [
    { key: 'term', header: 'Term' },
    { key: 'mode', header: 'Match' },
    { key: 'language', header: 'Language' },
    { key: 'actions', header: 'Actions' },
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Prayer wall" title="Reported prayer requests">
        Members report prayer requests from the app. A reported request disappears for the member
        who reported it, and {PRAYER_REPORT_AUTO_HIDE_THRESHOLD} open reports from different members
        hide it for the whole group until it is reviewed here. Review new reports within 24 hours:
        hide or delete what breaks the rules, restore what does not, and ban repeat offenders.
      </PageHeader>
      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--warning">{error}</p> : null}

      <AdminCard eyebrow="Queue" title={filter === 'all' ? 'All reports' : 'Open reports'}>
        <p className="table-note">
          {filter === 'all' ? (
            <a href="/prayer-reports">Show open reports only</a>
          ) : (
            <a href="/prayer-reports?status=all">Show reviewed reports too</a>
          )}
        </p>
        {queue.truncated ? (
          <p className="notice notice--warning">
            Showing the newest {queue.reportsShown} of {queue.reportTotal} reports. Older reports
            are not listed; on the open queue they appear as the newer ones are reviewed.
          </p>
        ) : null}
        <DataTable columns={reportColumns}>
          {queue.items.length === 0 ? (
            <tr>
              <td colSpan={reportColumns.length} className="data-table__empty">
                {filter === 'all' ? 'No prayer requests have been reported.' : 'No open reports.'}
              </td>
            </tr>
          ) : (
            queue.items.map((item) => (
              <tr key={item.requestId}>
                <td>
                  {item.content}
                  {item.editedSinceReport ? (
                    <p className="table-note">
                      Edited after the report. Reported text: {item.reportedContent}
                    </p>
                  ) : null}
                  <p className="table-note">{item.requestId}</p>
                </td>
                <td>
                  {item.groupName ?? 'Unnamed group'}
                  <p className="table-note">{item.groupId}</p>
                  <p className="table-note">Author {item.authorId}</p>
                </td>
                <td>
                  <strong>{item.openReportCount} open</strong>
                  {item.reports.map((entry) => (
                    <p key={entry.id} className="table-note">
                      {entry.reasonLabel}
                      {entry.note ? `: ${entry.note}` : ''} ({formatDateTime(entry.createdAt)},{' '}
                      {entry.status})
                    </p>
                  ))}
                </td>
                <td>
                  {visibility(item)}
                  {item.hiddenAt ? (
                    <p className="table-note">{formatDateTime(item.hiddenAt)}</p>
                  ) : null}
                </td>
                <td>
                  <RequestActions item={item} returnTo={returnTo} />
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </AdminCard>

      <AdminCard eyebrow="Bans" title="Authors banned from the prayer wall">
        <p className="table-note">
          A banned member cannot post or edit on any wall. Lifting a ban does not restore the
          requests that were hidden with it.
        </p>
        <DataTable columns={banColumns}>
          {queue.bans.length === 0 ? (
            <tr>
              <td colSpan={banColumns.length} className="data-table__empty">
                Nobody is banned.
              </td>
            </tr>
          ) : (
            queue.bans.map((ban) => (
              <tr key={ban.userId}>
                <td>{ban.userId}</td>
                <td>{ban.reason ?? <span className="table-note">No reason given</span>}</td>
                <td>{formatDateTime(ban.createdAt)}</td>
                <td>
                  <form action={unbanPrayerAuthorAction}>
                    <input type="hidden" name="userId" value={ban.userId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button type="submit" className="button button-secondary">
                      Lift ban
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </AdminCard>

      <AdminCard eyebrow="Content filter" title="Blocked words and phrases">
        <p className="table-note">
          New and edited requests containing a term are refused. A word term must stand alone
          (letter case and punctuation are ignored). A substring term matches anywhere, ignoring
          spaces; use it for scripts written without spaces, such as Chinese. Keep terms
          unambiguous: a false match blocks someone&apos;s prayer.
        </p>
        <form action={addPrayerFilterTermAction} className="filter-form filter-form--wrap">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input
            name="term"
            required
            maxLength={FILTER_TERM_MAX_LENGTH}
            placeholder="Word or phrase"
            aria-label="Term"
          />
          <select name="matchMode" defaultValue="word" aria-label="Match mode">
            <option value="word">Whole word</option>
            <option value="substring">Anywhere (substring)</option>
          </select>
          <input
            name="language"
            maxLength={3}
            placeholder="Language (en)"
            aria-label="Language code"
          />
          <button type="submit" className="button button--primary">
            Add term
          </button>
        </form>
        <details>
          <summary>Show the {terms.length} current terms (offensive language)</summary>
          <DataTable columns={termColumns}>
            {terms.length === 0 ? (
              <tr>
                <td colSpan={termColumns.length} className="data-table__empty">
                  No filter terms yet, so no request is blocked by its wording.
                </td>
              </tr>
            ) : null}
            {terms.map((term) => (
              <tr key={term.id}>
                <td>{term.term}</td>
                <td>{term.matchMode === 'word' ? 'Whole word' : 'Substring'}</td>
                <td>{term.language ?? 'Any'}</td>
                <td>
                  <form action={removePrayerFilterTermAction}>
                    <input type="hidden" name="termId" value={term.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button type="submit" className="button button-secondary">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </DataTable>
        </details>
      </AdminCard>
    </div>
  );
}
