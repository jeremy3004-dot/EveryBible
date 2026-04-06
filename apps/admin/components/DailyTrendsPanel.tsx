'use client';

type DailyListeningPoint = {
  day: string;
  minutes: number;
};

type DailyDownloadPoint = {
  day: string;
  value: number;
};

type DailyReadingPoint = {
  day: string;
  minutes: number;
};

type DailyTrendsPanelProps = {
  dailyListeningMinutes: DailyListeningPoint[];
  dailyReadingMinutes: DailyReadingPoint[];
  dailyDownloadUnits: DailyDownloadPoint[];
};

function formatSummaryValue(value: number, suffix: string) {
  return `${value.toLocaleString('en-US')} ${suffix}`;
}

type TrendChartProps<T extends { day: string }> = {
  fillClassName?: string;
  getValue: (point: T) => number;
  points: T[];
  title: string;
  renderValue: (point: T) => string;
};

function TrendChart<T extends { day: string }>({
  fillClassName,
  getValue,
  points,
  title,
  renderValue,
}: TrendChartProps<T>) {
  const maxValue = points.reduce((max, point) => Math.max(max, getValue(point)), 1);

  return (
    <div className="daily-trends__chart-block">
      <div className="daily-trends__headline">
        <p className="eyebrow">Trend</p>
        <h4>{title}</h4>
      </div>

      <div className="bar-chart daily-trends__chart" aria-label={title}>
        {points.map((point) => {
          const value = getValue(point);

          return (
            <div key={point.day} className="bar-chart__row daily-trends__row">
              <span>{point.day.slice(5)}</span>
              <div className="bar-chart__track">
                <div
                  className={`bar-chart__fill ${fillClassName ?? ''}`.trim()}
                  style={{ width: `${(value / maxValue) * 100}%` }}
                />
              </div>
              <strong>{renderValue(point)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DailyTrendsPanel({
  dailyListeningMinutes,
  dailyReadingMinutes,
  dailyDownloadUnits,
}: DailyTrendsPanelProps) {
  const listeningTotal = dailyListeningMinutes.reduce((sum, point) => sum + point.minutes, 0);
  const readingTotal = dailyReadingMinutes.reduce((sum, point) => sum + point.minutes, 0);
  const downloadTotal = dailyDownloadUnits.reduce((sum, point) => sum + point.value, 0);

  return (
    <section className="card daily-trends">
      <div className="daily-trends__summary">
        <div className="daily-trends__summary-copy">
          <p className="eyebrow">Daily activity</p>
          <h3>Daily engagement trends</h3>
          <p>Thirty days of listening, reading, and download activity.</p>
        </div>

        <div className="daily-trends__summary-meta">
          <span>Listening {formatSummaryValue(listeningTotal, 'minutes')}</span>
          <span>Reading {formatSummaryValue(readingTotal, 'minutes')}</span>
          <span>Downloads {formatSummaryValue(downloadTotal, 'units')}</span>
        </div>
      </div>

      <div className="daily-trends__body">
        <TrendChart
          title="Daily listening minutes"
          points={dailyListeningMinutes}
          getValue={(point) => point.minutes}
          renderValue={(point) => point.minutes.toFixed(1)}
        />
        <TrendChart
          title="Daily reading minutes"
          points={dailyReadingMinutes}
          getValue={(point) => point.minutes}
          renderValue={(point) => point.minutes.toFixed(1)}
          fillClassName="bar-chart__fill--tertiary"
        />
        <TrendChart
          title="Daily download units"
          points={dailyDownloadUnits}
          getValue={(point) => point.value}
          renderValue={(point) => `${point.value}`}
          fillClassName="bar-chart__fill--secondary"
        />
      </div>
    </section>
  );
}
