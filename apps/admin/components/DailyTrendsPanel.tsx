'use client';

import { useMemo, useState } from 'react';
import {
  ATLAS_METRICS,
  buildDailySeries,
  downloadCsv,
  formatNumber,
  metricLabel,
  type AtlasMetric,
} from '@/lib/analytics-atlas';

type DailyTrendsPanelProps = {
  dailyListeningMinutes: { day: string; minutes: number }[];
  dailyReadingMinutes: { day: string; minutes: number }[];
  dailyDownloadUnits: { day: string; value: number }[];
};
const formatDay = (day: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`)
  );

export function DailyTrendsPanel({
  dailyListeningMinutes,
  dailyReadingMinutes,
  dailyDownloadUnits,
}: DailyTrendsPanelProps) {
  const [mode, setMode] = useState<AtlasMetric>('listeningMinutes');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const rows = useMemo(
    () => buildDailySeries(dailyListeningMinutes, dailyReadingMinutes, dailyDownloadUnits),
    [dailyListeningMinutes, dailyReadingMinutes, dailyDownloadUnits]
  );
  const maximum = Math.max(1, ...rows.map((row) => row[mode]));
  const index = Math.min(
    selectedIndex ?? Math.max(0, rows.length - 1),
    Math.max(0, rows.length - 1)
  );
  const selected = rows[index];
  const chartWidth = 960;
  const chartHeight = 180;
  const barWidth = chartWidth / Math.max(1, rows.length);
  return (
    <section className="atlas-panel atlas-trends">
      <div className="atlas-panel-header">
        <div>
          <p className="eyebrow">All translations</p>
          <h3>Daily activity</h3>
        </div>
        <div className="atlas-toggle" role="group" aria-label="Daily activity metric">
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
      </div>
      {rows.length ? (
        <>
          <div className="atlas-trend-summary">
            <div>
              <span>{selected ? formatDay(selected.day) : ''} · UTC</span>
              <strong aria-live="polite">
                {formatNumber(selected?.[mode] ?? 0)} <small>{metricLabel(mode)}</small>
              </strong>
            </div>
            <p>
              Daily peak <strong>{formatNumber(Math.max(...rows.map((row) => row[mode])))}</strong>
              <br />
              {rows.filter((row) => row[mode] > 0).length} days with activity
            </p>
          </div>
          <div className="atlas-chart">
            <div className="atlas-chart-y">
              <span>{formatNumber(maximum)}</span>
              <span>{formatNumber(maximum / 2)}</span>
              <span>0</span>
            </div>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Daily ${metricLabel(mode)} from ${rows[0].day} through ${rows[rows.length - 1].day}`}
            >
              {[0, 0.5, 1].map((value) => (
                <line
                  key={value}
                  x1="0"
                  x2={chartWidth}
                  y1={value * (chartHeight - 2)}
                  y2={value * (chartHeight - 2)}
                  className="atlas-chart-grid"
                />
              ))}
              {rows.map((row, rowIndex) => (
                <rect
                  key={row.day}
                  x={rowIndex * barWidth}
                  y={chartHeight - (row[mode] / maximum) * (chartHeight - 4)}
                  width={Math.max(1, barWidth - 1.5)}
                  height={(row[mode] / maximum) * (chartHeight - 4)}
                  rx="1"
                  className={rowIndex === index ? 'atlas-chart-bar is-selected' : 'atlas-chart-bar'}
                  onMouseEnter={() => setSelectedIndex(rowIndex)}
                >
                  <title>{`${row.day}: ${formatNumber(row[mode])} ${metricLabel(mode)}`}</title>
                </rect>
              ))}
            </svg>
          </div>
          <div className="atlas-chart-dates">
            <span>{formatDay(rows[0].day)}</span>
            <span>{formatDay(rows[Math.floor((rows.length - 1) / 2)].day)}</span>
            <span>{formatDay(rows[rows.length - 1].day)}</span>
          </div>
          <label className="atlas-date-scrubber">
            <span>Inspect day</span>
            <input
              type="range"
              aria-label="Inspect activity date"
              aria-valuetext={
                selected
                  ? `${selected.day}: ${formatNumber(selected[mode])} ${metricLabel(mode)}`
                  : undefined
              }
              min="0"
              max={Math.max(0, rows.length - 1)}
              value={index}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
            />
          </label>
          <details className="atlas-daily-table">
            <summary>View daily values</summary>
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadCsv('everybible-daily-activity.csv', [
                  ['Date (UTC)', 'Listening min', 'Reading min', 'Download units'],
                  ...rows.map((row) => [
                    row.day,
                    row.listeningMinutes,
                    row.readingMinutes,
                    row.downloadUnits,
                  ]),
                ])
              }
            >
              Export daily CSV
            </button>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th>Listening min</th>
                    <th>Reading min</th>
                    <th>Download units</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{formatNumber(row.listeningMinutes)}</td>
                      <td>{formatNumber(row.readingMinutes)}</td>
                      <td>{formatNumber(row.downloadUnits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="atlas-empty">No daily activity reported in this period.</p>
      )}
      <div className="atlas-source">
        Source: EveryBible daily reporting · UTC calendar days · all translations. Missing days
        within the reported series are shown as zero; today may be incomplete.
      </div>
    </section>
  );
}
