import { AdminCard, DataTable } from '@/components/admin';
import { StatusPill } from '@/components/StatusPill';
import { setSharedPasscodeAllowedAction } from '@/app/(dashboard)/translator-access/actions';
import { formatDateTime } from '@/lib/format';
import type { SharedPasscodeSetting, SharedPasscodeUsage } from '@/lib/translator-access';

interface SharedPasscodePanelProps {
  setting: SharedPasscodeSetting;
  usage: SharedPasscodeUsage;
  /** Translations with feedback that no active team code covers. */
  translationsWithoutCode: string[];
  windowDays: number;
}

const usageColumns = [
  { key: 'translation', header: 'Translation asked for' },
  { key: 'allowed', header: 'Allowed' },
  { key: 'refused', header: 'Refused (switched off)' },
  { key: 'last', header: 'Last used' },
];

// Retiring the old shared TRANSLATOR_REVIEW_PASSCODE: who still lacks a team code, who still
// uses the shared one, and the switch that turns it off without a deploy.
export function SharedPasscodePanel({
  setting,
  usage,
  translationsWithoutCode,
  windowDays,
}: SharedPasscodePanelProps) {
  return (
    <AdminCard eyebrow="Shared passcode" title="Retire the old shared passcode">
      <p className="table-note">
        Status:{' '}
        {setting.allowed ? (
          <StatusPill tone="warning">Still allowed</StatusPill>
        ) : (
          <StatusPill tone="success">Off</StatusPill>
        )}
        {setting.updatedAt ? ` since ${formatDateTime(setting.updatedAt)}` : null}. The shared code
        only ever opens the translations in the TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS secret
        (default: bsb).
      </p>

      {translationsWithoutCode.length > 0 ? (
        <p className="notice notice--warning">
          {translationsWithoutCode.length === 1
            ? '1 translation with feedback has'
            : `${translationsWithoutCode.length} translations with feedback have`}{' '}
          no active team passcode: <strong>{translationsWithoutCode.join(', ')}</strong>. Create one
          for each before turning the shared passcode off, or their translators lose access.
        </p>
      ) : (
        <p className="notice notice--success">
          Every translation with feedback has an active team passcode.
        </p>
      )}

      {!usage.installed ? (
        <p className="table-note">
          Usage is not recorded yet: the 20260924035827 migration has not been applied.
        </p>
      ) : usage.total === 0 ? (
        <p className="table-note">
          Nobody has used the shared passcode in the last {windowDays} days.
        </p>
      ) : (
        <>
          <p className="table-note">
            Used {usage.truncated ? 'at least ' : ''}
            {usage.total} {usage.total === 1 ? 'time' : 'times'} in the last {windowDays} days, most
            recently {usage.lastUsedAt ? formatDateTime(usage.lastUsedAt) : 'unknown'}. Only the
            translation, request type and time are recorded.
          </p>
          <DataTable columns={usageColumns}>
            {usage.byTranslation.map((row) => (
              <tr key={row.translationId ?? '(none)'}>
                <td>{row.translationId ?? 'None (unlock only)'}</td>
                <td>{row.allowed}</td>
                <td>{row.refused}</td>
                <td>{formatDateTime(row.lastUsedAt)}</td>
              </tr>
            ))}
          </DataTable>
        </>
      )}

      {!setting.installed ? (
        <p className="notice notice--warning">
          The switch is not available until the 20260924035827 migration is applied. Until then the
          shared passcode stays allowed.
        </p>
      ) : setting.allowed ? (
        <form action={setSharedPasscodeAllowedAction} className="stack-form stack-form--compact">
          <input type="hidden" name="allowed" value="false" />
          <p className="notice notice--danger">
            Turning the shared passcode off takes effect on the next request, with no deploy. Anyone
            still using it is refused as if they typed a wrong code, and after 10 tries in 15
            minutes their device is locked out for a while. Team passcodes keep working. Check the
            usage above first.
          </p>
          <label className="checkbox-row">
            <input type="checkbox" name="confirm" value="yes" required />
            Every team that used the shared passcode has its own code now.
          </label>
          <div>
            <button type="submit" className="button button--primary">
              Turn off the shared passcode
            </button>
          </div>
        </form>
      ) : (
        <form action={setSharedPasscodeAllowedAction} className="stack-form stack-form--compact">
          <input type="hidden" name="allowed" value="true" />
          <p className="table-note">
            If a team was cut off, allow the shared passcode again while you give them a team code.
            When nobody has been refused for a while, unset the TRANSLATOR_REVIEW_PASSCODE secret.
          </p>
          <div>
            <button type="submit" className="button button-secondary">
              Allow the shared passcode again
            </button>
          </div>
        </form>
      )}
    </AdminCard>
  );
}
