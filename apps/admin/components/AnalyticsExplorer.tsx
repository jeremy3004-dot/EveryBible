'use client';

import { useState } from 'react';

import { AnalyticsGlobe } from '@/components/AnalyticsGlobe';
import { DailyTrendsPanel } from '@/components/DailyTrendsPanel';
import type { AnalyticsOverview } from '@/lib/admin-data';

// Client wrapper that owns the translation filter so the in-globe chip selection
// stays in sync with the country totals table + translation table (P3 S17). The
// server component fetches once and passes the full overview in; nothing here
// re-fetches.
export function AnalyticsExplorer({
  analytics,
  windowDays,
}: {
  analytics: AnalyticsOverview;
  windowDays: number;
}) {
  const [selectedTranslation, setSelectedTranslation] = useState<string | null>(null);

  const activeEntry = selectedTranslation
    ? analytics.translationBreakdown.find((entry) => entry.translationId === selectedTranslation) ??
      null
    : null;
  const countryRows = activeEntry ? activeEntry.countryMetrics : analytics.countryMetrics;

  return (
    <>
      <AnalyticsGlobe
        heatmapPoints={analytics.locationMetrics}
        metrics={analytics.locationMetrics}
        listeningTotalMinutes={analytics.listeningTotalMinutes}
        translationBreakdown={analytics.translationBreakdown}
        onSelectedTranslationChange={setSelectedTranslation}
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
          {selectedTranslation ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setSelectedTranslation(null)}
            >
              Clear filter
            </button>
          ) : null}
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
              {analytics.translationBreakdown.map((translation) => {
                const isSelected = translation.translationId === selectedTranslation;
                return (
                  <tr
                    key={translation.translationId}
                    className={isSelected ? 'data-table__row--active' : undefined}
                    aria-selected={isSelected || undefined}
                  >
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Top countries</p>
            <h3>Country totals</h3>
            {selectedTranslation ? (
              <p className="analytics-page__note">Filtered to {selectedTranslation.toUpperCase()}</p>
            ) : null}
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
              {countryRows.map((country) => (
                <tr key={country.code}>
                  <td>{country.name}</td>
                  <td>{country.code}</td>
                  <td>{Math.round(country.listeningMinutes)}</td>
                  <td>{Math.round(country.readingMinutes)}</td>
                  <td>{country.downloadUnits}</td>
                  <td>{country.listenerCount}</td>
                </tr>
              ))}
              {countryRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No country activity for this selection.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
