import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import { getChapterFeedbackReviewModel, type ChapterFeedbackFilters } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';

interface FeedbackPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function parseChapter(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  const responseType = firstParam(searchParams.responseType);
  const sentiment = firstParam(searchParams.sentiment);
  const filters: ChapterFeedbackFilters = {
    bookId: firstParam(searchParams.bookId).toUpperCase() || undefined,
    chapter: parseChapter(firstParam(searchParams.chapter)),
    language: firstParam(searchParams.language) || undefined,
    query: firstParam(searchParams.query) || undefined,
    responseType: responseType === 'audio' || responseType === 'text' ? responseType : undefined,
    sentiment: sentiment === 'up' || sentiment === 'down' ? sentiment : undefined,
    translationId: firstParam(searchParams.translationId) || undefined,
  };

  return filters;
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const resolvedSearchParams = await searchParams;
  const filters = buildFilters(resolvedSearchParams);
  const reviewModel = await getChapterFeedbackReviewModel(filters);
  const feedback = reviewModel.feedback;

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
        <form className="filter-form filter-form--wrap">
          <input
            type="search"
            name="query"
            defaultValue={filters.query ?? ''}
            placeholder="Search by translation, book, reviewer, or comment"
          />
          <select name="language" defaultValue={filters.language ?? ''} aria-label="Language">
            <option value="">All languages</option>
            {reviewModel.filters.languages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
          <select
            name="translationId"
            defaultValue={filters.translationId ?? ''}
            aria-label="Translation"
          >
            <option value="">All translations</option>
            {reviewModel.filters.translations.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
          <select name="bookId" defaultValue={filters.bookId ?? ''} aria-label="Book">
            <option value="">All books</option>
            {reviewModel.filters.books.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            name="chapter"
            defaultValue={filters.chapter ?? ''}
            placeholder="Chapter"
            aria-label="Chapter"
          />
          <select name="sentiment" defaultValue={filters.sentiment ?? ''} aria-label="Sentiment">
            <option value="">All ratings</option>
            <option value="down">Needs work</option>
            <option value="up">Helpful</option>
          </select>
          <select
            name="responseType"
            defaultValue={filters.responseType ?? ''}
            aria-label="Response type"
          >
            <option value="">Text and audio</option>
            <option value="audio">Audio only</option>
            <option value="text">Text only</option>
          </select>
          <button type="submit" className="button">
            Filter
          </button>
          <a href="/feedback" className="button button-secondary">
            Reset
          </a>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Coverage</p>
            <h3>Feedback by language</h3>
          </div>
          <span className="table-note">{reviewModel.totalAvailable} recent submissions sampled</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Language</th>
                <th>Submissions</th>
                <th>Books</th>
                <th>Chapters</th>
                <th>Audio</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {reviewModel.coverage.map((item) => (
                <tr key={item.language}>
                  <td>
                    <a href={`/feedback?language=${encodeURIComponent(item.language)}`}>
                      {item.language}
                    </a>
                  </td>
                  <td>{item.submissionCount}</td>
                  <td>{item.bookCount}</td>
                  <td>{item.chapterCount}</td>
                  <td>{item.audioCount}</td>
                  <td>{formatDateTime(item.latestAt)}</td>
                </tr>
              ))}
              {reviewModel.coverage.length === 0 ? (
                <tr>
                  <td colSpan={6}>No chapter feedback has been submitted yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Reference</th>
                <th>Sentiment</th>
                <th>Reviewer</th>
                <th>Comment</th>
                <th>Audio</th>
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
                    {item.audioResponse?.signedUrl ? (
                      <div>
                        <audio
                          controls
                          preload="none"
                          src={item.audioResponse.signedUrl}
                          aria-label={`Audio response for ${item.bookId} ${item.chapter}`}
                        />
                        <p className="table-note">
                          {Math.round(item.audioResponse.durationMs / 1000)}s /{' '}
                          {item.audioResponse.mimeType}
                        </p>
                      </div>
                    ) : item.audioResponse ? (
                      <span className="table-note">Audio unavailable</span>
                    ) : (
                      <span className="table-note">No audio</span>
                    )}
                  </td>
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
                  <td colSpan={7}>No chapter feedback matches this filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
