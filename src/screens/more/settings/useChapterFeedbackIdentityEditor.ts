import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { useTranslatorReviewStore } from '../../../stores/translatorReviewStore';
import { syncPreferences } from '../../../services/sync';
import { normalizeChapterFeedbackIdentity } from '../../../services/feedback/chapterFeedbackIdentity';
import { announceLiveRegionText } from '../../../utils/a11y';

/**
 * The name-and-role editor behind the feedback identity row. Saving writes both
 * preferences and syncs them; the modal stays open with an error until that succeeds.
 */
export function useChapterFeedbackIdentityEditor(chapterFeedbackEnabled: boolean) {
  const { t } = useTranslation();
  const savedName = useAuthStore((state) => state.preferences.chapterFeedbackName);
  const savedRole = useAuthStore((state) => state.preferences.chapterFeedbackRole);
  const displayName = useAuthStore((state) => state.user?.displayName);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const [isVisible, setIsVisible] = useState(false);
  const [pendingEnable, setPendingEnable] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The inline error carries accessibilityLiveRegion, which only Android honours;
  // VoiceOver hears it through this announcement.
  useEffect(() => {
    if (error) announceLiveRegionText(error);
  }, [error]);

  const savedIdentity = normalizeChapterFeedbackIdentity({
    name: savedName ?? '',
    role: savedRole ?? '',
  });

  const open = (enableAfterSave: boolean) => {
    setPendingEnable(enableAfterSave);
    setName(savedName ?? displayName ?? '');
    setRole(savedRole ?? '');
    setError(null);
    setIsVisible(true);
  };

  const close = () => {
    if (isSaving) {
      return;
    }

    setIsVisible(false);
    setPendingEnable(false);
    setError(null);
  };

  const changeName = (value: string) => {
    setName(value);
    if (error) {
      setError(null);
    }
  };

  const changeRole = (value: string) => {
    setRole(value);
    if (error) {
      setError(null);
    }
  };

  const save = async () => {
    const identity = normalizeChapterFeedbackIdentity({ name, role });

    if (!identity) {
      setError(t('settings.chapterFeedbackIdentityRequired'));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      setPreferences({
        chapterFeedbackName: identity.name,
        chapterFeedbackRole: identity.role,
        chapterFeedbackEnabled: pendingEnable ? true : chapterFeedbackEnabled,
      });

      const result = await syncPreferences();
      if (!result.success) {
        setError(t('common.unexpectedError'));
        return;
      }

      if (pendingEnable) useTranslatorReviewStore.getState().enableCommunityFeedback();
      setIsVisible(false);
      setPendingEnable(false);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    savedIdentity,
    isVisible,
    name,
    role,
    error,
    isSaving,
    open,
    close,
    changeName,
    changeRole,
    save,
  };
}
