/* eslint-disable react-hooks/refs -- latest-handler refs, moved unchanged from LocaleSetupFlow:
   the queue is created once and must call the handlers of the latest render, and the rows
   need a stable onPress. The refs are only read from event handlers and the queue. */
import { useCallback, useRef, useState } from 'react';
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
import { showTranslationDownloadFailedAlert } from '../../bible/translationDownloadFailureAlert';
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

  const completeInitialSetup = async (translation: BibleTranslation) => {
    const translationLanguage = localeSearchEngine.getLanguageByName(translation.language);
    const interfaceLanguageCode = selectedInterfaceLanguageCode;
    const deviceCountry = localeSearchEngine.getCountryByCode(deviceCountryCode);

    await changeLanguage(interfaceLanguageCode);
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
    onDownloadFailed: async (translation) => {
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
        void bibleSelectionQueue.chooseDownload(translation);
      });
    },
    onCompleteFailed: (translation, error) => {
      console.error('[Onboarding] Failed to finish setup:', error);
      showOnboardingFinishFailedAlert(t, () => {
        void bibleSelectionQueue.chooseReady(translation);
      });
    },
    onStateChange: setBibleSelectionState,
  };

  const handleTranslationSelectImpl = async (translation: BibleTranslation) => {
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

  return { bibleSelectionState, handleTranslationSelect };
}
