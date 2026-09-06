'use client';

import {
  countRecords,
  formatCount,
  hasLocation,
  isApproximate,
  KIND_LABELS,
  scriptureStatus,
} from '@/lib/language-atlas/model';
import {
  SCRIPTURE_PRESENTATION,
  SCRIPTURE_VISUAL_ORDER,
  scriptureVisualCategory,
} from '@/lib/language-atlas/presentation';
import type {
  AtlasDisplayMode,
  AtlasFilters,
  AtlasIndex,
  AtlasProjection,
  AtlasRecord,
  AtlasScriptureFilter,
} from '@/lib/language-atlas/types';
import { SourceLink } from './RecordInspector';

export function MapControls({
  filters,
  index,
  counts,
  displayMode,
  projection,
  activeFilters,
  onChange,
  onDisplayMode,
  onProjection,
  onClear,
}: {
  filters: AtlasFilters;
  index: AtlasIndex;
  counts: ReturnType<typeof countRecords>;
  displayMode: AtlasDisplayMode;
  projection: AtlasProjection;
  activeFilters: boolean;
  onChange: (patch: Partial<AtlasFilters>) => void;
  onDisplayMode: (mode: AtlasDisplayMode) => void;
  onProjection: (projection: AtlasProjection) => void;
  onClear: () => void;
}) {
  return (
    <div className="la-panel-content">
      <p className="la-control-summary">
        {formatCount(counts.records)} matching source records · {formatCount(counts.mapped)} with a
        supported placement
      </p>
      <section className="la-control-section">
        <span className="la-control-kicker">Point display</span>
        <div className="la-segment la-segment--display" role="group" aria-label="Point display">
          <button
            type="button"
            aria-pressed={displayMode === 'spread'}
            onClick={() => onDisplayMode('spread')}
          >
            Spread dots
          </button>
          <button
            type="button"
            aria-pressed={displayMode === 'individual'}
            onClick={() => onDisplayMode('individual')}
          >
            Recorded locations
          </button>
          <button
            type="button"
            aria-pressed={displayMode === 'clustered'}
            onClick={() => onDisplayMode('clustered')}
          >
            Clusters
          </button>
        </div>
        <p className="la-mode-readout">
          {displayMode === 'spread'
            ? 'One point per mapped record. Overlaps separate only at regional zoom; global views keep their recorded geography.'
            : displayMode === 'individual'
              ? 'Recorded source locations. Co-located records may overlap.'
              : 'Recorded source locations grouped as you zoom out.'}
        </p>
        <p className="la-fine">Unresolved source identities may remain separate records.</p>
      </section>
      <section className="la-control-section">
        <span className="la-control-kicker">Projection</span>
        <div className="la-segment" role="group" aria-label="Map projection">
          <button
            type="button"
            aria-pressed={projection === 'globe'}
            onClick={() => onProjection('globe')}
          >
            Globe
          </button>
          <button
            type="button"
            aria-pressed={projection === 'mercator'}
            onClick={() => onProjection('mercator')}
          >
            Map
          </button>
        </div>
      </section>
      <section className="la-control-section">
        <span className="la-control-kicker">Scripture status</span>
        <div className="la-legend" aria-label="Scripture status legend">
          {SCRIPTURE_VISUAL_ORDER.map((category) => {
            const item = SCRIPTURE_PRESENTATION[category];
            const active = filters.scripture === category;
            return (
              <button
                type="button"
                key={category}
                aria-pressed={active}
                onClick={() =>
                  onChange({ scripture: (active ? 'all' : category) as AtlasScriptureFilter })
                }
              >
                <i className={`la-dot la-dot--${category}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <p className="la-fine">
          Red means No known Scripture, including unverified dialects. Exact status and evidence
          remain visible in the profile.
        </p>
      </section>
      <details className="la-filter-details">
        <summary>
          <span>Country, placement & source filters</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="la-filter-stack" aria-label="Filter language records">
          <label>
            <span>Country association</span>
            <select
              value={filters.country}
              onChange={(event) => onChange({ country: event.target.value })}
            >
              <option value="">All countries</option>
              {index.countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Placement</span>
            <select
              value={filters.placement}
              onChange={(event) =>
                onChange({ placement: event.target.value as AtlasFilters['placement'] })
              }
            >
              <option value="all">All records</option>
              <option value="mapped">Mapped</option>
              <option value="approximate">Approximate only</option>
              <option value="unmapped">Unmapped</option>
            </select>
          </label>
          <label>
            <span>Source collection</span>
            <select
              value={filters.source}
              onChange={(event) => onChange({ source: event.target.value })}
            >
              <option value="">All sources</option>
              {index.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      {filters.country && (
        <p className="la-country-note">
          Country filters follow source associations. A reference point may sit in another
          associated country.
        </p>
      )}
      {filters.kind === 'people-group' && (
        <p className="la-country-note">
          Scripture colors describe primary-language context, not verified coverage of every
          community variety.
        </p>
      )}
      <button
        className="la-secondary-button"
        type="button"
        disabled={!activeFilters}
        onClick={onClear}
      >
        Clear filters
      </button>
    </div>
  );
}

export function RecordsPanel({
  filtered,
  countries,
  currentPage,
  pageCount,
  selectedId,
  queryPending,
  exportNotice,
  onPage,
  onSelect,
  onExport,
  onClear,
}: {
  filtered: AtlasRecord[];
  countries: Map<string, string>;
  currentPage: number;
  pageCount: number;
  selectedId: string | null;
  queryPending: boolean;
  exportNotice: string;
  onPage: (page: number) => void;
  onSelect: (id: string) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const first = filtered.length ? currentPage * 30 + 1 : 0;
  const last = Math.min((currentPage + 1) * 30, filtered.length);
  return (
    <div className="la-panel-content la-records-panel">
      <div className="la-panel-heading la-records-heading">
        <div>
          <span className="eyebrow">Searchable collection</span>
          <h2>
            Records <span>{formatCount(filtered.length)}</span>
          </h2>
          <p>
            {first}–{last} of {formatCount(filtered.length)}
          </p>
        </div>
        <button
          className="la-icon-button"
          type="button"
          disabled={!filtered.length || queryPending}
          onClick={onExport}
          aria-label="Export filtered records as CSV"
        >
          ↓
        </button>
      </div>
      {exportNotice && (
        <p className="la-export-notice" role="status">
          {exportNotice}
        </p>
      )}
      <div className="la-result-list" aria-busy={queryPending}>
        {filtered.slice(currentPage * 30, (currentPage + 1) * 30).map((record) => {
          const category = scriptureVisualCategory(scriptureStatus(record), record.kind);
          return (
            <button
              className="la-result"
              type="button"
              key={record.id}
              aria-pressed={selectedId === record.id}
              onClick={() => onSelect(record.id)}
            >
              <i className={`la-dot la-dot--${category}`} />
              <span className="la-result-name">
                <strong>{record.name}</strong>
                <small>
                  {KIND_LABELS[record.kind]} ·{' '}
                  {record.iso6393 ?? record.rolvCode ?? record.glottocode ?? record.id}
                </small>
              </span>
              <span className="la-result-location">
                {record.countryCodes
                  .slice(0, 2)
                  .map((code) => countries.get(code) ?? code)
                  .join(', ') || 'Unspecified'}
                <small>
                  {!hasLocation(record)
                    ? 'Unmapped'
                    : isApproximate(record)
                      ? 'Approximate'
                      : SCRIPTURE_PRESENTATION[category].label}
                </small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="la-empty">
          <h3>No matching records</h3>
          <p>Try an alternate name or broaden the filters.</p>
          <button type="button" onClick={onClear}>
            Show all records
          </button>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="la-pagination">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => onPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {formatCount(pageCount)}
          </span>
          <button
            type="button"
            disabled={currentPage + 1 === pageCount}
            onClick={() => onPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function CollectionPanel({ index }: { index: AtlasIndex }) {
  return (
    <div className="la-panel-content">
      <div className="la-panel-heading">
        <span className="eyebrow">Provenance & perspective</span>
        <h2>The collection</h2>
        <p>
          Prepared {index.generatedAt.slice(0, 10)} · {formatCount(index.counts.records)} source
          records
        </p>
      </div>
      <div className="la-collection-counts" aria-label="Collection coverage">
        <div>
          <strong>{formatCount(index.counts.languages)}</strong>
          <span>Languages</span>
        </div>
        <div>
          <strong>{formatCount(index.counts.dialects)}</strong>
          <span>Dialects</span>
        </div>
        <div>
          <strong>{formatCount(index.counts.peopleGroups)}</strong>
          <span>People groups</span>
        </div>
        <div>
          <strong>{formatCount(index.counts.mapped)}</strong>
          <span>Mapped</span>
        </div>
      </div>
      <div className="la-collection-notes">
        {index.notes.map((note, item) => (
          <p key={item}>{note}</p>
        ))}
      </div>
      <div className="la-source-list">
        {index.sources.map((source) => (
          <article key={source.id}>
            <h3>
              <SourceLink url={source.url}>{source.name}</SourceLink>
            </h3>
            <p>
              {formatCount(source.recordCount)} records · Retrieved{' '}
              {source.retrievedAt.slice(0, 10)}
            </p>
            <p>{source.note}</p>
            <details>
              <summary>Release, rights & attribution</summary>
              <p>{source.version}</p>
              <p>{source.license}</p>
              <p>{source.attribution}</p>
            </details>
          </article>
        ))}
      </div>
      <p className="la-fine">
        <SourceLink url="https://joshuaproject.net">Data provided by Joshua Project</SourceLink>.
        Read each source’s terms before redistributing its records.
      </p>
    </div>
  );
}
