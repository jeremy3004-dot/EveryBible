'use client';

import { useEffect } from 'react';

// Error boundary for the analytics route. Without this, a failure in the
// get_admin_analytics_overview RPC (e.g. a permission change, a transient DB
// error) surfaces as an unhandled 500. Now it renders a recoverable card.
export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Analytics dashboard failed to load:', error);
  }, [error]);

  return (
    <div className="analytics-page">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Usage analytics</p>
            <h3>Couldn&rsquo;t load analytics</h3>
          </div>
        </div>
        <p className="analytics-page__note">
          The analytics overview failed to load. This is usually transient — retry below. If it
          persists, check the admin logs and the get_admin_analytics_overview RPC.
        </p>
        <button type="button" className="button button--primary" onClick={() => reset()}>
          Retry
        </button>
      </section>
    </div>
  );
}
