'use client';

import { useState } from 'react';
import type { CountryMetric, TranslationBreakdownEntry } from '@/lib/analytics-reporting';
import { downloadCsv, formatNumber } from '@/lib/analytics-atlas';

type SortKey = 'name' | 'listeningMinutes' | 'readingMinutes' | 'downloadUnits' | 'listenerCount';
const columns: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'listeningMinutes', label: 'Listening min' },
  { key: 'readingMinutes', label: 'Reading min' },
  { key: 'downloadUnits', label: 'Download units' },
  { key: 'listenerCount', label: 'Listeners' },
];
type TableRow = {
  id: string;
  name: string;
  listeningMinutes: number;
  readingMinutes: number;
  downloadUnits: number;
  listenerCount: number;
  detail: string;
};

function AnalyticsTable({
  title,
  note,
  rows,
  selected,
  onSelect,
  exportName,
}: {
  title: string;
  note: string;
  rows: TableRow[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  exportName: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('listeningMinutes');
  const [ascending, setAscending] = useState(false);
  const filtered = rows
    .filter((row) => `${row.name} ${row.detail}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const result = sort === 'name' ? a.name.localeCompare(b.name) : a[sort] - b[sort];
      return (ascending ? result : -result) || a.name.localeCompare(b.name);
    });
  return (
    <section className="atlas-panel atlas-table-panel">
      <div className="atlas-panel-header">
        <div>
          <h3>{title}</h3>
          <p className="atlas-muted">{note}</p>
        </div>
        <div className="atlas-controls">
          <input
            className="atlas-search"
            type="search"
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder="Search this table…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="button"
            disabled={!filtered.length}
            onClick={() =>
              downloadCsv(exportName, [
                [...columns.map((column) => column.label), 'Geography'],
                ...filtered.map((row) => [
                  row.name,
                  row.listeningMinutes,
                  row.readingMinutes,
                  row.downloadUnits,
                  row.listenerCount,
                  row.detail,
                ]),
              ])
            }
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={`${title} table`}>
        <table className="data-table atlas-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort === column.key ? (ascending ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSort(column.key);
                      setAscending(sort === column.key ? !ascending : column.key === 'name');
                    }}
                  >
                    {column.label}
                    <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12">
                      <path
                        d={sort === column.key && ascending ? 'M3 8 6 4 9 8' : 'M3 4 6 8 9 4'}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </button>
                </th>
              ))}
              <th scope="col">Geography</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={selected === row.id ? 'data-table__row--active' : undefined}
              >
                <td>
                  <button
                    className="atlas-row-link"
                    type="button"
                    aria-pressed={selected === row.id}
                    onClick={() => onSelect(selected === row.id ? null : row.id)}
                  >
                    {row.name}
                  </button>
                </td>
                <td>{formatNumber(row.listeningMinutes)}</td>
                <td>{formatNumber(row.readingMinutes)}</td>
                <td>{formatNumber(row.downloadUnits)}</td>
                <td>{formatNumber(row.listenerCount)}</td>
                <td className="atlas-muted">{row.detail}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6}>
                  {query ? 'No rows match your search.' : 'No data available for this selection.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="atlas-source">
        {filtered.length} of {rows.length} rows · Select a name to focus the atlas. Listener counts
        are distinct within each row; do not sum them.
      </div>
    </section>
  );
}

export function AnalyticsTables({
  translations,
  countries,
  selectedTranslation,
  onSelectTranslation,
  selectedCountry,
  onSelectCountry,
  windowDays,
}: {
  translations: TranslationBreakdownEntry[];
  countries: CountryMetric[];
  selectedTranslation: string | null;
  onSelectTranslation: (id: string | null) => void;
  selectedCountry: string | null;
  onSelectCountry: (code: string | null) => void;
  windowDays: number;
}) {
  return (
    <>
      <AnalyticsTable
        title="Country totals"
        note={`${selectedTranslation?.toUpperCase() ?? 'All translations'} · last ${windowDays} days · Country-attributed activity`}
        rows={countries.map((country) => ({
          ...country,
          id: country.code,
          detail: country.subregion ?? country.region ?? country.code,
        }))}
        selected={selectedCountry}
        onSelect={onSelectCountry}
        exportName={`everybible-countries-${selectedTranslation ?? 'all'}-${windowDays}d.csv`}
      />
      <AnalyticsTable
        title="Translation engagement"
        note={`All translations · last ${windowDays} days · Select a translation to filter geography`}
        rows={translations.map((entry) => ({
          ...entry,
          id: entry.translationId,
          name: entry.translationId.toUpperCase(),
          detail: entry.locationMetrics.length
            ? `${entry.locationMetrics.length} map locations`
            : entry.countryTableMetrics.length
              ? 'Country totals only'
              : 'No geographic detail',
        }))}
        selected={selectedTranslation}
        onSelect={onSelectTranslation}
        exportName={`everybible-translations-${windowDays}d.csv`}
      />
    </>
  );
}
