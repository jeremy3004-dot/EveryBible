'use client';

import { useEffect } from 'react';

// Without this, a failure in get_admin_app_error_summary (for example before the
// app_error_reports migration is applied) would surface as an unhandled 500.
export default function AppErrorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App errors page failed to load:', error);
  }, [error]);

  return (
    <div className="page-stack">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Operations</p>
            <h3>Couldn&rsquo;t load app errors</h3>
          </div>
        </div>
        <p className="page-copy">
          The app error summary failed to load. Check that the app_error_reports migration is
          applied and that get_admin_app_error_summary exists, then retry.
        </p>
        <button type="button" className="button button--primary" onClick={() => reset()}>
          Retry
        </button>
      </section>
    </div>
  );
}
