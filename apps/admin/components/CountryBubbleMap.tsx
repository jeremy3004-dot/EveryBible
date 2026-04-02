const POSITION_BY_COUNTRY: Record<string, { x: number; y: number }> = {
  AU: { x: 84, y: 76 },
  BR: { x: 34, y: 62 },
  CA: { x: 19, y: 22 },
  DE: { x: 53, y: 26 },
  ES: { x: 47, y: 31 },
  FR: { x: 49, y: 27 },
  GB: { x: 46, y: 20 },
  ID: { x: 77, y: 57 },
  IN: { x: 66, y: 43 },
  JP: { x: 84, y: 34 },
  KE: { x: 56, y: 57 },
  KR: { x: 81, y: 35 },
  MX: { x: 18, y: 40 },
  NP: { x: 68, y: 39 },
  NG: { x: 49, y: 50 },
  PH: { x: 82, y: 49 },
  RU: { x: 71, y: 18 },
  US: { x: 14, y: 30 },
  ZA: { x: 55, y: 78 },
};

interface CountryBubbleMapProps {
  metrics: Array<{ code: string; count: number; name: string }>;
}

export function CountryBubbleMap({ metrics }: CountryBubbleMapProps) {
  const topMetrics = metrics.slice(0, 12);
  const mappedMetrics = topMetrics.filter((metric) => POSITION_BY_COUNTRY[metric.code]);
  const overflowMetrics = topMetrics.filter((metric) => !POSITION_BY_COUNTRY[metric.code]);
  const maxCount = mappedMetrics.reduce((max, metric) => Math.max(max, metric.count), 1);

  return (
    <section className="map-card">
      <div className="map-card__stage" aria-label="Coarse country map">
        <div className="map-card__continent map-card__continent--americas">Americas</div>
        <div className="map-card__continent map-card__continent--europe">Europe</div>
        <div className="map-card__continent map-card__continent--africa">Africa</div>
        <div className="map-card__continent map-card__continent--asia">Asia</div>
        <div className="map-card__continent map-card__continent--oceania">Oceania</div>

        {mappedMetrics.map((metric) => {
          const position = POSITION_BY_COUNTRY[metric.code];
          const size = 14 + Math.round((metric.count / maxCount) * 30);

          return (
            <div
              key={metric.code}
              className="map-card__bubble"
              style={{
                height: `${size}px`,
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${size}px`,
              }}
              title={`${metric.name}: ${metric.count}`}
            >
              <span>{metric.code}</span>
            </div>
          );
        })}
      </div>

      {overflowMetrics.length > 0 ? (
        <div className="map-card__overflow">
          {overflowMetrics.map((metric) => (
            <span key={metric.code}>
              {metric.code} {metric.count}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
