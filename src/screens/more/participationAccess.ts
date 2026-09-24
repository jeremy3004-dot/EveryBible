export type ParticipationAccessKind = 'translator' | 'scripture_council';

export interface ParticipationAccessResult {
  success: boolean;
  error?: string;
}

/** State the Settings access modal owns; the attempt ref makes a cancelled check stale. */
export interface ParticipationAccessModal {
  attemptRef: { current: number };
  setIsChecking: (isChecking: boolean) => void;
  setShowModal: (show: boolean) => void;
  setPasscode: (passcode: string) => void;
  setError: (error: string | null) => void;
}

export interface ParticipationAccessSubmit extends ParticipationAccessModal {
  kind: ParticipationAccessKind;
  isChecking: boolean;
  passcode: string;
  translationId: string;
  validateCouncil: (passcode: string) => Promise<ParticipationAccessResult>;
  validateTranslator: (
    passcode: string,
    translationId: string
  ) => Promise<ParticipationAccessResult>;
  enableCouncil: (passcode: string) => boolean;
  enableTranslator: (passcode: string) => boolean;
  setPreferences: (preferences: { chapterFeedbackEnabled: boolean }) => void;
  syncPreferences: () => Promise<unknown>;
  t: (key: 'feedback.incorrectCode' | 'common.unexpectedError') => string;
}

/** Closing the modal also discards any validation still in flight. */
export function closeParticipationAccess(modal: ParticipationAccessModal): void {
  modal.attemptRef.current += 1;
  modal.setShowModal(false);
  modal.setIsChecking(false);
  modal.setPasscode('');
  modal.setError(null);
}

/**
 * Validates a translator or Scripture council passcode with the server and only then
 * switches the participation mode. A rejection or network failure leaves the current
 * mode untouched, and a response that arrives after the modal was closed is ignored.
 */
export async function submitParticipationAccess(access: ParticipationAccessSubmit): Promise<void> {
  if (access.isChecking) {
    return;
  }

  const attempt = ++access.attemptRef.current;
  access.setIsChecking(true);
  access.setError(null);

  try {
    const result =
      access.kind === 'scripture_council'
        ? await access.validateCouncil(access.passcode)
        : await access.validateTranslator(access.passcode, access.translationId);

    if (attempt !== access.attemptRef.current) return;
    if (!result.success) {
      access.setError(
        result.error === 'Translator access denied' || result.error === 'Council access denied'
          ? access.t('feedback.incorrectCode')
          : access.t('common.unexpectedError')
      );
      return;
    }

    const enabled =
      access.kind === 'scripture_council'
        ? access.enableCouncil(access.passcode)
        : access.enableTranslator(access.passcode);
    if (!enabled) {
      access.setError(access.t('feedback.incorrectCode'));
      return;
    }
    access.setPreferences({ chapterFeedbackEnabled: access.kind === 'scripture_council' });
    void access.syncPreferences();
    access.setShowModal(false);
    access.setPasscode('');
  } finally {
    if (attempt === access.attemptRef.current) access.setIsChecking(false);
  }
}
