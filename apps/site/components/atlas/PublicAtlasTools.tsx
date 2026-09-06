import { formatCount, KIND_LABELS } from '../../../admin/lib/language-atlas/model';
import {
  SCRIPTURE_COLORS,
  SCRIPTURE_PRESENTATION,
  SCRIPTURE_VISUAL_ORDER,
} from '../../../admin/lib/language-atlas/presentation';
import type {
  AtlasDisplayMode,
  AtlasFilters,
  AtlasProjection,
  AtlasRecord,
} from '../../../admin/lib/language-atlas/types';

export function AtlasMapSettings({
  mobile,
  projection,
  displayMode,
  onProjectionChange,
  onDisplayModeChange,
}: {
  mobile: boolean;
  projection: AtlasProjection;
  displayMode: AtlasDisplayMode;
  onProjectionChange: (value: AtlasProjection) => void;
  onDisplayModeChange: (value: AtlasDisplayMode) => void;
}) {
  return (
    <div className={mobile ? 'pa-settings-controls' : 'pa-map-toolbar'} aria-label="Map settings">
      <div className="pa-segment" role="group" aria-label="Map projection">
        <button
          type="button"
          aria-pressed={projection === 'globe'}
          onClick={() => onProjectionChange('globe')}
        >
          Globe
        </button>
        <button
          type="button"
          aria-pressed={projection === 'mercator'}
          onClick={() => onProjectionChange('mercator')}
        >
          Map
        </button>
      </div>
      <div className="pa-segment pa-segment--display" role="group" aria-label="Point display">
        <button
          type="button"
          aria-pressed={displayMode === 'spread'}
          onClick={() => onDisplayModeChange('spread')}
        >
          Dots
        </button>
        <button
          type="button"
          aria-pressed={displayMode === 'clustered'}
          onClick={() => onDisplayModeChange('clustered')}
        >
          Clusters
        </button>
      </div>
    </div>
  );
}

export function AtlasLegend({
  scripture,
  onScriptureChange,
  onSources,
}: {
  scripture: AtlasFilters['scripture'];
  onScriptureChange: (value: AtlasFilters['scripture']) => void;
  onSources: () => void;
}) {
  return (
    <>
      <div className="pa-legend" aria-label="Scripture status legend">
        {SCRIPTURE_VISUAL_ORDER.map((category) => (
          <button
            type="button"
            key={category}
            aria-pressed={scripture === category}
            onClick={() => onScriptureChange(scripture === category ? 'all' : category)}
          >
            <i className="pa-dot" style={{ background: SCRIPTURE_COLORS.dark[category] }} />
            {SCRIPTURE_PRESENTATION[category].label}
          </button>
        ))}
      </div>
      <div className="pa-collection-note">
        <button type="button" onClick={onSources}>
          About the data ↗
        </button>
      </div>
    </>
  );
}

const GROUP_PAGE_SIZE = 30;

export function AtlasGroupRecords({
  ids,
  byId,
  page,
  onPageChange,
  onSelect,
  onClose,
}: {
  ids: string[];
  byId: Map<string, AtlasRecord>;
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="pa-records" aria-label="Selected map records">
      <div className="pa-section-top">
        <h2>{formatCount(ids.length)} nearby records</h2>
        <button type="button" onClick={onClose} aria-label="Close map records">
          ×
        </button>
      </div>
      <div className="pa-record-list">
        {ids.slice(page * GROUP_PAGE_SIZE, (page + 1) * GROUP_PAGE_SIZE).map((id) => {
          const record = byId.get(id);
          return record ? (
            <button type="button" key={id} onClick={() => onSelect(id)}>
              <span>
                {record.name}
                <small>{KIND_LABELS[record.kind]}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
          ) : null;
        })}
      </div>
      {ids.length > GROUP_PAGE_SIZE && (
        <div className="pa-pagination">
          <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(ids.length / GROUP_PAGE_SIZE)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * GROUP_PAGE_SIZE >= ids.length}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
