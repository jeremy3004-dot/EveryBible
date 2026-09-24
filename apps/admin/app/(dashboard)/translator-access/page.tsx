import { AdminCard, DataTable, PageHeader } from '@/components/admin';
import { AdminSetupCard } from '@/components/AdminSetupCard';
import { StatusPill } from '@/components/StatusPill';
import {
  CreateTeamPasscodeForm,
  TeamPasscodeRowActions,
} from '@/components/TranslatorTeamPasscodeForms';
import { requireAdminIdentity } from '@/lib/admin-auth';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { getTranslationIdsWithFeedback, getTranslatorTeams } from '@/lib/translator-access';

interface TranslatorAccessPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function TranslatorAccessPage({ searchParams }: TranslatorAccessPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  await requireAdminIdentity();
  const resolvedSearchParams = await searchParams;
  const notice = firstParam(resolvedSearchParams.notice);
  const error = firstParam(resolvedSearchParams.error);
  const [teams, feedbackTranslationIds] = await Promise.all([
    getTranslatorTeams(),
    getTranslationIdsWithFeedback(),
  ]);

  const columns = [
    { key: 'team', header: 'Team' },
    { key: 'translations', header: 'Translations' },
    { key: 'created', header: 'Created' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions' },
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Translator access" title="One review passcode per translation team">
        A team passcode opens the translator review queue for its own translations only. Codes are
        six digits so every installed app build can enter them, are stored only as salted hashes,
        and are shown once when created or rotated.
      </PageHeader>
      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--warning">{error}</p> : null}

      <AdminCard eyebrow="New team" title="Create a team passcode">
        <p className="table-note">
          Translation IDs with feedback so far:{' '}
          {feedbackTranslationIds.length > 0 ? feedbackTranslationIds.join(', ') : 'none yet'}. IDs
          are case-sensitive.
        </p>
        <CreateTeamPasscodeForm />
      </AdminCard>

      <AdminCard eyebrow="Teams" title="Team passcodes">
        <DataTable columns={columns}>
          {teams.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="data-table__empty">
                No team passcodes yet. Until one exists, translators use the shared passcode, which
                only covers the translations in TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS.
              </td>
            </tr>
          ) : (
            teams.map((team) => (
              <tr key={team.id}>
                <td>{team.label}</td>
                <td>{team.translationIds.join(', ')}</td>
                <td>{formatDateTime(team.createdAt)}</td>
                <td>
                  {team.revokedAt ? (
                    <>
                      <StatusPill tone="default">Revoked</StatusPill>
                      <p className="table-note">{formatDateTime(team.revokedAt)}</p>
                    </>
                  ) : (
                    <StatusPill tone="success">Active</StatusPill>
                  )}
                </td>
                <td>
                  <TeamPasscodeRowActions
                    teamId={team.id}
                    label={team.label}
                    revoked={team.revokedAt !== null}
                  />
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </AdminCard>
    </div>
  );
}
