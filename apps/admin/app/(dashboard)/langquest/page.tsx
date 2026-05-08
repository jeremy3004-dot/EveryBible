import { AdminCard, DataTable, FilterForm, PageHeader } from '@/components/admin';
import { AdminSetupCard } from '@/components/AdminSetupCard';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { getLangQuestDashboard } from '@/lib/langquest/admin-data';
import type { LangQuestOwnershipState, LangQuestPublishState } from '@/lib/langquest/admin-data';

import {
  runLangQuestDiscoveryAction,
  runLangQuestSelectedIngestAction,
  selectLangQuestTranslationAction,
  updateLangQuestPublishStateAction,
  updateLangQuestOwnershipAction,
} from './actions';

interface LangQuestPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

const ownershipFilterOptions: Array<LangQuestOwnershipState | 'all'> = [
  'all',
  'needs_review',
  'ours',
  'not_ours',
  'blocked',
  'archived',
];

const publishFilterOptions: Array<LangQuestPublishState | 'all'> = [
  'all',
  'candidate',
  'ready',
  'approved',
  'published',
  'archived',
  'rolled_back',
];

const publishTransitionOptions: LangQuestPublishState[] = [
  'ready',
  'approved',
  'published',
  'archived',
  'rolled_back',
];

function parseOwnershipFilter(value: string | null): LangQuestOwnershipState | 'all' {
  return ownershipFilterOptions.includes(value as LangQuestOwnershipState | 'all')
    ? (value as LangQuestOwnershipState | 'all')
    : 'all';
}

function parsePublishFilter(value: string | null): LangQuestPublishState | 'all' {
  return publishFilterOptions.includes(value as LangQuestPublishState | 'all')
    ? (value as LangQuestPublishState | 'all')
    : 'all';
}

export default async function LangQuestPage({ searchParams }: LangQuestPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const params = await searchParams;
  const notice = firstParam(params.notice);
  const error = firstParam(params.error);
  const query = firstParam(params.query) ?? '';
  const ownership = parseOwnershipFilter(firstParam(params.ownership));
  const publish = parsePublishFilter(firstParam(params.publish));
  const dashboard = await getLangQuestDashboard({
    ownership,
    publish,
    query,
  });

  const candidateColumns = [
    { key: 'candidate', header: 'Candidate' },
    { key: 'coverage', header: 'Coverage' },
    { key: 'ownership', header: 'Ownership' },
    { key: 'decision', header: 'Decision' },
    { key: 'select', header: 'Select' },
  ];

  const selectedColumns = [
    { key: 'translation', header: 'Selected translation' },
    { key: 'state', header: 'State' },
    { key: 'publish', header: 'Publish' },
    { key: 'approval', header: 'Approval' },
    { key: 'updated', header: 'Updated' },
    { key: 'run', header: 'Run' },
  ];

  const artifactColumns = [
    { key: 'chapter', header: 'Chapter' },
    { key: 'status', header: 'Status' },
    { key: 'segments', header: 'Segments' },
    { key: 'manifest', header: 'Manifest' },
    { key: 'updated', header: 'Updated' },
  ];

  const runColumns = [
    { key: 'run', header: 'Run' },
    { key: 'status', header: 'Status' },
    { key: 'provider', header: 'Provider' },
    { key: 'created', header: 'Created' },
    { key: 'failure', header: 'Failure' },
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="LangQuest" title="Translation ownership and R2 ingestion control">
        Review discovered LangQuest Bible translations, mark which ones are ours, select them for
        recurring ingestion, and monitor the 24-hour pull into R2.
      </PageHeader>

      {notice ? <div className="notice notice--success">{notice}</div> : null}
      {error ? <div className="notice notice--danger">{error}</div> : null}

      <AdminCard eyebrow="Filters" title="Operator queue">
        <FilterForm>
          <input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search project, language, candidate, or translation"
          />
          <select name="ownership" defaultValue={ownership}>
            {ownershipFilterOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All ownership' : option}
              </option>
            ))}
          </select>
          <select name="publish" defaultValue={publish}>
            {publishFilterOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All publish states' : option}
              </option>
            ))}
          </select>
          <button type="submit" className="button">
            Filter
          </button>
        </FilterForm>
      </AdminCard>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Candidates</span>
          <strong>{dashboard.candidates.length}</strong>
        </article>
        <article className="metric-card">
          <span>Ours</span>
          <strong>
            {dashboard.candidates.filter((candidate) => candidate.ownershipState === 'ours').length}
          </strong>
        </article>
        <article className="metric-card">
          <span>Selected</span>
          <strong>{dashboard.selectedTranslations.length}</strong>
        </article>
        <article className="metric-card">
          <span>Ready chapters</span>
          <strong>
            {dashboard.artifacts.filter((artifact) => artifact.artifactState === 'ready').length}
          </strong>
        </article>
      </section>

      <AdminCard eyebrow="Control" title="24-hour selected-translation pull">
        <div className="stack-form stack-form--compact">
          <p className="page-copy">
            The scheduled Trigger.dev task runs every 24 hours in production. Use this manual run
            only when an operator needs a fresh ingest pass before the next scheduled window.
          </p>
          <form action={runLangQuestSelectedIngestAction}>
            <button type="submit" className="button">
              Run selected ingest now
            </button>
          </form>
          <form action={runLangQuestDiscoveryAction}>
            <button type="submit" className="button">
              Refresh candidates
            </button>
          </form>
        </div>
      </AdminCard>

      <AdminCard eyebrow="Checklist" title="Translation candidates">
        {dashboard.candidates.length === 0 ? (
          <p className="page-copy">
            No LangQuest candidates have been discovered yet. Once the discovery workflow is
            connected, candidates will appear here for ownership review.
          </p>
        ) : (
          <DataTable columns={candidateColumns}>
            {dashboard.candidates.map((candidate) => (
              <tr key={candidate.id}>
                <td>
                  <strong>{candidate.projectName}</strong>
                  <p className="table-note">
                    {candidate.languageName} ({candidate.languageCode}) · {candidate.projectId}
                  </p>
                  <p className="table-note">
                    Last discovered {formatDateTime(candidate.lastDiscoveredAt)}
                  </p>
                </td>
                <td>
                  {candidate.bookCount} books
                  <p className="table-note">{candidate.chapterCount} chapters</p>
                </td>
                <td>
                  {candidate.ownershipState}
                  <p className="table-note">{candidate.ownershipNotes ?? 'No notes'}</p>
                </td>
                <td>
                  <form
                    action={updateLangQuestOwnershipAction}
                    className="stack-form stack-form--compact"
                  >
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <select name="ownershipState" defaultValue={candidate.ownershipState}>
                      <option value="needs_review">Needs review</option>
                      <option value="ours">Ours</option>
                      <option value="not_ours">Not ours</option>
                      <option value="blocked">Blocked</option>
                      <option value="archived">Archived</option>
                    </select>
                    <input name="reason" placeholder="Reason or evidence note" required />
                    <button type="submit" className="button">
                      Save
                    </button>
                  </form>
                </td>
                <td>
                  <form
                    action={selectLangQuestTranslationAction}
                    className="stack-form stack-form--compact"
                  >
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <input name="translationId" placeholder="Catalog translation id (optional)" />
                    <input name="notes" placeholder="Selection notes" />
                    <button
                      type="submit"
                      className="button"
                      disabled={candidate.ownershipState !== 'ours'}
                    >
                      Select
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminCard>

      <AdminCard eyebrow="Selected" title="Translations queued for ingestion">
        {dashboard.selectedTranslations.length === 0 ? (
          <p className="page-copy">No translations have been selected for recurring ingestion.</p>
        ) : (
          <DataTable columns={selectedColumns}>
            {dashboard.selectedTranslations.map((selected) => (
              <tr key={selected.id}>
                <td>
                  <strong>{selected.translationId ?? 'Catalog id pending'}</strong>
                  <p className="table-note">{selected.notes ?? selected.id}</p>
                </td>
                <td>{selected.selectionState}</td>
                <td>
                  {selected.publishState}
                  <p className="table-note">
                    {selected.readyArtifactCount} ready / {selected.totalArtifactCount} recent
                    artifacts
                  </p>
                </td>
                <td>
                  <form
                    action={updateLangQuestPublishStateAction}
                    className="stack-form stack-form--compact"
                  >
                    <input type="hidden" name="selectedTranslationId" value={selected.id} />
                    <select name="publishState" defaultValue={selected.publishState}>
                      {publishTransitionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input name="reason" placeholder="Approval, publish, or rollback note" required />
                    <button type="submit" className="button">
                      Update
                    </button>
                  </form>
                </td>
                <td>{formatDateTime(selected.updatedAt)}</td>
                <td>
                  <form action={runLangQuestSelectedIngestAction}>
                    <input type="hidden" name="selectedTranslationId" value={selected.id} />
                    <button type="submit" className="button">
                      Run
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminCard>

      <AdminCard eyebrow="Artifacts" title="Recent chapter artifacts">
        {dashboard.artifacts.length === 0 ? (
          <p className="page-copy">No chapter artifacts have been written yet.</p>
        ) : (
          <DataTable columns={artifactColumns}>
            {dashboard.artifacts.map((artifact) => (
              <tr key={artifact.id}>
                <td>
                  {artifact.bookId} {artifact.chapter}
                </td>
                <td>
                  {artifact.artifactState}
                  <p className="table-note">{artifact.failureReason ?? artifact.publishState}</p>
                </td>
                <td>{artifact.segmentCount}</td>
                <td>{artifact.manifestR2Key ?? 'Pending'}</td>
                <td>{formatDateTime(artifact.updatedAt)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminCard>

      <AdminCard eyebrow="Runs" title="Recent workflow runs">
        {dashboard.workflowRuns.length === 0 ? (
          <p className="page-copy">No LangQuest workflow runs have been created yet.</p>
        ) : (
          <DataTable columns={runColumns}>
            {dashboard.workflowRuns.map((run) => (
              <tr key={run.id}>
                <td>
                  <strong>{run.id}</strong>
                  <p className="table-note">{run.providerRunId ?? 'No provider run id yet'}</p>
                </td>
                <td>{run.status}</td>
                <td>
                  {run.provider}
                  <p className="table-note">{run.triggerSource}</p>
                </td>
                <td>{formatDateTime(run.createdAt)}</td>
                <td>{run.failureMessage ?? 'None'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminCard>
    </div>
  );
}
