'use client';

import { useEffect, useState } from 'react';
import { scriptureVisualCategory } from '../../lib/language-atlas/presentation';
import {
  formatCount,
  KIND_LABELS,
  PRECISION_LABELS,
  recordLocations,
  safeSourceUrl,
  SCRIPTURE_LABELS,
  scriptureStatus,
} from '@/lib/language-atlas/model';
import type { AtlasDetail, AtlasRecord, AtlasSource } from '@/lib/language-atlas/types';

export function SourceLink({ url, children }: { url: string; children: React.ReactNode }) {
  const safe = safeSourceUrl(url);
  return safe ? (
    <a href={safe} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : (
    <span>{children}</span>
  );
}

interface Props {
  record: AtlasRecord | null;
  sources: AtlasSource[];
  countries: Map<string, string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function RecordInspector({ record, sources, countries, onSelect, onClose }: Props) {
  return (
    <div className="la-inspector" id="language-profile" aria-label="Selected language profile">
      {record ? (
        <Profile
          key={record.id}
          record={record}
          sources={sources}
          countries={countries}
          onSelect={onSelect}
          onClose={onClose}
        />
      ) : (
        <div className="la-inspector-empty">
          <span className="eyebrow">Record profile</span>
          <div className="la-profile-symbol" aria-hidden="true">
            Aa<span>あ</span>
          </div>
          <h2>A name is a beginning.</h2>
          <p>Select a point or a result to explore its language, community and Scripture story.</p>
          <div className="la-inspector-guide">
            <span>01</span>
            <p>Find a language, variety or people group.</p>
            <span>02</span>
            <p>Explore its reference locations.</p>
            <span>03</span>
            <p>Follow the evidence to its sources.</p>
          </div>
          <p className="la-fine">
            Distinct source records stay distinct. Unknown Scripture status does not mean no
            Scripture exists.
          </p>
        </div>
      )}
    </div>
  );
}

function Profile({
  record,
  sources,
  countries,
  onSelect,
  onClose,
}: Omit<Props, 'record'> & { record: AtlasRecord }) {
  const [result, setResult] = useState<{ detail?: AtlasDetail; error?: string }>({});
  const [retry, setRetry] = useState(0);
  const [relatedPage, setRelatedPage] = useState(0);
  const [locationPage, setLocationPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`/api/language-atlas/${encodeURIComponent(record.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The source profile could not load.');
        return (await response.json()) as AtlasDetail;
      })
      .then((detail) => {
        if (active && detail.id === record.id) setResult({ detail });
        else if (active)
          setResult({ error: 'The source returned a different profile. Please retry.' });
      })
      .catch((error: Error) => {
        if (active && error.name !== 'AbortError') setResult({ error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [record.id, retry]);
  const status = scriptureStatus(record);
  const locations = recordLocations(record);
  const detail = result.detail;
  const sourceName = (id: string) => sources.find((source) => source.id === id)?.name ?? id;
  const related = detail?.related ?? [];
  return (
    <>
      <div className="la-inspector-title">
        <span className="eyebrow">{KIND_LABELS[record.kind]}</span>
        <button
          className="la-text-button"
          type="button"
          onClick={onClose}
          aria-label="Back to records"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      </div>
      <h2>{record.name}</h2>
      <p className="la-profile-countries">
        {record.countryCodes.map((code) => countries.get(code) ?? code).join(' · ') ||
          'Country not recorded'}
      </p>
      <div className="la-status">
        <i className={`la-dot la-dot--${scriptureVisualCategory(status, record.kind)}`} />
        <strong>
          {record.kind === 'dialect' && status === 'unknown' ? 'Unverified' : SCRIPTURE_LABELS[status]}
        </strong>
        {record.kind === 'people-group' && <span>Primary-language context</span>}
      </div>
      {record.kind === 'dialect' && (
        <p className="la-scope-note">
          {status === 'unknown'
            ? 'Scripture coverage has not been verified for this exact variety.'
            : 'This claim is scoped to this variety.'}
        </p>
      )}
      {record.languageContextStatus && (
        <div className="la-context">
          <span className="eyebrow">Language context</span>
          <strong>{SCRIPTURE_LABELS[record.languageContextStatus]}</strong>
          <p>
            Reported for the associated language. This does not establish coverage of this exact{' '}
            {record.kind === 'people-group' ? 'community' : 'variety'}.
          </p>
        </div>
      )}
      <section className="la-profile-section">
        <h3>About this record</h3>
        <p>{detail?.biography || record.summary}</p>
        {record.aliases.length > 0 && (
          <details>
            <summary>
              {formatCount(record.aliases.length)} alternate{' '}
              {record.aliases.length === 1 ? 'name' : 'names'}
            </summary>
            <p>{record.aliases.join(' · ')}</p>
          </details>
        )}
      </section>
      <dl className="la-identifiers">
        {record.iso6393 && (
          <div>
            <dt>ISO 639-3</dt>
            <dd>{record.iso6393}</dd>
          </div>
        )}
        {record.glottocode && (
          <div>
            <dt>Glottocode</dt>
            <dd>{record.glottocode}</dd>
          </div>
        )}
        {record.rolvCode && (
          <div>
            <dt>ROLV</dt>
            <dd>{record.rolvCode}</dd>
          </div>
        )}
        <div>
          <dt>Record ID</dt>
          <dd>{record.id}</dd>
        </div>
        {record.family && (
          <div>
            <dt>Family</dt>
            <dd>{record.family}</dd>
          </div>
        )}
        {record.parentId && (
          <div>
            <dt>Parent</dt>
            <dd>
              <button
                className="la-inline-link"
                type="button"
                onClick={() => onSelect(record.parentId!)}
              >
                {record.parentId}
              </button>
            </dd>
          </div>
        )}
        {record.population !== null && (
          <div>
            <dt>{record.kind === 'people-group' ? 'Group population' : 'Reported population'}</dt>
            <dd>{formatCount(record.population)}</dd>
          </div>
        )}
      </dl>
      <section className="la-profile-section">
        <h3>Location & precision</h3>
        {locations.length ? (
          <>
            <p>{PRECISION_LABELS[locations[0].precision]}</p>
            <p className="la-fine">
              {locations[0].label} · {locations[0].latitude.toFixed(3)}°,{' '}
              {locations[0].longitude.toFixed(3)}°
            </p>
            <p className="la-fine">
              {formatCount(locations.length)} supplied reference{' '}
              {locations.length === 1 ? 'point' : 'points'}. A country association can extend beyond
              the representative location.
            </p>
            {locations.length > 1 && (
              <details>
                <summary>Browse all reference locations</summary>
                <div className="la-reference-locations">
                  {locations
                    .slice(locationPage * 6, (locationPage + 1) * 6)
                    .map((location, index) => (
                      <div key={`${locationPage}:${index}`}>
                        <strong>{location.label}</strong>
                        <p>{PRECISION_LABELS[location.precision]}</p>
                        <p>
                          {location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}° ·{' '}
                          {sourceName(location.sourceId)}
                        </p>
                      </div>
                    ))}
                </div>
                {locations.length > 6 && (
                  <div className="la-pagination">
                    <button
                      type="button"
                      disabled={locationPage === 0}
                      onClick={() => setLocationPage((page) => page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      {locationPage + 1} / {Math.ceil(locations.length / 6)}
                    </span>
                    <button
                      type="button"
                      disabled={(locationPage + 1) * 6 >= locations.length}
                      onClick={() => setLocationPage((page) => page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </details>
            )}
          </>
        ) : (
          <p>No supported reference location. This record remains part of the searchable atlas.</p>
        )}
      </section>
      {!detail && !result.error && (
        <p className="la-detail-loading" role="status">
          Loading source evidence…
        </p>
      )}
      {result.error && (
        <div className="la-load-error" role="alert">
          <p>{result.error}</p>
          <button
            type="button"
            onClick={() => {
              setResult({});
              setRetry((value) => value + 1);
            }}
          >
            Retry profile
          </button>
        </div>
      )}
      {detail && (
        <>
          {detail.evidence.length > 0 && (
            <details className="la-profile-section la-evidence-section">
              <summary>
                <span>Source evidence</span>
                <small>{formatCount(detail.evidence.length)} claims · Expand</small>
              </summary>
              <div className="la-evidence">
                {detail.evidence.map((evidence, index) => (
                  <div key={index}>
                    <span className="eyebrow">{evidence.label}</span>
                    <p>{evidence.value}</p>
                    {evidence.scope && <small>Scope: {evidence.scope}</small>}
                    <SourceLink url={evidence.url}>{sourceName(evidence.sourceId)}</SourceLink>
                  </div>
                ))}
              </div>
            </details>
          )}
          {related.length > 0 && (
            <section className="la-profile-section">
              <h3>
                Related records <span className="la-count">{formatCount(related.length)}</span>
              </h3>
              <div className="la-related">
                {related.slice(relatedPage * 12, (relatedPage + 1) * 12).map((item) => (
                  <button
                    type="button"
                    key={`${item.id}:${item.relationship}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <span>
                      {item.name}
                      <small>
                        {item.relationship} · {KIND_LABELS[item.kind]}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
              {related.length > 12 && (
                <div className="la-pagination">
                  <button
                    type="button"
                    disabled={relatedPage === 0}
                    onClick={() => setRelatedPage((page) => page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {relatedPage + 1} / {Math.ceil(related.length / 12)}
                  </span>
                  <button
                    type="button"
                    disabled={(relatedPage + 1) * 12 >= related.length}
                    onClick={() => setRelatedPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}
          {detail.notes.length > 0 && (
            <section className="la-profile-section">
              <h3>Reading this evidence</h3>
              {detail.notes.map((note, index) => (
                <p className="la-fine" key={index}>
                  {note}
                </p>
              ))}
            </section>
          )}
          {detail.links.length > 0 && (
            <section className="la-profile-section">
              <h3>Explore the sources</h3>
              <div className="la-source-links">
                {detail.links.map((link, index) => (
                  <SourceLink key={index} url={link.url}>
                    {link.label}
                  </SourceLink>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {record.needsReview && (
        <p className="la-scope-note">
          This source record is flagged for review. Check the evidence before making a coverage
          decision.
        </p>
      )}
      <p className="la-profile-footer">Sources: {record.sourceIds.map(sourceName).join(' · ')}</p>
    </>
  );
}
