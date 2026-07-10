import { AdminSetupCard } from '@/components/AdminSetupCard';
import { AnalyticsExplorer } from '@/components/AnalyticsExplorer';
import { RefreshAnalyticsButton } from '@/components/RefreshAnalyticsButton';
import { AnalyticsTimeRangePicker } from '@/components/AnalyticsTimeRangePicker';
import {
  ANALYTICS_WINDOW_OPTIONS,
  getAnalyticsOverview,
  normalizeAnalyticsWindow,
} from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';

// Analytics data must reflect the live DB on every request — disable static
// generation and Next.js fetch caching for this route.
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const windowDays = normalizeAnalyticsWindow((await searchParams).window);
  const analytics = await getAnalyticsOverview(windowDays);

  return (
    <div className="analytics-page">
      <div className="analytics-page__header">
        <div>
          <p className="eyebrow">Usage analytics</p>
          <h2>Global overview</h2>
          <p className="analytics-page__note">
            Map and listening totals update live. Engagement scores refresh via nightly cron or manually below.
          </p>
        </div>
        <div className="analytics-page__header-actions">
          <AnalyticsTimeRangePicker options={ANALYTICS_WINDOW_OPTIONS} selected={windowDays} />
          <RefreshAnalyticsButton />
        </div>
      </div>

      {/* Globe + metric grid + daily trends + translation/country tables live in
          a client wrapper so the in-globe translation filter stays in sync with
          the tables (P3 S17). */}
      <AnalyticsExplorer analytics={analytics} windowDays={windowDays} />
    </div>
  );
}
