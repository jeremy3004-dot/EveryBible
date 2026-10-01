'use client';

import dynamic from 'next/dynamic';
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
  AtlasLocation,
  AtlasRecord,
  AtlasDisplayMode,
  AtlasFilters,
  AtlasIndex,
  AtlasProjection,
} from '../../../admin/lib/language-atlas/types';
import type { publicAtlasHover } from '../../lib/public-atlas-hover';
import { selectPublicAtlasRecords } from '../../lib/public-atlas-records';
import { decodePublicAtlasInSlices } from '../../lib/public-atlas-transport';
import {
  projectSnapshot,
  filterProjects,
  type AtlasProject,
} from '../../lib/public-atlas-projects';
import atlasVersionData from '../../lib/public-atlas-version.json';
import { AtlasLegend, AtlasMapSettings, AtlasGroupRecords } from './PublicAtlasTools';
import { AtlasHero } from './AtlasHero';
import { useStoryCamera } from './useStoryCamera';
import { homeCopyEn, type HomeCopy } from '../../lib/home-copy';
import { storyPadding } from '../../lib/atlas-story';
import type { Map as LibreMap } from 'maplibre-gl';

/* MapLibre is ~1 MB of JavaScript. Loading the map in its own chunk lets the
   headline, search and story hydrate first instead of waiting for it; the
   placeholder is the same markup LanguageMap renders before its map is
   ready, so the swap causes no layout shift. The chunk also carries
   MapLibre's stylesheet, so it does not block the first paint. */
const LanguageMap = dynamic(
  () => import('./LazyLanguageMap').then((module) => module.LanguageMap),
  {
    ssr: false,
    loading: () => (
      <section className="la-map-panel" aria-label="Language atlas map">
        <div className="la-map-view">
          <div className="la-map-canvas" />
          <p className="la-map-message" role="status">
            Opening the atlas…
          </p>
        </div>
      </section>
    ),
  }
);

/* Profiles, sources, project lists and the hover card can only appear once
   the atlas data has loaded, so their code is left out of the first download
   and fetched alongside the data instead. */
const AtlasRecordProfile = dynamic(
  () => import('./PublicAtlasDetails').then((module) => module.AtlasRecordProfile),
  { ssr: false }
);
const AtlasSources = dynamic(
  () => import('./PublicAtlasDetails').then((module) => module.AtlasSources),
  { ssr: false }
);
const UnmappedProjectProfile = dynamic(
  () => import('./ProjectProgress').then((module) => module.UnmappedProjectProfile),
  { ssr: false }
);
const ProjectList = dynamic(() => import('./ProjectList').then((module) => module.ProjectList), {
  ssr: false,
});

const EMPTY_RECORDS: AtlasIndex['records'] = [];
const INITIAL_FILTERS: AtlasFilters = DEFAULT_FILTERS;
const PAGE_SIZE = 30;
/* Example searches shown under the search box. Each name is a real record. */
const SEARCH_HINTS = ['Tamang', 'Yoruba', 'Quechua', 'Hmong'];
/* Deep links that open the atlas tools instead of the story. */
const EXPLORE_HASHES = new Set(['#explore', '#atlas-sources']);

/**
 * The homepage hero: the headline beside a slowly turning globe. Wheel and
 * touch gestures scroll the page rather than the map; the + and − buttons
 * zoom it. "Explore the atlas", or clicking a dot, opens the full
 * search-and-browse tool over the whole screen (explore mode).
 */
export function PublicLanguageAtlas({ copy = homeCopyEn }: { copy?: HomeCopy }) {
  const [mode, setMode] = useState<'story' | 'explore'>('story');
  const exploring = mode === 'explore';
  const [map, setMap] = useState<LibreMap | null>(null);
  const [viewport, setViewport] = useState({ width: 1440, height: 900, header: 72 });
  const [stageVisible, setStageVisible] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [hoverCard, setHoverCard] = useState<typeof publicAtlasHover | null>(null);
  const renderHoverSummary = useCallback(
    (record: AtlasRecord, location: AtlasLocation | undefined) =>
      hoverCard!(record, location, index!),
    [hoverCard, index]
  );
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
    const update = () => {
      setMobile(media.matches);
      const header = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--header-h')
      );
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        header: Number.isFinite(header) ? header : 72,
      });
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Stop turning the globe once it has scrolled away.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => setStageVisible(entry.isIntersecting));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // Wait for the page's own fonts, scripts and images before starting the
    // 1.6 MB snapshot, so it never competes with them for bandwidth.
    const pageLoaded =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            window.addEventListener('load', () => resolve(), {
              once: true,
              signal: controller.signal,
            })
          );
    const hoverModule = pageLoaded.then(() => import('../../lib/public-atlas-hover'));
    // Warm the panel chunks so the first profile opens without a wait.
    void pageLoaded
      .then(() => Promise.all([import('./PublicAtlasDetails'), import('./ProjectList')]))
      .catch(() => {});
    void pageLoaded
      .then(() =>
        fetch(`/api/language-atlas/startup/${atlasVersionData.version}`, {
          signal: controller.signal,
        })
      )
      .then(async (response) => {
        if (!response.ok) throw new Error('Atlas unavailable');
        // Decoded in slices so taps and scrolling stay responsive meanwhile.
        const decoded = await decodePublicAtlasInSlices(await response.json());
        const { publicAtlasHover: hover } = await hoverModule;
        if (controller.signal.aborted) return;
        setHoverCard(() => hover);
        setIndex(decoded);
        // Language pages link to `/?language=<record id>` to open that profile here.
        const requested = new URLSearchParams(window.location.search).get('language');
        if (requested && decoded.records.some((record) => record.id === requested)) {
          setMode('explore');
          setSelectedId(requested);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const openFromHash = () => {
      const { hash } = window.location;
      if (!EXPLORE_HASHES.has(hash)) return;
      setMode('explore');
      if (hash === '#atlas-sources') {
        setSelectedProject(null);
        setSelectedId(null);
        setPanel('sources');
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  // Explore mode covers the screen; the page underneath stays where it was
  // and leaves the tab order, since it sits hidden behind the layer.
  const returnFocus = useRef<HTMLElement | null>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!exploring) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const section = sectionRef.current;
    const covered = [
      ...document.querySelectorAll<HTMLElement>('main > *, footer.site-footer'),
    ].filter((element) => section && !element.contains(section) && !element.inert);
    for (const element of covered) element.inert = true;
    // Phones get the way back, not the search box, so no keyboard pops up.
    if (window.matchMedia('(max-width: 760px)').matches) exitRef.current?.focus();
    else {
      skipSearchFocus.current = true;
      searchRef.current?.focus({ preventScroll: true });
    }
    return () => {
      root.style.overflow = previous;
      for (const element of covered) element.inert = false;
    };
  }, [exploring]);
  // Back in the story, focus returns to whatever opened the atlas.
  useEffect(() => {
    if (exploring) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    target?.focus({ preventScroll: true });
  }, [exploring]);

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
  const explorePadding = useMemo(
    () =>
      mobile
        ? {
            top: 120,
            right: 24,
            bottom: 210,
            left: 24,
          }
        : { top: 110, right: 70, bottom: 130, left: 240 },
    [mobile]
  );
  const storyPaddingValue = useMemo(
    () => storyPadding(viewport.width, viewport.height, viewport.header, copy.dir === 'rtl'),
    [viewport, copy.dir]
  );
  const padding = exploring ? explorePadding : storyPaddingValue;
  const stageRecords = exploring ? mapRecords : publicRecords;
  const stageHighlight = exploring && focusOurs ? highlightedProjectIds : undefined;
  const heroZoom = useStoryCamera(map, {
    active: !exploring,
    padding: storyPaddingValue,
    running: stageVisible,
  });

  const rememberTrigger = () => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      returnFocus.current = document.activeElement;
  };
  const enterExplore = useCallback(() => {
    rememberTrigger();
    setMode('explore');
  }, []);
  const exitExplore = useCallback(() => {
    if (EXPLORE_HASHES.has(window.location.hash))
      window.history.replaceState(null, '', window.location.pathname);
    setSelectedProject(null);
    setSelectedId(null);
    setPanel('intro');
    setMode('story');
  }, []);
  // A dot clicked on the hero globe opens that language in the atlas.
  const select = useCallback((id: string) => {
    setSelectedProject(null);
    setSelectedId(id);
    setPanel('intro');
    setMode('explore');
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
      if (event.key !== 'Escape' || !exploring) return;
      if (expanded) closePanel();
      else exitExplore();
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
  }, [mobile, expanded, closePanel, exploring, exitExplore]);

  const mapSettings = (
    <AtlasMapSettings
      mobile={mobile}
      projection={projection}
      displayMode={displayMode}
      onProjectionChange={setProjection}
      onDisplayModeChange={setDisplayMode}
    />
  );
  const projectFocus = (
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
        EL Translations <span>{projectSnapshot.projects.length}</span>
      </button>
      {focusOurs && <small>EL translations pulse. Other languages stay faded.</small>}
    </div>
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
      ref={sectionRef}
      className={`public-atlas ${exploring && expanded ? 'public-atlas--expanded' : ''}`}
      data-mode={mode}
      data-dir={copy.dir}
      data-mobile-panel={panel}
      data-project-focus={focusOurs}
      aria-label={copy.hero.exploreCta}
    >
      <div
        className="pa-stage"
        dir="ltr"
        ref={stageRef}
        role={exploring ? 'dialog' : undefined}
        aria-modal={exploring || undefined}
        aria-label={exploring ? copy.hero.exploreCta : undefined}
      >
        <LanguageMap
          records={stageRecords}
          selected={exploring ? selected : null}
          onSelect={select}
          displayMode={exploring ? displayMode : 'spread'}
          projection={exploring ? projection : 'globe'}
          padding={padding}
          dataReady={Boolean(index)}
          highlightedIds={stageHighlight}
          controlsTarget={null}
          onSelectGroup={exploring && mobile ? selectGroup : undefined}
          showHoverSummary={!mobile}
          renderHoverSummary={index && hoverCard ? renderHoverSummary : undefined}
          onMapReady={setMap}
        />

        {!exploring && (
          <div className="pa-zoom" role="group" aria-label={copy.explore.zoomLabel}>
            <button type="button" onClick={heroZoom.zoomIn} aria-label={copy.explore.zoomIn}>
              +
            </button>
            <button type="button" onClick={heroZoom.zoomOut} aria-label={copy.explore.zoomOut}>
              −
            </button>
          </div>
        )}

        {exploring && (
          <button
            ref={exitRef}
            type="button"
            className="pa-exit"
            dir={copy.dir}
            onClick={exitExplore}
          >
            <span className="pa-arrow" aria-hidden="true">
              ←
            </span>{' '}
            {copy.explore.close}
          </button>
        )}

        {exploring && !mobile && (
          <div className="pa-rail" aria-label="Map controls">
            <div className="pa-rail-row">
              {mapSettings}
              {projectFocus}
            </div>
          </div>
        )}

        {exploring && (
          <aside className="pa-explorer" ref={explorerRef} aria-label="Language explorer">
            <div className="pa-search-wrap">
              <label className="pa-search">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
                <span className="pa-sr-only">{copy.explore.searchLabel}</span>
                <input
                  ref={searchRef}
                  type="search"
                  dir={copy.dir}
                  value={filters.query}
                  placeholder={copy.explore.searchPlaceholder}
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
                  Browse all
                </button>
              )}
            </div>

            <div className="pa-search-hints">
              {!mobile && (
                <p>
                  <span>Try</span>
                  {SEARCH_HINTS.map((hint) => (
                    <button type="button" key={hint} onClick={() => updateFilter('query', hint)}>
                      {hint}
                    </button>
                  ))}
                </p>
              )}
              {mobile && projectFocus}
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
                  <p className="pa-empty">Search by name or browse languages.</p>
                  <button type="button" className="pa-browse" onClick={() => openPanel('records')}>
                    Browse all
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
                    <h2>Explore languages</h2>
                    <button type="button" onClick={() => closePanel()} aria-label="Close records">
                      ×
                    </button>
                  </div>
                  <div className="pa-filters">
                    <label>
                      <span>Show</span>
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
                    {index ? `${formatCount(records.length)} results` : 'Loading languages…'}{' '}
                    {filters !== deferredFilters && ' · Searching…'}
                  </p>
                  <div className="pa-record-list">
                    {records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((record) => (
                      <button type="button" key={record.id} onClick={() => select(record.id)}>
                        <i
                          className="pa-dot"
                          style={{
                            background:
                              SCRIPTURE_COLORS.dark[
                                scriptureVisualCategory(scriptureStatus(record))
                              ],
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
                      <p className="pa-empty">
                        No matches. Try another name or clear your filters.
                      </p>
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
              ) : null}
              {loadError && (
                <div className="pa-load-error" role="alert">
                  The map could not load.{' '}
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
                  Loading languages…
                </p>
              )}
            </div>
          </aside>
        )}

        {exploring && !mobile && <div className="pa-dock">{legend}</div>}
      </div>

      {exploring && (
        <h1 className="pa-sr-only">
          {copy.hero.titleLine1} {copy.hero.titleLine2}
        </h1>
      )}
      <AtlasHero copy={copy} hidden={exploring} onExplore={enterExplore} />
    </section>
  );
}
