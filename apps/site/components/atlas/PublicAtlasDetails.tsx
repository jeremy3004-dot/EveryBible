import { useEffect, useRef } from 'react';
import {
  formatCount,
  isApproximate,
  KIND_LABELS,
  PRECISION_LABELS,
  recordLocations,
  safeSourceUrl,
  SCRIPTURE_LABELS,
  scriptureStatus,
} from '../../../admin/lib/language-atlas/model';
import {
  SCRIPTURE_COLORS,
  scriptureVisualCategory,
} from '../../../admin/lib/language-atlas/presentation';
import type { AtlasIndex, AtlasRecord, AtlasSource } from '../../../admin/lib/language-atlas/types';

function SourceLink({ source, record }: { source: AtlasSource; record?: AtlasRecord }) {
  // These exact record URL patterns are also used by the snapshot importer.
  const recordUrl =
    source.id === 'glottolog' && record?.glottocode
      ? `https://glottolog.org/resource/languoid/id/${encodeURIComponent(record.glottocode)}`
      : source.id === 'grn' && record?.rolvCode
        ? `https://globalrecordings.net/en/language/${encodeURIComponent(record.rolvCode)}`
        : source.id === 'joshua' && record?.kind === 'language' && record.iso6393
          ? `https://joshuaproject.net/languages/${encodeURIComponent(record.iso6393)}`
          : source.url;
  const url = safeSourceUrl(recordUrl);
  const label = /joshua/i.test(source.name) ? 'Data provided by Joshua Project' : source.name;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {label} ↗
    </a>
  ) : (
    <span>{label}</span>
  );
}

export function AtlasRecordProfile({
  record,
  index,
  onClose,
}: {
  record: AtlasRecord;
  index: AtlasIndex;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [record.id]);
  const status = scriptureStatus(record);
  const countries = record.countryCodes.map(
    (code) => index.countries.find((country) => country.code === code)?.name ?? code
  );
  const locations = recordLocations(record);
  return (
    <article className="pa-profile" aria-label={`${record.name} profile`}>
      <div className="pa-section-top">
        <span className="pa-eyebrow">{KIND_LABELS[record.kind]}</span>
        <button type="button" aria-label="Close profile" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 ref={titleRef} tabIndex={-1}>
        {record.name}
      </h2>
      <p className="pa-profile-country">{countries.join(' · ') || 'Country not recorded'}</p>
      <div className="pa-scripture-status">
        <i
          className="pa-dot"
          style={{ background: SCRIPTURE_COLORS.dark[scriptureVisualCategory(status, record.kind)] }}
        />
        <strong>
          {record.kind === 'dialect' && status === 'unknown' ? 'Unverified' : SCRIPTURE_LABELS[status]}
        </strong>
      </div>
      {record.kind === 'people-group' && (
        <p className="pa-scope">
          Scripture status describes this people group’s reported primary language.
        </p>
      )}
      {record.kind === 'dialect' && record.scriptureScope !== 'dialect' && (
        <p className="pa-scope">
          Scripture coverage is not verified for this exact variety. A shared language code does not
          establish dialect coverage.
        </p>
      )}
      {isApproximate(record) && (
        <p className="pa-scope">
          Approximate placement:{' '}
          {record.location
            ? PRECISION_LABELS[record.location.precision].toLowerCase()
            : 'reference area'}
          .
        </p>
      )}
      <p className="pa-biography">{record.summary}</p>
      <dl className="pa-identifiers">
        {record.population !== null && (
          <div>
            <dt>Reported population</dt>
            <dd>{formatCount(record.population)}</dd>
          </div>
        )}
        {record.family && (
          <div>
            <dt>Family</dt>
            <dd>{record.family}</dd>
          </div>
        )}
        {record.iso6393 && (
          <div>
            <dt>ISO 639-3</dt>
            <dd>{record.iso6393}</dd>
          </div>
        )}
        {record.rolvCode && (
          <div>
            <dt>ROLV</dt>
            <dd>{record.rolvCode}</dd>
          </div>
        )}
        {record.glottocode && (
          <div>
            <dt>Glottocode</dt>
            <dd>{record.glottocode}</dd>
          </div>
        )}
      </dl>
      {record.languageContextStatus && (
        <div className="pa-context">
          <h3>Parent-language context</h3>
          <p>
            {SCRIPTURE_LABELS[record.languageContextStatus]}. This does not establish coverage for
            this exact variety.
          </p>
        </div>
      )}
      <details className="pa-detail-section">
        <summary>Reference locations · {formatCount(locations.length)}</summary>
        <p>Points show reference areas, not exact community boundaries.</p>
        {locations.length ? (
          locations.map((location, index) => (
            <div className="pa-location" key={`${location.sourceId}-${index}`}>
              <strong>{location.label}</strong>
              <span>{PRECISION_LABELS[location.precision]}</span>
              <small>
                {location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}°
              </small>
            </div>
          ))
        ) : (
          <p>No supported map placement is recorded.</p>
        )}
      </details>
      <div className="pa-profile-sources">
        <h3>Source records</h3>
        {index.sources
          .filter((source) => record.sourceIds.includes(source.id))
          .map((source) => (
            <SourceLink key={source.id} source={source} record={record} />
          ))}
      </div>
    </article>
  );
}

export function AtlasSources({ index, onClose }: { index: AtlasIndex; onClose: () => void }) {
  return (
    <section id="atlas-sources" className="pa-sources" aria-label="About the atlas data">
      <div className="pa-section-top">
        <h2>Behind the map</h2>
        <button type="button" aria-label="Close sources" onClick={onClose}>
          ×
        </button>
      </div>
      <p>
        The main map brings together {formatCount(index.counts.languages)} languages and{' '}
        {formatCount(index.counts.dialects)} dialects and varieties. These registry records are not a
        count of distinct living languages.
      </p>
      <p>
        Red means no known Scripture and includes unverified dialects. It does not confirm absence. Dialect status requires evidence for the exact variety.
        Mixed clusters use a neutral color.
      </p>
      <p>People-group research is retained for a future, separate map overlay.</p>
      <p>
        Spread dots show one representative point per mapped record and separate only at regional zoom for
        visibility. Recorded locations restore the source coordinates. Some locations are
        approximate, and records without a supported placement remain searchable.
      </p>
      <p>
        Records stay separate where source identities cannot be verified. The totals are source
        records, not a definitive count of distinct living languages.
      </p>
      <p>
        This atlas describes research coverage. It is separate from the translations available to
        read or hear in EveryBible.
      </p>
      {index.sources.map((source) => (
        <article key={source.id} className="pa-source">
          <SourceLink source={source} />
          <p>{source.attribution}</p>
          <small>
            {source.version} · Retrieved {source.retrievedAt.slice(0, 10)}
          </small>
          <details>
            <summary>Source & reuse notes</summary>
            <p>{source.license}</p>
            <p>{source.note}</p>
          </details>
        </article>
      ))}
      {index.notes.map((note, position) => (
        <p key={position} className="pa-source-note">
          {note}
        </p>
      ))}
    </section>
  );
}
