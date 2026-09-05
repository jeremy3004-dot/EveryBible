import type { AnalyticsCollectionHealth as CollectionHealth } from '@/lib/admin-data';
import { formatNumber } from '@/lib/analytics-atlas';

const utc = (value: string | null) =>
  value ? `${value.replace('T', ' ').slice(0, 16)} UTC` : 'No events received';

export function AnalyticsCollectionHealth({ health }: { health?: CollectionHealth }) {
  if (!health)
    return (
      <p className="atlas-source">
        Collection diagnostics are unavailable until the reporting update is installed.
      </p>
    );
  const coverage = health.eventCount
    ? (100 * health.coordinateEventCount) / health.eventCount
    : null;
  return (
    <details className="atlas-panel atlas-collection-health">
      <summary>
        <strong>Collection health</strong>
        <span>
          {formatNumber(health.eventCount)} events ·{' '}
          {coverage === null
            ? 'No location data yet'
            : `${formatNumber(coverage)}% with approximate location`}
        </span>
      </summary>
      <div className="atlas-source">
        Latest event: {utc(health.latestEventAt)}. Latest delivery: {utc(health.latestReceivedAt)}.{' '}
        Offline events can arrive later. A quiet period alone does not mean collection is broken.
      </div>
      <div className="atlas-summary-strip">
        <span>
          <strong>{formatNumber(health.countryEventCount)}</strong> with country
        </span>
        <span>
          <strong>{formatNumber(health.coordinateEventCount)}</strong> with approximate coordinates
        </span>
        <span>
          <strong>{formatNumber(health.eventCount - health.coordinateEventCount)}</strong> without
          coordinates
        </span>
      </div>
      <div className="atlas-table-scroll">
        <table className="atlas-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Received events</th>
              <th>Latest activity (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {health.eventCounts.map((event) => (
              <tr key={event.eventName}>
                <td>{event.eventName.replaceAll('_', ' ')}</td>
                <td>{formatNumber(event.count)}</td>
                <td>{utc(event.latestEventAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="atlas-source">
        Location comes from the network IP, never device GPS. Coordinates are grouped to 0.1°.
        Missing locations remain in usage totals. Listener identities count signed-in accounts or
        anonymous sessions, so they are not a count of unique people.
      </p>
    </details>
  );
}
