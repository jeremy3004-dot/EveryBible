'use client';

import { LanguageMap } from '../../../admin/components/language-atlas/LanguageMap';
import Image from 'next/image';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FILTERS,
  filterRecords,
  formatCount,
  KIND_LABELS,
  scriptureStatus,
} from '../../../admin/lib/language-atlas/model';
import {
  SCRIPTURE_COLORS,
  scriptureVisualCategory,
} from '../../../admin/lib/language-atlas/presentation';
import type {
  AtlasDisplayMode,
  AtlasFilters,
  AtlasIndex,
  AtlasProjection,
} from '../../../admin/lib/language-atlas/types';
import { selectPublicAtlasRecords } from '../../lib/public-atlas-records';
import { decodePublicAtlas } from '../../lib/public-atlas-transport';
import {
  projectSnapshot,
  filterProjects,
  type AtlasProject,
} from '../../lib/public-atlas-projects';
import atlasVersionData from '../../lib/public-atlas-version.json';
import { ProjectList } from './ProjectList';
import { UnmappedProjectProfile } from './ProjectProgress';
import { AtlasRecordProfile, AtlasSources } from './PublicAtlasDetails';
import { AtlasLegend, AtlasMapSettings, AtlasGroupRecords } from './PublicAtlasTools';
import { EVERYBIBLE_APP_STORE_URL, EVERYBIBLE_GOOGLE_PLAY_URL } from '../../lib/site-links';

const EMPTY_RECORDS: AtlasIndex['records'] = [];
const INITIAL_FILTERS: AtlasFilters = DEFAULT_FILTERS;
const PAGE_SIZE = 30;

export function PublicLanguageAtlas() {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedProject, setSelectedProject] = useState<AtlasProject | null>(null);
  const [focusOurs, setFocusOurs] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const deferredFilters = useDeferredValue(filters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<
    'intro' | 'search' | 'records' | 'sources' | 'legend' | 'settings' | 'group'
  >('intro');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [controlsTarget, setControlsTarget] = useState<HTMLDivElement | null>(null);
  const explorerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const skipSearchFocus = useRef(false);
  const [page, setPage] = useState(0);
  const [displayMode, setDisplayMode] = useState<AtlasDisplayMode>('spread');
  const [projection, setProjection] = useState<AtlasProjection>('globe');
  const [mobile, setMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [selectedId, selectedProject, panel, page, deferredFilters]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/language-atlas/startup/${atlasVersionData.version}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Atlas unavailable');
        setIndex(decodePublicAtlas(await response.json()));
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const openSources = () => {
      if (window.location.hash === '#atlas-sources') {
        setSelectedProject(null);
        setSelectedId(null);
        setPanel('sources');
      }
    };
    openSources();
    window.addEventListener('hashchange', openSources);
    return () => window.removeEventListener('hashchange', openSources);
  }, []);

  const publicRecords = useMemo(
    () => selectPublicAtlasRecords(index?.records ?? EMPTY_RECORDS),
    [index]
  );
  const records = useMemo(
    () => filterRecords(publicRecords, deferredFilters),
    [publicRecords, deferredFilters]
  );
  const projects = useMemo(
    () => filterProjects(publicRecords, deferredFilters),
    [publicRecords, deferredFilters]
  );
  const highlightedProjectIds = useMemo(
    () => new Set(projects.flatMap((p) => (p.recordId ? [p.recordId] : []))),
    [projects]
  );
  const mapRecords = useMemo(
    () => (focusOurs ? filterRecords(publicRecords, { ...deferredFilters, query: '' }) : records),
    [publicRecords, deferredFilters, focusOurs, records]
  );
  const byId = useMemo(
    () => new Map(publicRecords.map((record) => [record.id, record])),
    [publicRecords]
  );
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const searching = Boolean(filters.query.trim());
  const showRecords = panel === 'records';
  const expanded = Boolean(selectedProject || selected || panel !== 'intro');
  const padding = useMemo(
    () =>
      mobile
        ? {
            top: 120,
            right: 24,
            bottom: 210,
            left: 24,
          }
        : { top: 60, right: 50, bottom: 70, left: 410 },
    [mobile]
  );
  const select = useCallback((id: string) => {
    setSelectedProject(null);
    setSelectedId(id);
    setPanel('intro');
  }, []);
  const selectGroup = useCallback((ids: string[]) => {
    setSelectedProject(null);
    setSelectedId(null);
    setGroupIds(ids);
    setPage(0);
    setPanel('group');
  }, []);
  const updateFilter = <Key extends keyof AtlasFilters>(key: Key, value: AtlasFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    setSelectedProject(null);
    setSelectedId(null);
    setPanel(key === 'query' && !String(value).trim() ? 'search' : 'records');
  };
  const closePanel = useCallback((restoreFocus = true) => {
    if (window.location.hash === '#atlas-sources')
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setSelectedProject(null);
    setSelectedId(null);
    setPanel('intro');
    const trigger = triggerRef.current ?? searchRef.current;
    if (restoreFocus && trigger && trigger !== document.activeElement) {
      skipSearchFocus.current = trigger === searchRef.current;
      trigger.focus({ preventScroll: true });
    }
  }, []);

  const openPanel = (next: typeof panel, trigger?: HTMLElement) => {
    if (trigger) triggerRef.current = trigger;
    setSelectedProject(null);
    setSelectedId(null);
    setPanel(next);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    const handleOutside = (event: PointerEvent) => {
      if (!mobile || !expanded || !(event.target instanceof Node)) return;
      if (explorerRef.current?.contains(event.target)) return;
      closePanel(false);
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', handleOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, [mobile, expanded, closePanel]);

  const mapSettings = (
    <AtlasMapSettings
      mobile={mobile}
      projection={projection}
      displayMode={displayMode}
      onProjectionChange={setProjection}
      onDisplayModeChange={setDisplayMode}
    />
  );
  const legend = (
    <AtlasLegend
      scripture={filters.scripture}
      onScriptureChange={(value) => updateFilter('scripture', value)}
      onSources={() => openPanel('sources')}
    />
  );

  return (
    <section
      className={`public-atlas ${expanded ? 'public-atlas--expanded' : ''}`}
      data-mobile-panel={panel}
      data-project-focus={focusOurs}
      aria-label="Explore the world's languages"
    >
      <LanguageMap
        records={mapRecords}
        selected={selected}
        onSelect={select}
        displayMode={displayMode}
        projection={projection}
        padding={padding}
        dataReady={Boolean(index)}
        highlightedIds={focusOurs ? highlightedProjectIds : undefined}
        controlsTarget={mobile ? controlsTarget : undefined}
        onSelectGroup={mobile ? selectGroup : undefined}
        showHoverSummary={!mobile}
      />

      {!mobile && mapSettings}

      <aside className="pa-explorer" ref={explorerRef} aria-label="Language explorer">
        <div className="pa-search-wrap">
          <label className="pa-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <span className="pa-sr-only">Search languages and dialects</span>
            <input
              ref={searchRef}
              type="search"
              value={filters.query}
              placeholder="Find a language or dialect…"
              onFocus={(event) => {
                if (skipSearchFocus.current) {
                  skipSearchFocus.current = false;
                  return;
                }
                if (mobile) openPanel(searching ? 'records' : 'search', event.currentTarget);
              }}
              onClick={(event) => {
                if (mobile && panel !== 'search' && panel !== 'records')
                  openPanel(searching ? 'records' : 'search', event.currentTarget);
              }}
              onChange={(event) => updateFilter('query', event.target.value)}
            />
          </label>
          {!mobile && (
            <button
              type="button"
              className="pa-browse"
              aria-pressed={panel === 'records'}
              onClick={() => {
                setSelectedProject(null);
                setSelectedId(null);
                setPanel(panel === 'records' ? 'intro' : 'records');
              }}
            >
              Records
            </button>
          )}
        </div>

        <div className="pa-project-focus">
          <button
            type="button"
            aria-pressed={focusOurs}
            onClick={() => {
              setFocusOurs(!focusOurs);
              setPage(0);
              setSelectedProject(null);
              setSelectedId(null);
              setPanel('records');
            }}
          >
            Our languages <span>{projectSnapshot.projects.length}</span>
          </button>
          {focusOurs && <small>Our projects pulse. Other languages stay faded.</small>}
        </div>

        <div className="pa-mobile-tools" aria-label="Atlas tools">
          {(['legend', 'settings'] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-expanded={panel === name}
              aria-controls="pa-mobile-panel"
              onClick={(event) =>
                panel === name ? closePanel() : openPanel(name, event.currentTarget)
              }
            >
              {name === 'legend' ? 'Legend' : 'Settings'}
            </button>
          ))}
        </div>

        <div className="pa-explorer-body" ref={bodyRef} id="pa-mobile-panel">
          {mobile && panel === 'settings' ? (
            <section className="pa-tool-panel" aria-label="Settings">
              <div className="pa-section-top">
                <h2>Map settings</h2>
                <button type="button" onClick={() => closePanel()} aria-label="Close settings">
                  ×
                </button>
              </div>
              {mapSettings}
              <div className="pa-settings-actions" ref={setControlsTarget} />
            </section>
          ) : mobile && panel === 'legend' ? (
            <section className="pa-tool-panel" aria-label="Legend">
              <div className="pa-section-top">
                <h2>Scripture status</h2>
                <button type="button" onClick={() => closePanel()} aria-label="Close legend">
                  ×
                </button>
              </div>
              {legend}
            </section>
          ) : mobile && panel === 'search' ? (
            <section className="pa-tool-panel" aria-label="Search options">
              <div className="pa-section-top">
                <h2>Explore languages</h2>
                <button type="button" onClick={() => closePanel()} aria-label="Close search">
                  ×
                </button>
              </div>
              <p className="pa-empty">Search by name, or browse the collection.</p>
              <button type="button" className="pa-browse" onClick={() => openPanel('records')}>
                Records
              </button>
            </section>
          ) : mobile && panel === 'group' ? (
            <AtlasGroupRecords
              ids={groupIds}
              byId={byId}
              page={page}
              onPageChange={setPage}
              onSelect={select}
              onClose={() => closePanel()}
            />
          ) : selectedProject ? (
            <UnmappedProjectProfile project={selectedProject} onClose={closePanel} />
          ) : selected && index ? (
            <AtlasRecordProfile record={selected} index={index} onClose={closePanel} />
          ) : panel === 'sources' && index ? (
            <AtlasSources index={index} onClose={closePanel} />
          ) : showRecords && focusOurs ? (
            <ProjectList
              projects={projects}
              onClose={closePanel}
              onShowAll={() => setFilters(INITIAL_FILTERS)}
              onSelect={(project) => {
                if (project.recordId) select(project.recordId);
                else {
                  setSelectedId(null);
                  setSelectedProject(project);
                  setPanel('intro');
                }
              }}
            />
          ) : showRecords ? (
            <section className="pa-records" aria-label="Records">
              <div className="pa-section-top">
                <h2>Explore records</h2>
                <button type="button" onClick={() => closePanel()} aria-label="Close records">
                  ×
                </button>
              </div>
              <div className="pa-filters">
                <label>
                  <span>Collection</span>
                  <select
                    value={filters.kind}
                    onChange={(event) =>
                      updateFilter('kind', event.target.value as AtlasFilters['kind'])
                    }
                  >
                    <option value="varieties">Languages &amp; dialects</option>
                    <option value="language">Languages</option>
                    <option value="dialect">Dialects / varieties</option>
                  </select>
                </label>
                <label>
                  <span>Country</span>
                  <select
                    value={filters.country}
                    onChange={(event) => updateFilter('country', event.target.value)}
                  >
                    <option value="">All countries</option>
                    {index?.countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="pa-result-count" role="status">
                {index ? `${formatCount(records.length)} records` : 'Loading records…'}{' '}
                {filters !== deferredFilters && ' · Searching…'}
              </p>
              <div className="pa-record-list">
                {records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((record) => (
                  <button type="button" key={record.id} onClick={() => select(record.id)}>
                    <i
                      className="pa-dot"
                      style={{
                        background:
                          SCRIPTURE_COLORS.dark[scriptureVisualCategory(scriptureStatus(record))],
                      }}
                    />
                    <span>
                      {record.name}
                      <small>
                        {KIND_LABELS[record.kind]} ·{' '}
                        {record.iso6393 ??
                          record.rolvCode ??
                          record.glottocode ??
                          record.countryCodes.join(', ')}
                      </small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
                {index && !records.length && (
                  <p className="pa-empty">No matches. Try another name or clear your filters.</p>
                )}
              </div>
              {records.length > PAGE_SIZE && (
                <div className="pa-pagination">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {page + 1} / {Math.ceil(records.length / PAGE_SIZE)}
                  </span>
                  <button
                    type="button"
                    disabled={(page + 1) * PAGE_SIZE >= records.length}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              <button
                className="pa-text-link"
                type="button"
                onClick={() => {
                  setFilters(INITIAL_FILTERS);
                  setPage(0);
                }}
              >
                Clear all filters
              </button>
            </section>
          ) : !mobile ? (
            <div className="pa-intro">
              <p className="pa-eyebrow">
                <span /> EVERYBIBLE
              </p>
              <h1>
                God’s Word.
                <br />
                <em>In your heart language.</em>
              </h1>
              <p className="pa-intro-copy">
                Read, listen, and grow closer to God through Scripture in your own language.
                EveryBible is part of Every Language’s vision for the whole Bible in every language,
                in this generation.
              </p>
              <div className="pa-intro-actions">
                <a href="/download">Get the app</a>
                <button
                  type="button"
                  onClick={(event) => openPanel('records', event.currentTarget)}
                >
                  Explore the atlas
                </button>
              </div>
              <h2>Explore the languages still waiting for Scripture.</h2>
              <p className="pa-intro-copy">
                Discover languages and dialects around the world and explore what is known about
                Scripture availability in each. Red marks those for which our sources have no
                documented Scripture.
              </p>
              <div className="pa-collection-stats" aria-label="Atlas collection counts">
                <div>
                  <strong>{index ? formatCount(index.counts.languages) : '—'}</strong>
                  <span>language records</span>
                </div>
                <div>
                  <strong>{index ? formatCount(index.counts.dialects) : '—'}</strong>
                  <span>dialects & varieties</span>
                </div>
              </div>
              <p className="pa-map-hint">Choose a dot. Discover its story.</p>
            </div>
          ) : null}
          {loadError && (
            <div className="pa-load-error" role="alert">
              The collection could not load.{' '}
              <button
                type="button"
                onClick={() => {
                  setLoadError(false);
                  setRetry((value) => value + 1);
                }}
              >
                Try again
              </button>
            </div>
          )}
          {!index && !loadError && (
            <p className="pa-loading" role="status">
              Gathering the language collection…
            </p>
          )}
        </div>

        {!mobile && legend}
      </aside>

      <div className="pa-download-dock">
        {index?.sources.some((source) => /joshua/i.test(source.name)) && (
          <a
            className="pa-provider-credit"
            href="https://joshuaproject.net"
            target="_blank"
            rel="noreferrer"
          >
            Data provided by Joshua Project
          </a>
        )}
        <section className="pa-download" id="download" aria-label="Download EveryBible">
          <a className="pa-qr" href="/download" aria-label="Download EveryBible for your phone">
            <Image
              src="/everybible/download-qr.svg"
              alt="Scan to download EveryBible"
              width={84}
              height={84}
              unoptimized
            />
          </a>
          <div>
            <p className="pa-eyebrow">EVERYBIBLE</p>
            <h2>Built for the heart of Africa and the heights of the Himalayas.</h2>
            <p>
              Download available Scripture to read or listen wherever you are, even without a
              signal.
            </p>
            <div className="pa-store-links">
              <a href={EVERYBIBLE_APP_STORE_URL}>iPhone ↗</a>
              <a href={EVERYBIBLE_GOOGLE_PLAY_URL}>Android ↗</a>
            </div>
          </div>
        </section>
        <p className="pa-atlas-disclaimer">Research atlas. App translation availability differs.</p>
      </div>
    </section>
  );
}
