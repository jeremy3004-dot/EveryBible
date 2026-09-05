'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  countRecords,
  DEFAULT_FILTERS,
  exportCsv,
  filterRecords,
  formatCount,
  hasLocation,
  isApproximate,
  KIND_LABELS,
  SCRIPTURE_LABELS,
  scriptureStatus,
} from '@/lib/language-atlas/model';
import type { AtlasFilters, AtlasIndex, ScriptureStatus } from '@/lib/language-atlas/types';
import { LanguageMap } from './LanguageMap';
import { RecordInspector, SourceLink } from './RecordInspector';

export function LanguageAtlas() {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch('/api/language-atlas', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? 'Your session has expired. Sign in again to open the atlas.'
              : 'The language collection could not load. Please try again.'
          );
        return (await response.json()) as AtlasIndex;
      })
      .then((data) => {
        if (active) setIndex(data);
      })
      .catch((cause: Error) => {
        if (active && cause.name !== 'AbortError') setError(cause.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);
  if (!index)
    return (
      <div className="language-atlas la-loading">
        <p className="eyebrow">EveryBible · Language atlas</p>
        <h1>A world of words.</h1>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRetry((value) => value + 1);
              }}
            >
              Retry collection
            </button>
          </div>
        ) : (
          <p role="status">Gathering languages, varieties and their sources…</p>
        )}
      </div>
    );
  return <LanguageAtlasContent index={index} />;
}

// Kept separate from transport so the complete atlas can also be previewed with a source snapshot.
export function LanguageAtlasContent({ index }: { index: AtlasIndex }) {
  const [filters, setFilters] = useState<AtlasFilters>(DEFAULT_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [exportNotice, setExportNotice] = useState('');
  const records = useMemo(
    () => [...index.records].sort((left, right) => left.name.localeCompare(right.name)),
    [index.records]
  );
  const byId = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const countries = useMemo(
    () => new Map(index.countries.map((country) => [country.code, country.name])),
    [index.countries]
  );
  const filtered = useMemo(
    () =>
      filterRecords(records, {
        query: deferredQuery,
        kind: filters.kind,
        country: filters.country,
        scripture: filters.scripture,
        placement: filters.placement,
        source: filters.source,
      }),
    [
      records,
      deferredQuery,
      filters.kind,
      filters.country,
      filters.scripture,
      filters.placement,
      filters.source,
    ]
  );
  const counts = useMemo(() => countRecords(filtered), [filtered]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const change = (patch: Partial<AtlasFilters>) => {
    setFilters((value) => ({ ...value, ...patch }));
    setPage(0);
    setExportNotice('');
  };
  const select = (id: string) => {
    if (!byId.has(id)) {
      setSelectionError(
        'This related record is not included in the current source collection. Its source link may have more detail.'
      );
      return;
    }
    setSelectedId(id);
    setSelectionError(null);
    if (window.matchMedia('(max-width: 1100px)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('language-profile')?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      );
    }
  };
  const activeFilters =
    filters.query ||
    filters.country ||
    filters.scripture !== 'all' ||
    filters.placement !== 'all' ||
    filters.source;
  const kindOptions: { value: AtlasFilters['kind']; label: string; count: number }[] = [
    { value: 'all', label: 'All records', count: index.counts.records },
    { value: 'language', label: 'Languages', count: index.counts.languages },
    { value: 'dialect', label: 'Dialects', count: index.counts.dialects },
    { value: 'people-group', label: 'People groups', count: index.counts.peopleGroups },
  ];

  return (
    <div className="language-atlas">
      <header className="la-header">
        <div>
          <p className="eyebrow">Insights / Language atlas</p>
          <h1>
            A world of words<span>.</span>
          </h1>
          <p>Explore languages, local varieties and the communities who speak them.</p>
        </div>
        <a className="la-source-jump" href="#atlas-sources">
          About the collection <span aria-hidden="true">↗</span>
        </a>
      </header>
      <div className="la-overview" aria-label="Source collection coverage">
        <div>
          <strong>{formatCount(index.counts.languages)}</strong>
          <span>Language records</span>
        </div>
        <div>
          <strong>{formatCount(index.counts.dialects)}</strong>
          <span>Dialect records</span>
        </div>
        <div>
          <strong>{formatCount(index.counts.peopleGroups)}</strong>
          <span>People group records</span>
        </div>
        <div className="la-overview-coverage">
          <strong>
            {formatCount(index.counts.mapped)} <small>mapped records</small>
          </strong>
          <span>
            {formatCount(index.counts.approximate)} approximate ·{' '}
            {formatCount(index.counts.unmapped)} unmapped
          </span>
        </div>
      </div>
      <div className="la-collection-note">
        <span>One collection. Distinct perspectives.</span>
        <p>
          Counts describe source records, not unique living languages. Approximate locations are
          included in mapped records.
        </p>
      </div>
      <section className="la-controls" aria-label="Search and filter language records">
        <div className="la-kind-tabs" role="group" aria-label="Record kind">
          {kindOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={filters.kind === option.value}
              onClick={() => change({ kind: option.value })}
            >
              {option.label}
              <span>{formatCount(option.count)}</span>
            </button>
          ))}
        </div>
        <div className="la-search-row">
          <label className="la-search-label">
            <span className="la-search-icon" aria-hidden="true">
              ⌕
            </span>
            <span className="la-sr-only">Search language names, aliases or identifiers</span>
            <input
              type="search"
              value={filters.query}
              onChange={(event) => change({ query: event.target.value })}
              placeholder="Search a name, ISO, ROLV or Glottocode…"
            />
          </label>
          <button
            className="la-export"
            type="button"
            disabled={!filtered.length || filters.query !== deferredQuery}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(['\uFEFF', exportCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = 'everybible-language-atlas.csv';
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setExportNotice(`Exported ${formatCount(filtered.length)} filtered records.`);
            }}
          >
            Export CSV <span aria-hidden="true">↓</span>
          </button>
        </div>
        <div className="la-filter-row">
          <label>
            <span>Country association</span>
            <select
              value={filters.country}
              onChange={(event) => change({ country: event.target.value })}
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
            <span>Scripture status</span>
            <select
              value={filters.scripture}
              onChange={(event) =>
                change({ scripture: event.target.value as AtlasFilters['scripture'] })
              }
            >
              <option value="all">All statuses</option>
              {(Object.keys(SCRIPTURE_LABELS) as ScriptureStatus[]).map((status) => (
                <option key={status} value={status}>
                  {SCRIPTURE_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Placement</span>
            <select
              value={filters.placement}
              onChange={(event) =>
                change({ placement: event.target.value as AtlasFilters['placement'] })
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
              onChange={(event) => change({ source: event.target.value })}
            >
              <option value="">All sources</option>
              {index.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="la-text-button la-clear"
            type="button"
            disabled={!activeFilters}
            onClick={() => {
              setFilters({ ...DEFAULT_FILTERS, kind: filters.kind });
              setPage(0);
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="la-filter-summary">
          <p aria-live="polite">
            <strong>{formatCount(counts.records)}</strong> matching records{' '}
            <span>
              · {formatCount(counts.mapped)} mapped · {formatCount(counts.unmapped)} unmapped
            </span>
          </p>
          <a href="#atlas-results">
            Browse results <span aria-hidden="true">↓</span>
          </a>
        </div>
        {filters.country && (
          <p className="la-country-note">
            Country filters follow source associations. A record’s reference point may sit in
            another associated country.
          </p>
        )}
        {filters.kind === 'people-group' && (
          <p className="la-country-note">
            Scripture colors describe primary-language context, not verified coverage of every
            community variety.
          </p>
        )}
        {exportNotice && (
          <p className="la-fine" role="status">
            {exportNotice}
          </p>
        )}
      </section>
      {selectionError && (
        <p className="la-selection-note" role="status">
          {selectionError}
        </p>
      )}
      <div className="la-workspace">
        <div className="la-explore-column">
          <LanguageMap records={filtered} selected={selected} onSelect={select} />
          <section className="la-results" id="atlas-results" aria-labelledby="atlas-results-title">
            <div className="la-section-heading">
              <div>
                <span className="eyebrow">The collection</span>
                <h2 id="atlas-results-title">
                  Explore the records{' '}
                  <span className="la-count">{formatCount(filtered.length)}</span>
                </h2>
              </div>
              <span className="la-fine">
                {filtered.length
                  ? `${currentPage * 30 + 1}–${Math.min((currentPage + 1) * 30, filtered.length)}`
                  : '0'}{' '}
                of {formatCount(filtered.length)}
              </span>
            </div>
            <div className="la-result-head" aria-hidden="true">
              <span>Name / identifier</span>
              <span>Scripture coverage</span>
              <span>Location</span>
            </div>
            <div className="la-result-list">
              {filtered.slice(currentPage * 30, (currentPage + 1) * 30).map((record) => (
                <button
                  className="la-result"
                  type="button"
                  key={record.id}
                  aria-pressed={selectedId === record.id}
                  aria-controls="language-profile"
                  onClick={() => select(record.id)}
                >
                  <span className="la-result-name">
                    <strong>{record.name}</strong>
                    <small>
                      {KIND_LABELS[record.kind]} ·{' '}
                      <span className="la-mono">
                        {record.iso6393 ?? record.rolvCode ?? record.glottocode ?? record.id}
                      </span>
                    </small>
                  </span>
                  <span className="la-result-status">
                    <i className={`la-dot la-dot--${scriptureStatus(record)}`} />
                    <span>
                      {SCRIPTURE_LABELS[scriptureStatus(record)]}
                      {record.kind === 'people-group' && <small>Primary language</small>}
                    </span>
                  </span>
                  <span className="la-result-location">
                    <span>
                      {record.countryCodes
                        .slice(0, 3)
                        .map((code) => countries.get(code) ?? code)
                        .join(', ') || 'Unspecified'}
                      {record.countryCodes.length > 3 ? ` +${record.countryCodes.length - 3}` : ''}
                    </span>
                    <small>
                      {!hasLocation(record)
                        ? 'Unmapped'
                        : isApproximate(record)
                          ? 'Approximate'
                          : 'Reference area'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {!filtered.length && (
              <div className="la-empty">
                <h3>No matching records.</h3>
                <p>
                  Try an alternate name or identifier, broaden the filters, or explore all record
                  kinds.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFilters({ ...DEFAULT_FILTERS, kind: 'all' });
                    setPage(0);
                  }}
                >
                  Show all records
                </button>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="la-pagination">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage + 1} of {formatCount(pageCount)}
                </span>
                <button
                  type="button"
                  disabled={currentPage + 1 === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </div>
        <div className="la-inspector-column">
          {selected && !filtered.some((record) => record.id === selected.id) && (
            <p className="la-selection-note">This pinned profile is outside the current filters.</p>
          )}
          <RecordInspector
            record={selected}
            sources={index.sources}
            countries={countries}
            onSelect={select}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </div>
      <section className="la-provenance" id="atlas-sources">
        <div className="la-section-heading">
          <div>
            <p className="eyebrow">Provenance & perspective</p>
            <h2>Every record has a source.</h2>
          </div>
          <span className="la-fine">Collection prepared {index.generatedAt.slice(0, 10)}</span>
        </div>
        <div className="la-provenance-notes">
          {index.notes.map((note, item) => (
            <p key={item}>{note}</p>
          ))}
        </div>
        <div className="la-source-grid">
          {index.sources.map((source) => (
            <article key={source.id}>
              <h3>
                <SourceLink url={source.url}>{source.name}</SourceLink>
              </h3>
              <p className="la-source-meta">
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
        <p className="la-credits">
          <SourceLink url="https://joshuaproject.net">Data provided by Joshua Project</SourceLink>
          <span> · </span>Read each source’s terms before redistributing its records.
        </p>
      </section>
    </div>
  );
}
