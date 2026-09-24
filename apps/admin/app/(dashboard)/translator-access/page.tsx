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
        digits, stored only as salted hashes, and shown once when created or rotated.
      </PageHeader>
      {notice ? <p className="notice notice--success">{notice}</p> : null}
      {error ? <p className="notice notice--warning">{error}</p> : null}

      <AdminCard eyebrow="New team" title="Create a team passcode">
        <p className="table-note">
          Translation IDs with feedback so far:{' '}
          {feedbackTranslationIds.length > 0 ? feedbackTranslationIds.join(', ') : 'none yet'}. IDs
          are case-sensitive.
        </p>
        <p className="table-note">
          <strong>Code length.</strong> Keep 6 digits for now: app builds from before the 2026-09-24
          keypad change stop at six digits, so a longer code cannot be typed on them. Six digits
          rely on the lockout (10 wrong tries per 15 minutes per client) to stop guessing, which
          someone switching networks can spread out. Once nearly every translator has installed the
          app release after that change, choose 10 or 12 digits for new codes and rotate existing
          teams to a longer code.
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
