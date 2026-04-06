'use client';

import type React from 'react';

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

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type CalPoint = { day: string; value: number };

function MonthCalendar({
  title,
  points,
  renderCell,
  accentClass,
}: {
  title: string;
  points: CalPoint[];
  renderCell: (v: number) => string;
  accentClass?: string;
}) {
  const valueMap = new Map(points.map((p) => [p.day, p.value]));
  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const monthKeys = [...new Set(points.map((p) => p.day.slice(0, 7)))].sort();

  return (
    <div className="cal-panel">
      <p className="eyebrow">Trend</p>
      <h4 className="cal-panel__title">{title}</h4>

      {monthKeys.map((monthKey) => {
        const year = Number(monthKey.slice(0, 4));
        const month = Number(monthKey.slice(5, 7));
        const daysInMonth = new Date(year, month, 0).getDate();
        const startOffset = new Date(year, month - 1, 1).getDay();

        return (
          <div key={monthKey} className="cal-panel__month">
            <p className="cal-panel__month-label">
              {MONTH_NAMES[month - 1]} {year}
            </p>
            <div className="cal-panel__grid" aria-label={`${MONTH_NAMES[month - 1]} ${year}`}>
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={`wd-${i}`} className="cal-panel__weekday">
                  {label}
                </span>
              ))}
              {Array.from({ length: startOffset }, (_, i) => (
                <div key={`gap-${i}`} className="cal-cell cal-cell--gap" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const dayStr = `${monthKey}-${String(dayNum).padStart(2, '0')}`;
                const value = valueMap.get(dayStr);
                const hasData = value !== undefined;
                const isLit = hasData && value > 0;
                const intensity = isLit ? value / maxValue : 0;

                let cellClass = 'cal-cell';
                if (!hasData) cellClass += ' cal-cell--dim';
                else if (isLit) cellClass += ` cal-cell--lit${accentClass ? ` ${accentClass}` : ''}`;

                return (
                  <div
                    key={dayNum}
                    className={cellClass}
                    style={isLit ? ({ '--cal-intensity': intensity } as React.CSSProperties) : undefined}
                    title={isLit ? `${dayStr}: ${renderCell(value!)}` : undefined}
                  >
                    <span className="cal-cell__num">{dayNum}</span>
                    {isLit && <span className="cal-cell__val">{renderCell(value!)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DailyTrendsPanel({
  dailyListeningMinutes,
  dailyReadingMinutes,
  dailyDownloadUnits,
}: DailyTrendsPanelProps) {
  const listeningTotal = dailyListeningMinutes.reduce((sum, p) => sum + p.minutes, 0);
  const readingTotal = dailyReadingMinutes.reduce((sum, p) => sum + p.minutes, 0);
  const downloadTotal = dailyDownloadUnits.reduce((sum, p) => sum + p.value, 0);

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
        <MonthCalendar
          title="Daily listening minutes"
          points={dailyListeningMinutes.map((p) => ({ day: p.day, value: p.minutes }))}
          renderCell={(v) => v.toFixed(1)}
        />
        <MonthCalendar
          title="Daily reading minutes"
          points={dailyReadingMinutes.map((p) => ({ day: p.day, value: p.minutes }))}
          renderCell={(v) => v.toFixed(1)}
          accentClass="cal-cell--green"
        />
        <MonthCalendar
          title="Daily download units"
          points={dailyDownloadUnits.map((p) => ({ day: p.day, value: p.value }))}
          renderCell={(v) => String(v)}
          accentClass="cal-cell--teal"
        />
      </div>
    </section>
  );
}
