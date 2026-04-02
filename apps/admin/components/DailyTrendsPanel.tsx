'use client';

import { useId, useState } from 'react';

type DailyListeningPoint = {
  day: string;
  minutes: number;
};

type DailyDownloadPoint = {
  day: string;
  value: number;
};

type DailyTrendsPanelProps = {
  dailyListeningMinutes: DailyListeningPoint[];
  dailyDownloadUnits: DailyDownloadPoint[];
};

type TrendMode = 'listening' | 'downloads';

function formatSummaryValue(value: number, suffix: string) {
  return `${value.toLocaleString('en-US')} ${suffix}`;
}

export function DailyTrendsPanel({
  dailyListeningMinutes,
  dailyDownloadUnits,
}: DailyTrendsPanelProps) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<TrendMode>('listening');

  const maxValue =
    mode === 'listening'
      ? dailyListeningMinutes.reduce((max, point) => Math.max(max, point.minutes), 1)
      : dailyDownloadUnits.reduce((max, point) => Math.max(max, point.value), 1);
  const listeningTotal = dailyListeningMinutes.reduce((sum, point) => sum + point.minutes, 0);
  const downloadTotal = dailyDownloadUnits.reduce((sum, point) => sum + point.value, 0);
  const title = mode === 'listening' ? 'Daily listening minutes' : 'Daily download units';
  const summaryValue =
    mode === 'listening'
      ? formatSummaryValue(listeningTotal, 'minutes')
      : formatSummaryValue(downloadTotal, 'units');

  return (
    <section className="card daily-trends">
      <button
        type="button"
        className="daily-trends__summary"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="daily-trends__summary-copy">
          <p className="eyebrow">Daily activity</p>
          <h3>Open daily listening data</h3>
          <p>Keep the 30-day trend collapsed until you need the detail.</p>
        </div>

        <div className="daily-trends__summary-meta">
          <span>{summaryValue}</span>
          <span className={`daily-trends__chevron ${isOpen ? 'daily-trends__chevron--open' : ''}`} />
        </div>
      </button>

      {isOpen ? (
        <div className="daily-trends__body" id={panelId}>
          <div className="segmented-control daily-trends__switch" role="tablist" aria-label="Daily metric">
            <button
              type="button"
              className={`segmented-control__button ${
                mode === 'listening' ? 'segmented-control__button--active' : ''
              }`}
              onClick={() => setMode('listening')}
            >
              Listening
            </button>
            <button
              type="button"
              className={`segmented-control__button ${
                mode === 'downloads' ? 'segmented-control__button--active' : ''
              }`}
              onClick={() => setMode('downloads')}
            >
              Downloads
            </button>
          </div>

          <div className="daily-trends__headline">
            <p className="eyebrow">Trend</p>
            <h4>{title}</h4>
          </div>

          <div className="bar-chart daily-trends__chart" aria-label={title}>
            {mode === 'listening'
              ? dailyListeningMinutes.map((point) => (
                  <div key={point.day} className="bar-chart__row daily-trends__row">
                    <span>{point.day.slice(5)}</span>
                    <div className="bar-chart__track">
                      <div
                        className="bar-chart__fill"
                        style={{ width: `${(point.minutes / maxValue) * 100}%` }}
                      />
                    </div>
                    <strong>{point.minutes.toFixed(1)}</strong>
                  </div>
                ))
              : dailyDownloadUnits.map((point) => (
                  <div key={point.day} className="bar-chart__row daily-trends__row">
                    <span>{point.day.slice(5)}</span>
                    <div className="bar-chart__track">
                      <div
                        className="bar-chart__fill bar-chart__fill--secondary"
                        style={{ width: `${(point.value / maxValue) * 100}%` }}
                      />
                    </div>
                    <strong>{point.value}</strong>
                  </div>
                ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
