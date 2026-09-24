import { useCallback, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, type TextStyle, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import type { Language, LanguageCode } from '../../../constants/languages';
import type { BibleTranslation, TranslationDownloadProgress } from '../../../types';
import { spacing } from '../../../design/system';
import { AppCard } from '../../../components/ui';
import {
  localeSearchEngine,
  type LocaleLanguage,
} from '../../../services/onboarding/localeSelection';
import {
  getTranslationAvailabilitySummary,
  getTranslationSelectionState,
} from '../../bible/bibleTranslationModel';
import { isLastInLocaleSetupGroup, type LocaleSetupGroupPosition } from '../localeSetupListModel';
import { getOnboardingTranslationStatus } from './localeSetupFlowModel';
import type { SetupStep } from '../localeSetupModel';
import type { OnboardingBibleSelectionState } from '../onboardingBibleSelectionQueue';
import {
  InterfaceLanguageList,
  LocaleSetupEmptyCard,
  PrimaryOptionPlaceholder,
  SuggestedCountryCard,
} from './LocaleSetupCards';
import { SectionEyebrow } from './LocaleSetupOptionRow';
import { CountryRow, LanguageRow, OnboardingLanguageRow } from './LocaleSetupRows';
import type { LocaleSetupStepItem } from './useLocaleSetupStepItems';
import type {
  OnboardingLanguageOption,
  TranslationDisplayData,
} from './useOnboardingTranslationOptions';

interface StepItemRendererInput {
  step: SetupStep;
  colors: ThemeColors;
  eyebrowFont: TextStyle;
  selectedInterfaceLanguageCode: LanguageCode;
  onInterfaceLanguageSelect: (language: Language) => void;
  bibleSelectionState: OnboardingBibleSelectionState;
  downloadProgress: TranslationDownloadProgress | null;
  translationDisplayDataById: Map<string, TranslationDisplayData>;
  onTranslationSelect: (translation: BibleTranslation) => void;
  selectedCountryCode: string | null;
  onCountrySelect: (countryCode: string) => void;
  selectedLanguageCode: string | null;
  onLanguageSelect: (languageCode: string) => void;
  onRetryCatalog: () => void;
}

/** How each item of the step list draws: rows, pinned cards, eyebrows and empty states. */
export function useStepItemRenderer({
  step,
  colors,
  eyebrowFont,
  selectedInterfaceLanguageCode,
  onInterfaceLanguageSelect,
  bibleSelectionState,
  downloadProgress,
  translationDisplayDataById,
  onTranslationSelect,
  selectedCountryCode,
  onCountrySelect,
  selectedLanguageCode,
  onLanguageSelect,
  onRetryCatalog,
}: StepItemRendererInput) {
  const { t } = useTranslation();

  const renderOnboardingLanguageRow = useCallback(
    (
      option: OnboardingLanguageOption,
      isRecommended = false,
      position?: LocaleSetupGroupPosition
    ) => {
      const isLast = position ? isLastInLocaleSetupGroup(position) : true;
      const translation = option.primaryTranslation;
      // A queued Bible shows the same busy spinner (it has no progress yet) and, like the
      // downloading one, cannot be tapped again.
      const isInstalling =
        bibleSelectionState.downloadingId === translation.id ||
        bibleSelectionState.queuedId === translation.id;
      const progress =
        downloadProgress?.translationId === translation.id ? downloadProgress.progress : null;
      // Read precomputed availability/selection state (computed once per
      // translation in translationDisplayDataById) instead of recomputing per row.
      const selectionState =
        translationDisplayDataById.get(translation.id)?.selectionState ??
        getTranslationSelectionState({
          isDownloaded: translation.isDownloaded,
          hasText: translation.hasText,
          hasAudio: translation.hasAudio,
          canPlayAudio: false,
          hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
          source: translation.source,
          textPackLocalPath: translation.textPackLocalPath,
        });
      const status = getOnboardingTranslationStatus(translation, selectionState);
      const statusLabel =
        status === 'download'
          ? t('translations.download')
          : status === 'continue'
            ? t('common.continue')
            : null;
      const translationLabel = translation.abbreviation
        ? `${translation.name} (${translation.abbreviation})`
        : translation.name;

      return (
        <OnboardingLanguageRow
          translation={translation}
          optionLabel={option.label}
          translationLabel={translationLabel}
          availabilitySummary={getTranslationAvailabilitySummary(translation, t)}
          statusLabel={statusLabel}
          recommendedBadgeLabel={t('onboarding.recommendedBadge')}
          downloadingLabel={t('translations.downloading')}
          isRecommended={isRecommended}
          isInstalling={isInstalling}
          isLast={isLast}
          position={position}
          progress={progress}
          colors={colors}
          eyebrowFont={eyebrowFont}
          onPress={onTranslationSelect}
        />
      );
    },
    [
      bibleSelectionState,
      colors,
      downloadProgress,
      eyebrowFont,
      onTranslationSelect,
      t,
      translationDisplayDataById,
    ]
  );

  // "Nepal · 123 languages" under the localized nation name. The English name is
  // dropped when it is the same string the title already shows.
  const getCountrySubtitle = useCallback(
    (countryCode: string, displayName: string): string => {
      const country = localeSearchEngine.getCountryByCode(countryCode);
      const languageCount = t('onboarding.countryLanguageCount', {
        count: country?.languageCodes.length ?? 0,
      });

      return country && country.name !== displayName
        ? `${country.name} · ${languageCount}`
        : languageCount;
    },
    [t]
  );

  const renderCountryRow = useCallback(
    (countryCode: string, position: LocaleSetupGroupPosition) => {
      const countryName = localeSearchEngine.getCountryDisplayName(
        countryCode,
        selectedInterfaceLanguageCode
      );

      return (
        <CountryRow
          countryCode={countryCode}
          countryName={countryName}
          countrySubtitle={getCountrySubtitle(countryCode, countryName)}
          isSelected={selectedCountryCode === countryCode}
          isLast={isLastInLocaleSetupGroup(position)}
          position={position}
          colors={colors}
          onSelect={onCountrySelect}
        />
      );
    },
    [
      colors,
      getCountrySubtitle,
      onCountrySelect,
      selectedCountryCode,
      selectedInterfaceLanguageCode,
    ]
  );

  const renderSuggestedCountryCard = useCallback(
    (countryCode: string) => {
      const countryName = localeSearchEngine.getCountryDisplayName(
        countryCode,
        selectedInterfaceLanguageCode
      );

      return (
        <SuggestedCountryCard
          countryCode={countryCode}
          countryName={countryName}
          countrySubtitle={getCountrySubtitle(countryCode, countryName)}
          isSelected={selectedCountryCode === countryCode}
          colors={colors}
          eyebrowFont={eyebrowFont}
          onSelect={onCountrySelect}
        />
      );
    },
    [
      colors,
      eyebrowFont,
      getCountrySubtitle,
      onCountrySelect,
      selectedCountryCode,
      selectedInterfaceLanguageCode,
    ]
  );

  const renderLanguageRow = useCallback(
    (language: LocaleLanguage, isRecommended: boolean, position: LocaleSetupGroupPosition) => (
      <LanguageRow
        language={language}
        isRecommended={isRecommended}
        isSelected={selectedLanguageCode === language.code}
        isLast={isLastInLocaleSetupGroup(position)}
        position={position}
        recommendedBadgeLabel={t('onboarding.recommendedBadge')}
        colors={colors}
        eyebrowFont={eyebrowFont}
        onSelect={onLanguageSelect}
      />
    ),
    [colors, eyebrowFont, onLanguageSelect, selectedLanguageCode, t]
  );

  return useCallback(
    ({ item }: { item: LocaleSetupStepItem }): ReactElement | null => {
      switch (item.type) {
        case 'interfaceLanguageList':
          return (
            <InterfaceLanguageList
              selectedCode={selectedInterfaceLanguageCode}
              colors={colors}
              onSelect={onInterfaceLanguageSelect}
            />
          );
        case 'eyebrow':
          return (
            <View style={item.hasSectionSpacing ? styles.listSection : undefined}>
              <SectionEyebrow label={item.label} colors={colors} eyebrowFont={eyebrowFont} />
            </View>
          );
        case 'loading':
          return (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          );
        // Usually the device is offline. The card sits above the list, so its body can point
        // at the Bibles below it: they ship with the app and finish onboarding offline.
        case 'catalogError':
          return (
            <LocaleSetupEmptyCard
              title={t('onboarding.catalogUnavailableTitle')}
              body={t('onboarding.catalogUnavailableBody')}
              colors={colors}
              retry={onRetryCatalog}
            />
          );
        case 'primaryOption':
          return (
            <View testID="onboarding-primary-recommendation">
              <AppCard accentRule padding={0}>
                {renderOnboardingLanguageRow(item.option, item.isRecommended)}
              </AppCard>
            </View>
          );
        case 'primaryOptionPlaceholder':
          return <PrimaryOptionPlaceholder />;
        case 'option':
          return renderOnboardingLanguageRow(item.option, false, item.position);
        case 'suggestedCountry':
          return renderSuggestedCountryCard(item.countryCode);
        case 'country':
          return renderCountryRow(item.countryCode, item.position);
        case 'language':
          return renderLanguageRow(item.language, item.isRecommended, item.position);
        case 'empty':
          return step === 'country' ? (
            <LocaleSetupEmptyCard
              title={t('onboarding.noNationsFound')}
              body={t('onboarding.noNationsFoundBody')}
              colors={colors}
            />
          ) : (
            <LocaleSetupEmptyCard
              title={t('onboarding.noLanguagesFound')}
              body={t('onboarding.noLanguagesFoundBody')}
              colors={colors}
            />
          );
        default:
          return null;
      }
    },
    [
      colors,
      eyebrowFont,
      onInterfaceLanguageSelect,
      onRetryCatalog,
      renderCountryRow,
      renderLanguageRow,
      renderOnboardingLanguageRow,
      renderSuggestedCountryCard,
      selectedInterfaceLanguageCode,
      step,
      t,
    ]
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    paddingTop: spacing.lg,
  },
  listSection: {
    marginTop: spacing.lg,
  },
});
