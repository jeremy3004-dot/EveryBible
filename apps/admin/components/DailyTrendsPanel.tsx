'use client';

type DailyListeningPoint = { day: string; minutes: number };
type DailyDownloadPoint  = { day: string; value: number };
type DailyReadingPoint   = { day: string; minutes: number };

type DailyTrendsPanelProps = {
  dailyListeningMinutes: DailyListeningPoint[];
  dailyReadingMinutes:   DailyReadingPoint[];
  dailyDownloadUnits:    DailyDownloadPoint[];
};

function Sparkline({ values, color, gradId }: { values: number[]; color: string; gradId: string }) {
  const W = 100, H = 40;
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} />;

  const max = Math.max(...values, 0.001);
  const coords = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - (v / max) * (H - 4) - 2,
  }));

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function DailyTrendsPanel({
  dailyListeningMinutes,
  dailyReadingMinutes,
  dailyDownloadUnits,
}: DailyTrendsPanelProps) {
  const listeningTotal = dailyListeningMinutes.reduce((s, p) => s + p.minutes, 0);
  const readingTotal   = dailyReadingMinutes.reduce((s, p) => s + p.minutes, 0);
  const downloadTotal  = dailyDownloadUnits.reduce((s, p) => s + p.value, 0);

  return (
    <section className="card daily-trends">
      <p className="eyebrow">Daily activity</p>
      <div className="trend-spark-row">

        <div className="trend-spark">
          <span className="trend-spark__label">Listening minutes</span>
          <strong className="trend-spark__val">{fmt(listeningTotal)}</strong>
          <Sparkline
            values={dailyListeningMinutes.map((p) => p.minutes)}
            color="#C0392B"
            gradId="spark-listening"
          />
        </div>

        <div className="trend-spark trend-spark--divider">
          <span className="trend-spark__label">Reading minutes</span>
          <strong className="trend-spark__val">{fmt(readingTotal)}</strong>
          <Sparkline
            values={dailyReadingMinutes.map((p) => p.minutes)}
            color="#4caf7d"
            gradId="spark-reading"
          />
        </div>

        <div className="trend-spark trend-spark--divider">
          <span className="trend-spark__label">Downloads</span>
          <strong className="trend-spark__val">{fmt(downloadTotal)}</strong>
          <Sparkline
            values={dailyDownloadUnits.map((p) => p.value)}
            color="#38b2ac"
            gradId="spark-downloads"
          />
        </div>

      </div>
    </section>
  );
}
