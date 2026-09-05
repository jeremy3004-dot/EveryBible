'use client';

import { useRef, useState } from 'react';
import { AnalyticsCollectionHealth } from '@/components/AnalyticsCollectionHealth';
import { AnalyticsGlobe } from '@/components/AnalyticsGlobe';
import { AnalyticsTables } from '@/components/AnalyticsTables';
import { DailyTrendsPanel } from '@/components/DailyTrendsPanel';
import type { AnalyticsOverview } from '@/lib/admin-data';
import {
  ATLAS_METRICS,
  formatNumber,
  getAtlasPoints,
  getAtlasScope,
  type AtlasMetric,
} from '@/lib/analytics-atlas';

export function AnalyticsExplorer({
  analytics,
  windowDays,
}: {
  analytics: AnalyticsOverview;
  windowDays: number;
}) {
  const [selectedTranslation, setSelectedTranslation] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const atlasRef = useRef<HTMLElement>(null);
  const scrollToAtlas = () =>
    atlasRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  const [mode, setMode] = useState<AtlasMetric>('listeningMinutes');
  const scope = getAtlasScope(analytics, selectedTranslation);
  const points = getAtlasPoints(scope, mode);
  const changeTranslation = (id: string | null) => {
    setSelectedTranslation(id);
    setSelectedCountry(null);
  };
  const coverage =
    analytics.userCountWithListening > 0
      ? (analytics.locatedListenerCount / analytics.userCountWithListening) * 100
      : null;
  const cards = [
    ['Listening minutes', analytics.listeningTotalMinutes, 'Across all translations'],
    ['Reading minutes', analytics.readingTotalMinutes, 'Time in Scripture'],
    [
      'Listeners',
      analytics.userCountWithListening,
      `${formatNumber(analytics.locatedListenerCount)} with map location`,
    ],
    ['Download units', analytics.totalDownloadUnits, 'Text packs and audio books'],
  ] as const;

  return (
    <>
      <section className="atlas-kpis" aria-label={`All-translation totals over ${windowDays} days`}>
        {cards.map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
            <small>
              {note} · {windowDays}d
            </small>
          </article>
        ))}
      </section>
      <div className="atlas-summary-strip">
        <span>
          <strong>{formatNumber(analytics.activeCountryCount)}</strong> countries with activity
        </span>
        <span>
          <strong>{formatNumber(analytics.activeLocationCount)}</strong> map locations
        </span>
        <span>
          <strong>{formatNumber(analytics.totalTrackedSessions)}</strong> tracked sessions
        </span>
        <span>
          <strong>{coverage === null ? '—' : `${formatNumber(coverage)}%`}</strong> listener
          location coverage
        </span>
      </div>

      <section ref={atlasRef} className="atlas-panel" aria-label="Activity atlas">
        <div className="atlas-panel-header">
          <div>
            <p className="eyebrow">Geography</p>
            <h3>Activity atlas</h3>
          </div>
          <div className="atlas-controls">
            <div className="atlas-toggle" role="group" aria-label="Activity metric">
              {ATLAS_METRICS.map((metric) => (
                <button
                  type="button"
                  key={metric.key}
                  aria-pressed={mode === metric.key}
                  onClick={() => setMode(metric.key)}
                >
                  {metric.label}
                </button>
              ))}
            </div>
            <label className="atlas-select-label">
              <span className="sr-only">Map translation</span>
              <select
                aria-label="Map translation"
                value={selectedTranslation ?? ''}
                onChange={(event) => changeTranslation(event.target.value || null)}
              >
                <option value="">All translations</option>
                {analytics.translationBreakdown.map((entry) => (
                  <option key={entry.translationId} value={entry.translationId}>
                    {entry.translationId.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {scope.translation && (
          <div className="atlas-filter-summary">
            <strong>{scope.translation.translationId.toUpperCase()}</strong>
            <span>{formatNumber(scope.translation.listeningMinutes)} listening min</span>
            <span>{formatNumber(scope.translation.readingMinutes)} reading min</span>
            <span>{formatNumber(scope.translation.downloadUnits)} download units</span>
            <span>{formatNumber(scope.translation.listenerCount)} listeners</span>
            <button
              type="button"
              className="atlas-text-button"
              onClick={() => changeTranslation(null)}
            >
              Clear translation
            </button>
          </div>
        )}
        <AnalyticsGlobe
          points={points}
          countries={scope.countries}
          mode={mode}
          selectedCountry={selectedCountry}
          onSelectCountry={setSelectedCountry}
        />
        <div className="atlas-source">
          Source: EveryBible analytics · Supabase reporting · last {windowDays} days.
          {analytics.retrievedAt
            ? ` Retrieved ${analytics.retrievedAt.replace('T', ' ').slice(0, 16)} UTC.`
            : ''}{' '}
          Geography filters apply to the atlas and country table. The totals above and daily trends
          cover all translations.
        </div>
      </section>

      <AnalyticsCollectionHealth health={analytics.collectionHealth} />
      <DailyTrendsPanel
        dailyListeningMinutes={analytics.dailyListeningMinutes}
        dailyReadingMinutes={analytics.dailyReadingMinutes}
        dailyDownloadUnits={analytics.dailyDownloadUnits}
      />
      <AnalyticsTables
        translations={analytics.translationBreakdown}
        countries={scope.countries}
        selectedTranslation={selectedTranslation}
        onSelectTranslation={(id) => {
          changeTranslation(id);
          scrollToAtlas();
        }}
        selectedCountry={selectedCountry}
        onSelectCountry={(code) => {
          setSelectedCountry(code);
          scrollToAtlas();
        }}
        windowDays={windowDays}
      />
      <p className="atlas-source">
        Average engagement: {formatNumber(analytics.averageEngagementScore)} · all-time score,
        outside the selected date range.{' '}
        {analytics.engagementScoreComputedAt
          ? `Computed ${new Date(analytics.engagementScoreComputedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC.`
          : 'Scores have not been computed yet.'}
      </p>
    </>
  );
}
