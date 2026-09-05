// Loading state for the analytics route. get_admin_analytics_overview scans the
// analytics_events table live, so the first paint can take a moment; this shows
// a lightweight skeleton instead of a blank screen.
export default function AnalyticsLoading() {
  return (
    <div className="analytics-page" aria-busy="true">
      <div className="analytics-page__header">
        <div>
          <p className="eyebrow">Usage analytics</p>
          <h2>Global reach</h2>
          <p className="analytics-page__note">Loading live map, listening totals, and engagement&hellip;</p>
        </div>
      </div>

      <section className="card">
        <div className="skeleton skeleton--map" />
      </section>

      <section className="metric-grid analytics-page__metrics">
        {Array.from({ length: 6 }).map((_, index) => (
          <article className="metric-card" key={index}>
            <span className="skeleton skeleton--line" />
            <strong className="skeleton skeleton--value" />
          </article>
        ))}
      </section>
    </div>
  );
}
