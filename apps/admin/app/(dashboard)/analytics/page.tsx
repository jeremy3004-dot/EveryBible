import { AdminSetupCard } from '@/components/AdminSetupCard';
import { DailyTrendsPanel } from '@/components/DailyTrendsPanel';
import { AnalyticsGlobe } from '@/components/AnalyticsGlobe';
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
      <AnalyticsGlobe metrics={analytics.countryMetrics} />

      <section className="metric-grid analytics-page__metrics">
        <article className="metric-card">
          <span>Listening minutes (30d)</span>
          <strong>{analytics.listeningTotalMinutes}</strong>
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
          <span>Active countries</span>
          <strong>{analytics.activeCountryCount}</strong>
        </article>
        <article className="metric-card">
          <span>Average engagement</span>
          <strong>{analytics.averageEngagementScore}</strong>
        </article>
      </section>

      <DailyTrendsPanel
        dailyListeningMinutes={analytics.dailyListeningMinutes}
        dailyDownloadUnits={analytics.dailyDownloadUnits}
      />

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
                <th>Download units</th>
                <th>Listeners</th>
              </tr>
            </thead>
            <tbody>
              {analytics.countryMetrics.map((country) => (
                <tr key={country.code}>
                  <td>{country.name}</td>
                  <td>{country.code}</td>
                  <td>{Math.round(country.listeningMinutes)}</td>
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
