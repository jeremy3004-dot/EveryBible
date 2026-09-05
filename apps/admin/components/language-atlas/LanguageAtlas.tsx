'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  countRecords,
  DEFAULT_FILTERS,
  exportCsv,
  filterRecords,
  formatCount,
} from '@/lib/language-atlas/model';
import type {
  AtlasDisplayMode,
  AtlasFilters,
  AtlasIndex,
  AtlasMapPadding,
  AtlasProjection,
} from '@/lib/language-atlas/types';
import { AtlasHeader } from './AtlasHeader';
import { CollectionPanel, MapControls, RecordsPanel } from './AtlasPanels';
import { LanguageMap } from './LanguageMap';
import { RecordInspector } from './RecordInspector';

type InspectorView = 'controls' | 'records' | 'collection' | 'profile';

function useAtlasViewport() {
  const [viewport, setViewport] = useState({ mobile: false, height: 900 });
  useEffect(() => {
    const update = () =>
      setViewport({
        mobile: window.matchMedia('(max-width: 820px)').matches,
        height: window.innerHeight,
      });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return viewport;
}

export function LanguageAtlas() {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch('/api/language-atlas', { signal: controller.signal, cache: 'no-store' })
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
      <div className="language-atlas language-atlas--viewport la-loading">
        <AtlasHeader
          query=""
          resultCount={0}
          results={[]}
          popoverOpen={false}
          activeResult={-1}
          onQuery={() => undefined}
          onOpen={() => undefined}
          onClose={() => undefined}
          onActiveResult={() => undefined}
          onSelect={() => undefined}
          onViewAll={() => undefined}
        />
        <div className="la-loading-card" role={error ? 'alert' : 'status'}>
          <span className="la-loading-mark">EB</span>
          <strong>{error ?? 'Opening the language atlas…'}</strong>
          {error && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRetry((value) => value + 1);
              }}
            >
              Retry collection
            </button>
          )}
        </div>
      </div>
    );
  return <LanguageAtlasContent index={index} />;
}

// Separate from transport so the complete atlas can be previewed with a source snapshot.
export function LanguageAtlasContent({ index }: { index: AtlasIndex }) {
  const [filters, setFilters] = useState<AtlasFilters>(DEFAULT_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [exportNotice, setExportNotice] = useState('');
  const [view, setView] = useState<InspectorView>('controls');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [displayMode, setDisplayMode] = useState<AtlasDisplayMode>('individual');
  const [projection, setProjection] = useState<AtlasProjection>('globe');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchResult, setActiveSearchResult] = useState(-1);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { mobile, height } = useAtlasViewport();

  const records = useMemo(
    () => [...index.records].sort((a, b) => a.name.localeCompare(b.name)),
    [index.records]
  );
  const byId = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const countries = useMemo(
    () => new Map(index.countries.map((country) => [country.code, country.name])),
    [index.countries]
  );
  const filtered = useMemo(
    () => filterRecords(records, { ...filters, query: deferredQuery }),
    [records, deferredQuery, filters]
  );
  const counts = useMemo(() => countRecords(filtered), [filtered]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const searchResults = filters.query.trim() ? filtered.slice(0, 10) : [];
  const safeActiveSearchResult = searchResults.length
    ? Math.min(Math.max(activeSearchResult, 0), searchResults.length - 1)
    : -1;
  const mapPadding: AtlasMapPadding = mobile
    ? {
        top: 72,
        right: 16,
        bottom: sheetExpanded ? Math.min(Math.round(height * 0.68), 620) : 72,
        left: 16,
      }
    : { top: 80, right: 496, bottom: 16, left: 16 };

  const change = (patch: Partial<AtlasFilters>) => {
    setFilters((value) => ({ ...value, ...patch }));
    setPage(0);
    setExportNotice('');
  };
  const openView = (next: Exclude<InspectorView, 'profile'>) => {
    setView(next);
    setSelectedId(null);
    setSheetExpanded(true);
  };
  const closeProfile = () => {
    setSelectedId(null);
    setView('records');
    requestAnimationFrame(() => returnFocus.current?.focus());
  };
  const select = (id: string) => {
    if (!byId.has(id)) {
      setSelectionError(
        'This related record is not included in the current source collection. Its source link may have more detail.'
      );
      return;
    }
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    setSelectedId(id);
    setSelectionError(null);
    setView('profile');
    setSheetExpanded(true);
    setSearchOpen(false);
    requestAnimationFrame(() => document.getElementById('atlas-profile-back')?.focus());
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (searchOpen) setSearchOpen(false);
      else if (selectedId) closeProfile();
      else if (mobile && sheetExpanded) {
        setSheetExpanded(false);
        requestAnimationFrame(() => document.getElementById('atlas-sheet-toggle')?.focus());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const activeFilters = Boolean(
    filters.query ||
    filters.country ||
    filters.scripture !== 'all' ||
    filters.placement !== 'all' ||
    filters.source
  );
  const kindOptions: { value: AtlasFilters['kind']; label: string; count: number }[] = [
    { value: 'language', label: 'Languages', count: index.counts.languages },
    { value: 'dialect', label: 'Dialects', count: index.counts.dialects },
    { value: 'people-group', label: 'People groups', count: index.counts.peopleGroups },
    { value: 'all', label: 'All', count: index.counts.records },
  ];
  const exportFiltered = () => {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', exportCsv(filtered)], { type: 'text/csv;charset=utf-8;' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'everybible-language-atlas.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportNotice(`Exported ${formatCount(filtered.length)} filtered records.`);
  };

  return (
    <div className="language-atlas language-atlas--viewport">
      <AtlasHeader
        query={filters.query}
        resultCount={filtered.length}
        results={searchResults}
        popoverOpen={searchOpen}
        activeResult={safeActiveSearchResult}
        onQuery={(query) => {
          change({ query });
          setActiveSearchResult(query ? 0 : -1);
          setView('records');
          setSheetExpanded(true);
          setSearchOpen(Boolean(query));
        }}
        onOpen={() => setSearchOpen(Boolean(filters.query))}
        onClose={() => setSearchOpen(false)}
        onActiveResult={setActiveSearchResult}
        onSelect={select}
        onViewAll={() => {
          setSearchOpen(false);
          openView('records');
        }}
      />
      <div className="la-kind-tabs" role="group" aria-label="Record kind">
        {kindOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={filters.kind === option.value}
            title={`${formatCount(option.count)} ${option.label.toLowerCase()}`}
            onClick={() => change({ kind: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <LanguageMap
        records={filtered}
        selected={selected}
        onSelect={select}
        displayMode={displayMode}
        projection={projection}
        padding={mapPadding}
      />
      <aside
        className="la-panel"
        data-expanded={sheetExpanded}
        aria-label="Language atlas inspector"
      >
        <button
          className="la-sheet-toggle"
          id="atlas-sheet-toggle"
          type="button"
          aria-expanded={sheetExpanded}
          onClick={() => setSheetExpanded((value) => !value)}
        >
          <span aria-hidden="true" />
          <strong>
            {selected
              ? selected.name
              : view === 'controls'
                ? 'Map controls'
                : view === 'records'
                  ? `${formatCount(filtered.length)} records`
                  : 'Collection'}
          </strong>
          <small>{sheetExpanded ? 'Collapse' : 'Expand'}</small>
        </button>
        <div
          className="la-panel-inner"
          aria-hidden={mobile && !sheetExpanded ? true : undefined}
          inert={mobile && !sheetExpanded ? true : undefined}
        >
          {view === 'profile' && selected ? (
            <div className="la-profile-chrome">
              <button
                id="atlas-profile-back"
                type="button"
                onClick={closeProfile}
                aria-label="Back to records"
              >
                ←
              </button>
              <div>
                <span>{selected.kind === 'people-group' ? 'People group' : selected.kind}</span>
                <strong>{selected.name}</strong>
              </div>
              <button type="button" onClick={closeProfile} aria-label="Close selected profile">
                ×
              </button>
            </div>
          ) : (
            <div className="la-panel-chrome">
              <span>Map</span>
              <strong>Inspector</strong>
            </div>
          )}
          {view !== 'profile' && (
            <nav className="la-panel-tabs" aria-label="Inspector sections">
              {(['controls', 'records', 'collection'] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-current={view === item ? 'page' : undefined}
                  onClick={() => openView(item)}
                >
                  {item === 'controls' ? 'Map controls' : item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </nav>
          )}
          <div className="la-panel-scroll">
            {selectionError && (
              <p className="la-selection-note" role="status">
                {selectionError}
              </p>
            )}
            {view === 'controls' && (
              <MapControls
                filters={filters}
                index={index}
                counts={counts}
                displayMode={displayMode}
                projection={projection}
                activeFilters={activeFilters}
                onChange={change}
                onDisplayMode={setDisplayMode}
                onProjection={setProjection}
                onClear={() => {
                  setFilters({ ...DEFAULT_FILTERS, kind: filters.kind });
                  setPage(0);
                }}
              />
            )}
            {view === 'records' && (
              <RecordsPanel
                filtered={filtered}
                countries={countries}
                currentPage={currentPage}
                pageCount={pageCount}
                selectedId={selectedId}
                queryPending={filters.query !== deferredQuery}
                exportNotice={exportNotice}
                onPage={setPage}
                onSelect={select}
                onExport={exportFiltered}
                onClear={() => {
                  setFilters({ ...DEFAULT_FILTERS, kind: 'all' });
                  setPage(0);
                }}
              />
            )}
            {view === 'collection' && <CollectionPanel index={index} />}
            {view === 'profile' && selected && (
              <RecordInspector
                record={selected}
                sources={index.sources}
                countries={countries}
                onSelect={select}
                onClose={closeProfile}
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
