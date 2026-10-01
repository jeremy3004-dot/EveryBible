import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BibleTranslation } from '../../../types';
import type { LanguageCode } from '../../../constants/languages';
import { useAuthStore } from '../../../stores/authStore';
import { useBibleStore } from '../../../stores/bibleStore';
import { changeLanguage } from '../../../i18n';
import { resolveRegionalFallbackTranslation } from '../../../services/translations/regionalTranslationFallback';
import { localeSearchEngine } from '../../../services/onboarding/localeSelection';
import { normalizeTranslationLanguage } from '../../bible/bibleTranslationModel';
import {
  reportTranslationDownloadFailure,
  showTranslationDownloadFailedAlert,
} from '../../bible/translationDownloadFailureAlert';
import { showOnboardingFinishFailedAlert } from '../onboardingFinishFailureAlert';
import {
  createOnboardingBibleSelectionQueue,
  type OnboardingBibleSelectionDeps,
  type OnboardingBibleSelectionState,
} from '../onboardingBibleSelectionQueue';
import { getOnboardingTranslationDisplayData } from './useOnboardingTranslationOptions';

interface OnboardingBibleSelectionInput {
  deviceCountryCode: string | null;
  selectedInterfaceLanguageCode: LanguageCode;
  /** Called once the chosen Bible and its preferences are saved. */
  onFinished: () => void;
}

/**
 * Picking a Bible on first run: a ready Bible finishes onboarding at once, one
 * that needs a download is queued, and a failed download falls back to a bundled
 * Bible for the device's region before asking the reader to try again.
 */
export function useOnboardingBibleSelection({
  deviceCountryCode,
  selectedInterfaceLanguageCode,
  onFinished,
}: OnboardingBibleSelectionInput) {
  const { t } = useTranslation();
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
  const [bibleSelectionState, setBibleSelectionState] = useState<OnboardingBibleSelectionState>({
    downloadingId: null,
    queuedId: null,
  });

  // The Bible whose finish is running: switching the interface language can take seconds the
  // first time its strings load, and the row shows its busy spinner meanwhile.
  const [finishingId, setFinishingId] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const latestInterfaceLanguageRef = useRef(selectedInterfaceLanguageCode);
  latestInterfaceLanguageRef.current = selectedInterfaceLanguageCode;
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const completeInitialSetup = async (translation: BibleTranslation): Promise<boolean> => {
    setFinishingId(translation.id);
    try {
      return await finishInitialSetup(translation);
    } finally {
      if (mountedRef.current) setFinishingId(null);
    }
  };

  const finishInitialSetup = async (translation: BibleTranslation): Promise<boolean> => {
    const translationLanguage = localeSearchEngine.getLanguageByName(translation.language);
    let interfaceLanguageCode = latestInterfaceLanguageRef.current;
    const deviceCountry = localeSearchEngine.getCountryByCode(deviceCountryCode);

    while (mountedRef.current) {
      interfaceLanguageCode = latestInterfaceLanguageRef.current;
      const isCurrent = () =>
        mountedRef.current && interfaceLanguageCode === latestInterfaceLanguageRef.current;
      const applied = await changeLanguage(interfaceLanguageCode, isCurrent);
      if (!mountedRef.current) return false;
      if (applied !== false && isCurrent()) break;
      // Another language load won. Keep the chosen Bible and apply the latest choice.
    }
    if (!mountedRef.current) return false;
    setPreferredTranslationLanguage(normalizeTranslationLanguage(translation.language));
    setCurrentTranslation(translation.id);

    setPreferences({
      language: interfaceLanguageCode,
      countryCode: deviceCountry?.code ?? null,
      countryName: deviceCountry?.name ?? null,
      contentLanguageCode: translationLanguage?.code ?? null,
      contentLanguageName:
        translationLanguage?.name ?? normalizeTranslationLanguage(translation.language),
      contentLanguageNativeName:
        translationLanguage?.nativeName ?? normalizeTranslationLanguage(translation.language),
      onboardingCompleted: true,
    });

    onFinished();
    return true;
  };

  // Refreshed every render so the queue, created once below, always calls the latest
  // handlers (they close over the current interface language and device country).
  const bibleSelectionDepsRef = useRef<OnboardingBibleSelectionDeps<BibleTranslation> | null>(null);
  const [bibleSelectionQueue] = useState(() =>
    createOnboardingBibleSelectionQueue<BibleTranslation>(() => {
      if (!bibleSelectionDepsRef.current) {
        throw new Error('Onboarding Bible selection used before its first render');
      }
      return bibleSelectionDepsRef.current;
    })
  );
  bibleSelectionDepsRef.current = {
    download: (translation) => downloadTranslation(translation.id),
    getInstalled: (translation) =>
      useBibleStore.getState().translations.find((candidate) => candidate.id === translation.id) ??
      translation,
    complete: completeInitialSetup,
    onDownloadFailed: async (translation, error) => {
      if (!mountedRef.current) return;
      reportTranslationDownloadFailure(error);
      const fallbackTranslation = resolveRegionalFallbackTranslation(
        useBibleStore.getState().translations,
        translation,
        deviceCountryCode
      );
      if (fallbackTranslation) {
        await bibleSelectionQueue.chooseReady(fallbackTranslation);
        return;
      }

      showTranslationDownloadFailedAlert(t, () => {
        if (mountedRef.current) void bibleSelectionQueue.chooseDownload(translation);
      });
    },
    onCompleteFailed: (translation, error) => {
      if (!mountedRef.current) return;
      console.error('[Onboarding] Failed to finish setup:', error);
      showOnboardingFinishFailedAlert(t, () => {
        if (mountedRef.current) void bibleSelectionQueue.chooseReady(translation);
      });
    },
    onStateChange: (state) => {
      if (mountedRef.current) setBibleSelectionState(state);
    },
  };

  const handleTranslationSelectImpl = async (translation: BibleTranslation) => {
    if (!mountedRef.current) return;
    const { selectionState } = getOnboardingTranslationDisplayData(translation);

    if (selectionState.reason === 'download-required') {
      await bibleSelectionQueue.chooseDownload(translation);
      return;
    }

    if (selectionState.isSelectable) {
      await bibleSelectionQueue.chooseReady(translation);
      return;
    }

    const fallbackTranslation = resolveRegionalFallbackTranslation(
      useBibleStore.getState().translations,
      translation,
      deviceCountryCode
    );
    if (fallbackTranslation) {
      await bibleSelectionQueue.chooseReady(fallbackTranslation);
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: translation.name }),
      [{ text: t('common.ok') }]
    );
  };

  // Keep a stable onPress identity for the memoized onboarding rows while always
  // invoking the latest handler implementation (which closes over changing
  // render state). Without this, a fresh handler each render would defeat
  // React.memo's shallow prop compare.
  const handleTranslationSelectRef = useRef(handleTranslationSelectImpl);
  handleTranslationSelectRef.current = handleTranslationSelectImpl;
  const handleTranslationSelect = useCallback((translation: BibleTranslation) => {
    void handleTranslationSelectRef.current(translation);
  }, []);

  return {
    bibleSelectionState: { ...bibleSelectionState, finishingId },
    handleTranslationSelect,
  };
}
