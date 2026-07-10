'use client';

import Link from 'next/link';

// Time-range picker for the analytics dashboard. Navigating changes the
// `?window=` search param, which re-runs the server fetch with a new window.
// (A different window is genuinely different data, so a re-fetch per selection
// is correct here — unlike the translation filter, which is client-only.)
export function AnalyticsTimeRangePicker({
  options,
  selected,
}: {
  options: readonly number[];
  selected: number;
}) {
  return (
    <div className="segmented" role="group" aria-label="Analytics time range">
      {options.map((days) => {
        const isActive = days === selected;
        return (
          <Link
            key={days}
            href={`/analytics?window=${days}`}
            className={`button ${isActive ? 'button--primary' : 'button-secondary'}`}
            aria-current={isActive ? 'true' : undefined}
            prefetch={false}
          >
            {days}d
          </Link>
        );
      })}
    </div>
  );
}
