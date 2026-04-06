import { AdminSetupCard } from '@/components/AdminSetupCard';
import { DailyTrendsPanel } from '@/components/DailyTrendsPanel';
import { AnalyticsGlobe } from '@/components/AnalyticsGlobe';
import { RefreshAnalyticsButton } from '@/components/RefreshAnalyticsButton';
import { getAnalyticsOverview } from '@/lib/admin-data';
import { getAdminRequiredEnvKeys } from '@/lib/env';

export default async function AnalyticsPage() {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const analytics = await getAnalyticsOverview();

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
        <RefreshAnalyticsButton />
      </div>

      <AnalyticsGlobe
      heatmapPoints={analytics.locationMetrics}
      metrics={analytics.countryMetrics}
      listeningTotalMinutes={analytics.listeningTotalMinutes}
      translationBreakdown={analytics.translationBreakdown}
    />

      <section className="metric-grid analytics-page__metrics">
        <article className="metric-card">
          <span>Listening minutes (30d)</span>
          <strong>{analytics.listeningTotalMinutes}</strong>
        </article>
        <article className="metric-card">
          <span>Reading minutes (30d)</span>
          <strong>{analytics.readingTotalMinutes}</strong>
        </article>
        <article className="metric-card">
          <span>Tracked sessions</span>
          <strong>{analytics.totalTrackedSessions}</strong>
        </article>
        <article className="metric-card">
          <span>Download units (30d)</span>
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
          <span>Average engagement</span>
          <strong>{analytics.averageEngagementScore}</strong>
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
            <p className="eyebrow">Top locations</p>
            <h3>Location totals</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Code</th>
                <th>Listening min</th>
                <th>Download units</th>
                <th>Listeners</th>
              </tr>
            </thead>
            <tbody>
              {analytics.locationMetrics.map((location) => (
                <tr key={location.code}>
                  <td>{location.name}</td>
                  <td>{location.code}</td>
                  <td>{Math.round(location.listeningMinutes)}</td>
                  <td>{location.downloadUnits}</td>
                  <td>{location.listenerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
