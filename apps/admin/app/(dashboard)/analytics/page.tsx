import { AdminSetupCard } from '@/components/AdminSetupCard';
import { DailyTrendsPanel } from '@/components/DailyTrendsPanel';
import { AnalyticsGlobe } from '@/components/AnalyticsGlobe';
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

      <AnalyticsGlobe
        heatmapPoints={analytics.locationMetrics}
        metrics={analytics.locationMetrics}
        listeningTotalMinutes={analytics.listeningTotalMinutes}
        translationBreakdown={analytics.translationBreakdown}
      />

      <section className="metric-grid analytics-page__metrics">
        <article className="metric-card">
          <span>Listening minutes ({windowDays}d)</span>
          <strong>{analytics.listeningTotalMinutes}</strong>
        </article>
        <article className="metric-card">
          <span>Reading minutes ({windowDays}d)</span>
          <strong>{analytics.readingTotalMinutes}</strong>
        </article>
        <article className="metric-card">
          <span>Tracked sessions</span>
          <strong>{analytics.totalTrackedSessions}</strong>
        </article>
        <article className="metric-card">
          <span>Download units ({windowDays}d)</span>
          <strong>{analytics.totalDownloadUnits}</strong>
        </article>
        <article className="metric-card">
          <span>Users with listening</span>
          <strong>{analytics.userCountWithListening}</strong>
        </article>
        <article className="metric-card">
          <span>Active locations</span>
          <strong>{analytics.activeLocationCount}</strong>
        </article>
        <article className="metric-card">
          <span>Average engagement (all users)</span>
          <strong>{analytics.averageEngagementScore}</strong>
          <small className="metric-card__note">
            {analytics.engagementScoreComputedAt
              ? `Scores computed ${new Date(analytics.engagementScoreComputedAt).toLocaleString()}`
              : 'Scores not yet computed'}
          </small>
        </article>
      </section>

      <DailyTrendsPanel
        dailyListeningMinutes={analytics.dailyListeningMinutes}
        dailyReadingMinutes={analytics.dailyReadingMinutes}
        dailyDownloadUnits={analytics.dailyDownloadUnits}
      />

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">By translation</p>
            <h3>Translation engagement</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Translation</th>
                <th>Listening min</th>
                <th>Reading min</th>
                <th>Downloads</th>
                <th>Listeners</th>
                <th>Mapped points</th>
                <th>Map status</th>
              </tr>
            </thead>
            <tbody>
              {analytics.translationBreakdown.map((translation) => (
                <tr key={translation.translationId}>
                  <td>{translation.translationId.toUpperCase()}</td>
                  <td>{Math.round(translation.listeningMinutes)}</td>
                  <td>{Math.round(translation.readingMinutes)}</td>
                  <td>{translation.downloadUnits}</td>
                  <td>{translation.listenerCount}</td>
                  <td>{translation.locationMetrics.length}</td>
                  <td>
                    {translation.locationMetrics.length > 0
                      ? 'Heatmap ready'
                      : analytics.translationBreakdown.length === 1
                        ? 'Using overall map'
                        : 'Totals only'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Top countries</p>
            <h3>Country totals</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Code</th>
                <th>Listening min</th>
                <th>Reading min</th>
                <th title="Download units: 1 = one text translation pack, or one book of audio.">
                  Download units
                </th>
                <th>Listeners</th>
              </tr>
            </thead>
            <tbody>
              {analytics.countryMetrics.map((country) => (
                <tr key={country.code}>
                  <td>{country.name}</td>
                  <td>{country.code}</td>
                  <td>{Math.round(country.listeningMinutes)}</td>
                  <td>{Math.round(country.readingMinutes)}</td>
                  <td>{country.downloadUnits}</td>
                  <td>{country.listenerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
