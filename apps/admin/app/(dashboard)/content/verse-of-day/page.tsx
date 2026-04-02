import { StatusPill } from '@/components/StatusPill';
import { AdminSetupCard } from '@/components/AdminSetupCard';
import { listContentImages, listVerseOfDayEntries } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime, getError, getNotice } from '@/lib/format';

import { archiveVerseOfDayAction, saveVerseOfDayAction } from '../../actions';

interface VerseOfDayPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VerseOfDayPage({ searchParams }: VerseOfDayPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const resolvedSearchParams = await searchParams;
  const notice = getNotice(resolvedSearchParams);
  const error = getError(resolvedSearchParams);
  const [entries, images] = await Promise.all([listVerseOfDayEntries(), listContentImages()]);
  const verseImages = images.filter((image) => image.kind === 'verse_of_day');

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Phase 5</p>
          <h2>Verse of the Day operations</h2>
          <p className="page-copy">
            Draft, schedule, publish, and archive daily Scripture entries while preserving a
            stable verse snapshot for the mobile override feed.
          </p>
        </div>
      </section>

      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--danger">{error}</p> : null}

      <section className="two-column">
        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Create or update</p>
              <h3>New verse-of-the-day entry</h3>
            </div>
          </div>

          <form action={saveVerseOfDayAction} className="stack-form">
            <label>
              Internal title
              <input name="title" type="text" placeholder="Hope for anxious hearts" />
            </label>

            <div className="form-grid">
              <label>
                Translation
                <input name="translationId" type="text" placeholder="BSB" defaultValue="BSB" required />
              </label>
              <label>
                Book
                <input name="bookId" type="text" placeholder="PSA" required />
              </label>
              <label>
                Chapter
                <input name="chapter" type="number" min="1" required />
              </label>
              <label>
                Verse
                <input name="verse" type="number" min="1" required />
              </label>
            </div>

            <label>
              Reflection
              <textarea
                name="reflection"
                rows={4}
                placeholder="Optional pastoral context shown in admin and available for future mobile use."
              />
            </label>

            <div className="form-grid">
              <label>
                State
                <select name="state" defaultValue="draft">
                  <option value="draft">draft</option>
                  <option value="scheduled">scheduled</option>
                  <option value="live">live</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label>
                Image
                <select name="imageId" defaultValue="">
                  <option value="">No image</option>
                  {verseImages.map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Starts at
                <input name="startsAt" type="datetime-local" />
              </label>
              <label>
                Ends at
                <input name="endsAt" type="datetime-local" />
              </label>
            </div>

            <button type="submit" className="button button--primary">
              Save entry
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Publishing model</p>
              <h3>Mobile override contract</h3>
            </div>
          </div>

          <ul className="bullet-list">
            <li>Only entries within their active window are emitted to the public mobile content feed.</li>
            <li>Every entry stores a verse snapshot so downstream clients do not depend on live verse lookups.</li>
            <li>The current API feed is designed to preserve bundled mobile defaults if no live entry is available.</li>
          </ul>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Entries</p>
            <h3>Current verse-of-the-day library</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>State</th>
                <th>Starts at</th>
                <th>Updated</th>
                <th>Preview</th>
                <th>Archive</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.referenceLabel}</strong>
                    <p className="table-note">{entry.title ?? 'Untitled'}</p>
                  </td>
                  <td>
                    <StatusPill
                      tone={
                        entry.state === 'live'
                          ? 'success'
                          : entry.state === 'scheduled'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {entry.state}
                    </StatusPill>
                  </td>
                  <td>{formatDateTime(entry.startsAt)}</td>
                  <td>{formatDateTime(entry.updatedAt)}</td>
                  <td className="table-preview">{entry.verseText}</td>
                  <td>
                    <form action={archiveVerseOfDayAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <button type="submit" className="button">
                        Archive
                      </button>
                    </form>
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
