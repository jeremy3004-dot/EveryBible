import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { useTranslatorReviewStore } from '../../../stores/translatorReviewStore';
import { syncPreferences } from '../../../services/sync';
import { normalizeChapterFeedbackIdentity } from '../../../services/feedback/chapterFeedbackIdentity';
import { announceLiveRegionText } from '../../../utils/a11y';

interface IdentityDraftOwner {
  uid: string | null;
  authGeneration: number;
  enableAfterSave: boolean;
}

/**
 * The name-and-role editor behind the feedback identity row. Saving writes both
 * preferences and syncs them; the modal stays open with an error until that succeeds.
 */
export function useChapterFeedbackIdentityEditor(chapterFeedbackEnabled: boolean) {
  const { t } = useTranslation();
  const savedName = useAuthStore((state) => state.preferences.chapterFeedbackName);
  const savedRole = useAuthStore((state) => state.preferences.chapterFeedbackRole);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const [isVisible, setIsVisible] = useState(false);
  const [draft, setDraft] = useState<IdentityDraftOwner | null>(null);
  const draftRef = useRef<IdentityDraftOwner | null>(null);
  const requestRef = useRef<object | null>(null);
  const mountedRef = useRef(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const clearDraft = () => {
    draftRef.current = null;
    requestRef.current = null;
    setDraft(null);
    setIsVisible(false);
    setName('');
    setRole('');
    setError(null);
    setIsSaving(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    // Invalidate synchronously: an old callback may run before React commits the next render.
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        state.user?.uid !== previous.user?.uid ||
        state.authGeneration !== previous.authGeneration
      ) {
        clearDraft();
      }
    });
    return () => {
      mountedRef.current = false;
      draftRef.current = null;
      requestRef.current = null;
      unsubscribe();
    };
  }, []);

  const isCurrentOwner = (owner: Pick<IdentityDraftOwner, 'uid' | 'authGeneration'>) => {
    const current = useAuthStore.getState();
    return (
      mountedRef.current &&
      (current.user?.uid ?? null) === owner.uid &&
      current.authGeneration === owner.authGeneration
    );
  };
  const isCurrentDraft = (candidate: IdentityDraftOwner | null): candidate is IdentityDraftOwner =>
    candidate !== null && draftRef.current === candidate && isCurrentOwner(candidate);

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
    if (!isCurrentOwner({ uid, authGeneration }) || requestRef.current) return;
    const current = useAuthStore.getState();
    const owner = { uid, authGeneration, enableAfterSave };
    draftRef.current = owner;
    setDraft(owner);
    setName(current.preferences.chapterFeedbackName ?? current.user?.displayName ?? '');
    setRole(current.preferences.chapterFeedbackRole ?? '');
    setError(null);
    setIsVisible(true);
  };

  const close = () => {
    if (!isCurrentDraft(draft) || requestRef.current) return;
    clearDraft();
  };

  const changeName = (value: string) => {
    if (!isCurrentDraft(draft) || requestRef.current) return;
    setName(value);
    setError(null);
  };

  const changeRole = (value: string) => {
    if (!isCurrentDraft(draft) || requestRef.current) return;
    setRole(value);
    setError(null);
  };

  const save = async () => {
    if (!isCurrentDraft(draft) || requestRef.current) return;
    const identity = normalizeChapterFeedbackIdentity({ name, role });
    if (!identity) {
      setError(t('settings.chapterFeedbackIdentityRequired'));
      return;
    }

    const request = {};
    requestRef.current = request;
    const isCurrentRequest = () => requestRef.current === request && isCurrentDraft(draft);
    setIsSaving(true);
    setError(null);

    try {
      setPreferences({
        chapterFeedbackName: identity.name,
        chapterFeedbackRole: identity.role,
        chapterFeedbackEnabled: draft.enableAfterSave ? true : chapterFeedbackEnabled,
      });
      if (!isCurrentRequest()) return;
      const result = await syncPreferences(draft.uid ?? undefined, draft.authGeneration);
      if (!isCurrentRequest()) return;
      if (!result.success) {
        setError(t('common.unexpectedError'));
        return;
      }

      if (draft.enableAfterSave) useTranslatorReviewStore.getState().enableCommunityFeedback();
      if (isCurrentRequest()) clearDraft();
    } catch {
      if (isCurrentRequest()) setError(t('common.unexpectedError'));
    } finally {
      if (isCurrentRequest()) {
        requestRef.current = null;
        setIsSaving(false);
      }
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
