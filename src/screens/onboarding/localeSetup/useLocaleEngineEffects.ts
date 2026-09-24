import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import type { LanguageCode } from '../../../constants/languages';
import {
  localeSearchEngine,
  prewarmLocaleSearchEngine,
} from '../../../services/onboarding/localeSelection';

/**
 * Pre-warm the locale search engine off the interaction/render critical path.
 * The engine's first use (129 KB catalog require + ICU sorts + Fuse build) is
 * otherwise paid synchronously on the first country-step render or first
 * keystroke. Running it after interactions on mount moves that cost earlier
 * and off the hot path. Idempotent — safe if the engine was already resolved.
 */
export function useLocaleEnginePrewarm(onWarm: () => void): void {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      prewarmLocaleSearchEngine();
      onWarm();
    });

    return () => task.cancel();
    // Mount only: the prewarm is a one-time, idempotent cost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

interface LocaleSelectionSyncInput {
  /** Only the nation and content-language steps show a resolved selection. */
  needsLocaleSelection: boolean;
  selectedLanguageCode: string | null;
  setSelectedLanguageCode: (code: string) => void;
  selectedCountryCode: string | null;
  selectedInterfaceLanguageCode: LanguageCode;
  setSelectedCountryDisplayName: (name: string) => void;
}

/**
 * Keeps the stored selections in step with the locale engine, but only while a
 * step that shows them is on screen.
 */
export function useLocaleSelectionSync({
  needsLocaleSelection,
  selectedLanguageCode,
  setSelectedLanguageCode,
  selectedCountryCode,
  selectedInterfaceLanguageCode,
  setSelectedCountryDisplayName,
}: LocaleSelectionSyncInput): void {
  // A stored content-language code may be an ISO-639-1/3 alias of the catalog's
  // canonical code. Canonicalizing it keeps the matching row marked as selected,
  // which the old render-time resolution did for free — but this waits until a
  // step that needs the engine is actually showing.
  useEffect(() => {
    if (!needsLocaleSelection || !selectedLanguageCode) {
      return;
    }

    const canonicalCode = localeSearchEngine.getLanguageByCode(selectedLanguageCode)?.code;
    if (canonicalCode && canonicalCode !== selectedLanguageCode) {
      setSelectedLanguageCode(canonicalCode);
    }
  }, [needsLocaleSelection, selectedLanguageCode, setSelectedLanguageCode]);

  // Filled by an effect, never during render: getCountryDisplayName builds an
  // Intl.DisplayNames formatter and walks all 249 countries the first time it
  // sees an interface language, which is far too much to put in front of a
  // first paint.
  useEffect(() => {
    if (!needsLocaleSelection || !selectedCountryCode) {
      setSelectedCountryDisplayName('');
      return;
    }

    setSelectedCountryDisplayName(
      localeSearchEngine.getCountryDisplayName(selectedCountryCode, selectedInterfaceLanguageCode)
    );
  }, [
    needsLocaleSelection,
    selectedCountryCode,
    selectedInterfaceLanguageCode,
    setSelectedCountryDisplayName,
  ]);
}
