import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { useBibleStore } from '../../../stores/bibleStore';
import { useTranslatorReviewStore } from '../../../stores/translatorReviewStore';
import { syncPreferences } from '../../../services/sync';
import {
  appendAccessPasscodeDigit,
  validateScriptureCouncilPasscode,
  validateTranslatorReviewPasscode,
} from '../../../services/feedback';
import { announceLiveRegionText } from '../../../utils/a11y';
import {
  closeParticipationAccess,
  submitParticipationAccess,
  type ParticipationAccessKind,
} from '../participationAccess';
import { applyAccessKeypadKey, type AccessKeypadKey } from './settingsScreenModel';

/**
 * The passcode modal that unlocks translator review or the Scripture council. A
 * validation still in flight when the modal closes (or the screen unmounts) is
 * discarded through the attempt counter.
 */
export function useParticipationAccess() {
  const { t } = useTranslation();
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const currentTranslation = useBibleStore((state) => state.currentTranslation);
  const enableTranslatorReviewMode = useTranslatorReviewStore((state) => state.enableWithPasscode);
  const disableTranslatorReviewMode = useTranslatorReviewStore((state) => state.disable);
  const attemptRef = useRef(0);
  useEffect(
    () => () => {
      attemptRef.current += 1;
    },
    []
  );
  const [kind, setKind] = useState<ParticipationAccessKind>('translator');
  const [isVisible, setIsVisible] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // After an unlock whose team code does not open the translation being read: the translations
  // it does open, shown in place of the keypad so the translator can switch to one.
  const [coverage, setCoverage] = useState<string[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // The inline error carries accessibilityLiveRegion, which only Android honours;
  // VoiceOver hears it through this announcement.
  useEffect(() => {
    if (error) announceLiveRegionText(error);
  }, [error]);

  const modal = {
    attemptRef,
    setIsChecking,
    setShowModal: setIsVisible,
    setPasscode,
    setError,
    setCoverage,
  };

  const open = (accessKind: ParticipationAccessKind = 'translator') => {
    attemptRef.current += 1;
    setIsChecking(false);
    setKind(accessKind);
    setPasscode('');
    setError(null);
    setCoverage(null);
    setIsVisible(true);
  };

  const close = () => closeParticipationAccess(modal);

  const handleTranslatorReviewToggle = (enabled: boolean) => {
    if (enabled) {
      open();
      return;
    }

    disableTranslatorReviewMode();
    setIsVisible(false);
    setPasscode('');
    setError(null);
  };

  const pressKey = (key: AccessKeypadKey) => {
    setPasscode((current) => applyAccessKeypadKey(current, key, appendAccessPasscodeDigit));
    setError(null);
  };

  const submit = () =>
    submitParticipationAccess({
      ...modal,
      kind,
      isChecking,
      passcode,
      translationId: currentTranslation,
      validateCouncil: validateScriptureCouncilPasscode,
      validateTranslator: validateTranslatorReviewPasscode,
      enableCouncil: (code) => useTranslatorReviewStore.getState().enableCouncilWithPasscode(code),
      enableTranslator: enableTranslatorReviewMode,
      setPreferences,
      syncPreferences,
      t,
    });

  return {
    kind,
    isVisible,
    passcode,
    error,
    coverage,
    isChecking,
    currentTranslation,
    open,
    close,
    handleTranslatorReviewToggle,
    pressKey,
    submit,
  };
}
