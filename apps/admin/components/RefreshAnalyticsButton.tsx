'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { refreshEngagementStats } from '@/app/(dashboard)/analytics/actions';

export function RefreshAnalyticsButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const handleClick = async () => {
    setPending(true);
    try {
      await refreshEngagementStats();
      setLastRefreshed(new Date().toLocaleTimeString());
      router.refresh();
    } catch {
      // Refresh best-effort — still navigate so live data shows
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="refresh-analytics">
      <button
        type="button"
        className="button"
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? 'Refreshing…' : 'Refresh stats'}
      </button>
      {lastRefreshed ? (
        <span className="refresh-analytics__timestamp">Updated at {lastRefreshed}</span>
      ) : null}
    </div>
  );
}
