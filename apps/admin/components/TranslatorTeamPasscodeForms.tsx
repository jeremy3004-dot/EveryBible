'use client';

import { useActionState, useState, type FormEvent } from 'react';

import {
  createTranslatorTeamPasscodeAction,
  revokeTranslatorTeamPasscodeAction,
  rotateTranslatorTeamPasscodeAction,
} from '@/app/(dashboard)/translator-access/actions';
import type { TeamPasscodeActionResult } from '@/lib/translator-access';

type PasscodeState = TeamPasscodeActionResult | null;

// The passcode exists only in this component's state. Leaving or reloading the page drops it,
// which is the "shown once" guarantee: the server keeps only a salted hash.
function PasscodeReveal({ result }: { result: TeamPasscodeActionResult }) {
  const [copied, setCopied] = useState(false);
  if (!result.passcode) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.passcode ?? '');
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="notice notice--success passcode-reveal" role="status">
      <p>
        New passcode for <strong>{result.label}</strong> ({result.translationIds.join(', ')}):
      </p>
      <p className="passcode-reveal__code">
        <code>{result.passcode}</code>
      </p>
      <p className="table-note">
        This is the only time it is shown. Give it to the team now. If it is lost, rotate it.
      </p>
      <button type="button" className="button button-secondary" onClick={copy}>
        {copied ? 'Copied' : 'Copy passcode'}
      </button>
    </div>
  );
}

function ActionError({ state }: { state: PasscodeState }) {
  return state && !state.ok && state.error ? (
    <p className="notice notice--warning" role="alert">
      {state.error}
    </p>
  ) : null;
}

export function CreateTeamPasscodeForm() {
  const [state, formAction, pending] = useActionState(
    (_previous: PasscodeState, formData: FormData) => createTranslatorTeamPasscodeAction(formData),
    null
  );

  return (
    <div className="stack-form stack-form--compact">
      <form action={formAction} className="stack-form stack-form--compact">
        <label>
          Team name
          <input name="label" required maxLength={120} placeholder="Nepali ULB translation team" />
        </label>
        <label>
          Translation IDs (comma-separated, exactly as the app uses them)
          <input name="translationIds" required placeholder="npiulb, npi-audio" />
        </label>
        <div>
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? 'Creating…' : 'Create passcode'}
          </button>
        </div>
      </form>
      <ActionError state={state} />
      {state?.ok ? <PasscodeReveal result={state} /> : null}
    </div>
  );
}

export function TeamPasscodeRowActions({
  teamId,
  label,
  revoked,
}: {
  teamId: string;
  label: string;
  revoked: boolean;
}) {
  const [state, rotateAction, pending] = useActionState(
    (_previous: PasscodeState, formData: FormData) => rotateTranslatorTeamPasscodeAction(formData),
    null
  );

  const confirmFirst = (message: string) => (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };

  return (
    <div className="stack-form stack-form--compact">
      {revoked ? null : (
        <div className="stack-inline">
          <form
            action={rotateAction}
            onSubmit={confirmFirst(
              `Rotate the passcode for ${label}? The current code stops working immediately.`
            )}
          >
            <input type="hidden" name="teamId" value={teamId} />
            <button type="submit" className="button button-secondary" disabled={pending}>
              {pending ? 'Rotating…' : 'Rotate'}
            </button>
          </form>
          <form
            action={revokeTranslatorTeamPasscodeAction}
            onSubmit={confirmFirst(`Revoke the passcode for ${label}? The team loses access.`)}
          >
            <input type="hidden" name="teamId" value={teamId} />
            <button type="submit" className="button button-secondary">
              Revoke
            </button>
          </form>
        </div>
      )}
      <ActionError state={state} />
      {state?.ok ? <PasscodeReveal result={state} /> : null}
    </div>
  );
}
