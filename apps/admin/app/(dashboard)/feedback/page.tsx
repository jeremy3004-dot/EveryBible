import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { listChapterFeedback } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';

interface FeedbackPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const resolvedSearchParams = await searchParams;
  const query = typeof resolvedSearchParams.query === 'string' ? resolvedSearchParams.query : '';
  const feedback = await listChapterFeedback(query);

  return (
    <div className="page-stack">
      <section className="page-header page-header--inline">
        <div>
          <p className="eyebrow">Chapter feedback</p>
          <h2>Review chapter-level translation feedback from the mobile app.</h2>
          <p className="page-copy">
            Submissions are stored directly in Supabase and shown here for admin review.
          </p>
        </div>
      </section>

      <section className="card">
        <form className="filter-form">
          <input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search by translation, book, reviewer, or comment"
          />
          <button type="submit" className="button">
            Filter
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Reference</th>
                <th>Sentiment</th>
                <th>Reviewer</th>
                <th>Comment</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((item) => (
                <tr key={item.id}>
                  <td>
                    {formatDateTime(item.createdAt)}
                    <p className="table-note">{item.id}</p>
                  </td>
                  <td>
                    <strong>
                      {item.bookId} {item.chapter}
                    </strong>
                    <p className="table-note">
                      {item.translationLanguage} / {item.translationId}
                    </p>
                  </td>
                  <td>
                    <StatusPill tone={item.sentiment === 'up' ? 'success' : 'warning'}>
                      {item.sentiment === 'up' ? 'Helpful' : 'Needs work'}
                    </StatusPill>
                  </td>
                  <td>
                    {item.participantLabel}
                    <p className="table-note">{item.userId ?? 'No user id'}</p>
                  </td>
                  <td>{item.comment ?? <span className="table-note">No comment</span>}</td>
                  <td>
                    {item.sourceScreen}
                    <p className="table-note">
                      {item.appLabel} / {item.interfaceLanguage}
                    </p>
                  </td>
                </tr>
              ))}
              {feedback.length === 0 ? (
                <tr>
                  <td colSpan={6}>No chapter feedback matches this filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
