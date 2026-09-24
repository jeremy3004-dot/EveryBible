'use client';

import { useEffect } from 'react';

// Without this, a failed read of the moderation tables (for example a permission change or a
// transient database error) would surface as an unhandled 500.
export default function PrayerReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Prayer reports page failed to load:', error);
  }, [error]);

  return (
    <div className="page-stack">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Prayer wall</p>
            <h3>Couldn&rsquo;t load prayer reports</h3>
          </div>
        </div>
        <p className="page-copy">
          The report queue, bans or filter terms failed to load. Retry below. If it keeps failing,
          check the admin logs and that the prayer wall moderation migration is applied.
        </p>
        <button type="button" className="button button--primary" onClick={() => reset()}>
          Retry
        </button>
      </section>
    </div>
  );
}
