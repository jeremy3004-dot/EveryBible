import { ProjectProgress } from './ProjectProgress';
import { useEffect, useRef } from 'react';
import {
  formatCount,
  isApproximate,
  KIND_LABELS,
  PRECISION_LABELS,
  recordLocations,
  safeSourceUrl,
  scriptureStatus,
} from '../../../admin/lib/language-atlas/model';
import {
  SCRIPTURE_COLORS,
  scriptureVisualCategory,
} from '../../../admin/lib/language-atlas/presentation';
import type { AtlasIndex, AtlasRecord, AtlasSource } from '../../../admin/lib/language-atlas/types';
import {
  profileDisplayName,
  profileScriptureLabel,
  profileCountryGroups,
  profileIdentity,
  profilePopulation,
  profileSpokenLocations,
} from '../../lib/public-atlas-profile';

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

function CountryList({
  countries,
}: {
  countries: ReturnType<typeof profileCountryGroups>['visible'];
}) {
  return (
    <ul className="pa-profile-countries">
      {countries.map((country, index) => (
        <li key={`${country.code}-${index}`}>
          {country.flag && (
            <span className="pa-country-flag" aria-hidden="true">
              {country.flag}
            </span>
          )}
          <span>{country.name}</span>
        </li>
      ))}
    </ul>
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
  const countryGroups = profileCountryGroups(record, index);
  const population = profilePopulation(record);
  const spokenLocations = profileSpokenLocations(record, index);
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
        {profileDisplayName(record, index)}
      </h2>
      <p className="pa-profile-identity">{profileIdentity(record, index)}</p>
      <ProjectProgress recordId={record.id} />
      <section className="pa-profile-where" aria-labelledby="pa-where-spoken-heading">
        <h3 id="pa-where-spoken-heading">Where spoken</h3>
        {countryGroups.visible.length ? (
          <CountryList countries={countryGroups.visible} />
        ) : (
          <p className="pa-scope">Country not recorded.</p>
        )}
        {countryGroups.remaining.length > 0 && (
          <details key={record.id} className="pa-profile-country-more">
            <summary>
              {countryGroups.remaining.length} more{' '}
              {countryGroups.remaining.length === 1 ? 'country' : 'countries'}
            </summary>
            <CountryList countries={countryGroups.remaining} />
          </details>
        )}
        {spokenLocations.length > 0 && (
          <p className="pa-profile-spoken-locations">
            <span className="pa-profile-spoken-label">Area:</span> {spokenLocations.join(' · ')}
          </p>
        )}
      </section>
      <div className="pa-scripture-status">
        <i
          className="pa-dot"
          style={{ background: SCRIPTURE_COLORS.dark[scriptureVisualCategory(status)] }}
        />
        <strong>{profileScriptureLabel(record, index)}</strong>
      </div>
      {record.kind === 'people-group' && (
        <p className="pa-scope">
          Scripture status describes this people group’s reported primary language.
        </p>
      )}
      {isApproximate(record) && <p className="pa-scope">Approximate map location</p>}
      <dl className="pa-identifiers">
        {population && (
          <div>
            <dt>{population.label}</dt>
            <dd>{population.value}</dd>
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
      <p>Explore languages and dialects. Select a dot or search to learn more.</p>
      <p>
        Red means no known Scripture in our sources, not confirmed absence. Dialect coverage may
        differ from its parent language. Some locations are approximate.
      </p>
      <p>Map entries do not indicate which Bibles are available in the EveryBible app.</p>
      <details>
        <summary>Sources & credits</summary>
        {index.sources.map((source) => (
          <article key={source.id} className="pa-source">
            <SourceLink source={source} />
            <p>{source.attribution}</p>
            <small>{source.license}</small>
          </article>
        ))}
        <p className="pa-source-note">
          Joshua Project data is used with permission for noncommercial ministry research and
          education.
        </p>
      </details>
    </section>
  );
}
