import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { LANGUAGES, type LanguageCode } from '../../constants/languages';
import { useAuthStore } from '../../stores/authStore';
import { useBibleStore } from '../../stores/bibleStore';
import { changeLanguage } from '../../i18n';
import { syncPreferences } from '../../services/sync';
import {
  ensureRuntimeCatalogLoaded,
  hasRuntimeCatalogTranslations,
} from '../../services/translations';
import { resolveRegionalFallbackTranslation } from '../../services/translations/regionalTranslationFallback';
import { localeSearchEngine, type LocaleLanguage } from '../../services/onboarding/localeSelection';
import { getLocaleSetupSteps, type SetupMode, type SetupStep } from './localeSetupModel';
import { radius } from '../../design/system';
import type { BibleTranslation } from '../../types';
import {
  filterTranslationsBySearchQuery,
  getTranslationAvailabilitySummary,
  getTranslationSelectionState,
  getVisibleTranslationsForPicker,
  normalizeTranslationLanguage,
} from '../bible/bibleTranslationModel';
import { getAudioAvailability } from '../../services/audio/audioAvailability';
import { isRemoteAudioAvailable } from '../../services/audio/audioRemote';
import { config } from '../../constants';

interface LocaleSetupFlowProps {
  mode?: SetupMode;
  onClose?: () => void;
  onComplete?: () => void;
}

const getFlagEmoji = (countryCode: string): string => {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return '';
  }

  return String.fromCodePoint(...countryCode.split('').map((char) => 127397 + char.charCodeAt(0)));
};

export function LocaleSetupFlow({ mode = 'initial', onClose, onComplete }: LocaleSetupFlowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);
  const translations = useBibleStore((state) => state.translations);
  const downloadProgress = useBibleStore((state) => state.downloadProgress);
  const setCurrentTranslation = useBibleStore((state) => state.setCurrentTranslation);
  const setPreferredTranslationLanguage = useBibleStore(
    (state) => state.setPreferredTranslationLanguage
  );
  const downloadTranslation = useBibleStore((state) => state.downloadTranslation);
  const steps = useMemo(() => getLocaleSetupSteps(mode), [mode]);

  const deviceLocale = Localization.getLocales()[0];
  const deviceCountryCode = deviceLocale?.regionCode ?? null;
  const deviceLanguageCode = deviceLocale?.languageCode as LanguageCode | undefined;
  const initialCountry =
    localeSearchEngine.getCountryByCode(preferences.countryCode || deviceCountryCode) ?? null;
  const initialLanguage = localeSearchEngine.getLanguageByCode(preferences.contentLanguageCode);
  const totalSteps = steps.length;
  const initialInterfaceLanguageCode =
    mode === 'initial' && deviceLanguageCode && LANGUAGES[deviceLanguageCode]
      ? deviceLanguageCode
      : preferences.language;

  const [step, setStep] = useState<SetupStep>(steps[0] ?? 'translation');
  const [translationQuery, setTranslationQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const selectedInterfaceLanguageCode = initialInterfaceLanguageCode;
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    initialCountry?.code ?? null
  );
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string | null>(
    initialLanguage?.code ?? null
  );
  const [isHydratingRuntimeCatalog, setIsHydratingRuntimeCatalog] = useState(mode === 'initial');
  const [installingTranslationId, setInstallingTranslationId] = useState<string | null>(null);

  const selectedCountry = localeSearchEngine.getCountryByCode(selectedCountryCode);
  const selectedLanguage = localeSearchEngine.getLanguageByCode(selectedLanguageCode);
  const selectedCountryDisplayName = selectedCountry
    ? localeSearchEngine.getCountryDisplayName(selectedCountry.code, selectedInterfaceLanguageCode)
    : '';
  const currentStepNumber = Math.max(steps.indexOf(step) + 1, 1);
  const isFinalStep = step === steps[steps.length - 1];
  const hasHydratedRuntimeCatalog = useMemo(
    () => hasRuntimeCatalogTranslations(translations),
    [translations]
  );

  const visibleTranslations = useMemo(
    () =>
      getVisibleTranslationsForPicker(translations, {
        isHydratingRuntimeCatalog,
        hasHydratedRuntimeCatalog,
      }),
    [hasHydratedRuntimeCatalog, isHydratingRuntimeCatalog, translations]
  );

  const translationResults = useMemo(
    () => filterTranslationsBySearchQuery(visibleTranslations, translationQuery),
    [translationQuery, visibleTranslations]
  );

  const countryResults = useMemo(
    () => localeSearchEngine.searchCountries(countryQuery, selectedInterfaceLanguageCode),
    [countryQuery, selectedInterfaceLanguageCode]
  );

  const languageResults = useMemo(
    () => localeSearchEngine.searchLanguages(languageQuery, selectedCountryCode, 30),
    [languageQuery, selectedCountryCode]
  );

  useEffect(() => {
    if (mode !== 'initial' || hasHydratedRuntimeCatalog) {
      setIsHydratingRuntimeCatalog(false);
      return;
    }

    let isMounted = true;
    setIsHydratingRuntimeCatalog(true);

    void ensureRuntimeCatalogLoaded()
      .catch((error) => {
        console.warn('[Onboarding] Failed to hydrate runtime translation catalog:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsHydratingRuntimeCatalog(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hasHydratedRuntimeCatalog, mode]);

  const completeSetup = async () => {
    if (!selectedCountry || !selectedLanguage) {
      return;
    }

    await changeLanguage(selectedInterfaceLanguageCode);

    setPreferences({
      language: selectedInterfaceLanguageCode,
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      contentLanguageCode: selectedLanguage.code,
      contentLanguageName: selectedLanguage.name,
      contentLanguageNativeName: selectedLanguage.nativeName,
      onboardingCompleted: true,
    });

    syncPreferences().catch(() => {});
    onComplete?.();
  };

  const resolveTranslationLanguage = (translation: BibleTranslation): LocaleLanguage | null => {
    return (
      localeSearchEngine.searchLanguages(translation.language ?? '', null, 1).global[0] ?? null
    );
  };

  const completeInitialSetup = async (translation: BibleTranslation) => {
    const translationLanguage = resolveTranslationLanguage(translation);
    const mappedInterfaceLanguageCode = translationLanguage
      ? localeSearchEngine.mapLanguageToAppLanguage(translationLanguage)
      : null;
    const interfaceLanguageCode = mappedInterfaceLanguageCode ?? selectedInterfaceLanguageCode;
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

    syncPreferences().catch(() => {});
    onComplete?.();
  };

  const handleTranslationSelect = async (translation: BibleTranslation) => {
    const availability = getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
      downloadedAudioBooks: translation.downloadedAudioBooks,
    });
    const selectionState = getTranslationSelectionState({
      isDownloaded: translation.isDownloaded,
      hasText: translation.hasText,
      hasAudio: translation.hasAudio,
      canPlayAudio: availability.canPlayAudio,
      hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
      source: translation.source,
      textPackLocalPath: translation.textPackLocalPath,
    });

    if (selectionState.reason === 'download-required') {
      try {
        setInstallingTranslationId(translation.id);
        await downloadTranslation(translation.id);
        const installedTranslation =
          useBibleStore
            .getState()
            .translations.find((candidate) => candidate.id === translation.id) ?? translation;
        await completeInitialSetup(installedTranslation);
      } catch (error) {
        const fallbackTranslation = resolveRegionalFallbackTranslation(
          useBibleStore.getState().translations,
          translation,
          deviceCountryCode
        );
        if (fallbackTranslation) {
          await completeInitialSetup(fallbackTranslation);
          return;
        }

        Alert.alert(
          t('common.error'),
          error instanceof Error ? error.message : t('bible.failedToLoad'),
          [{ text: t('common.ok') }]
        );
      } finally {
        setInstallingTranslationId(null);
      }
      return;
    }

    if (selectionState.isSelectable) {
      await completeInitialSetup(translation);
      return;
    }

    const fallbackTranslation = resolveRegionalFallbackTranslation(
      useBibleStore.getState().translations,
      translation,
      deviceCountryCode
    );
    if (fallbackTranslation) {
      await completeInitialSetup(fallbackTranslation);
      return;
    }

    Alert.alert(
      t('common.comingSoon'),
      t('bible.translationComingSoon', { name: translation.name }),
      [{ text: t('common.ok') }]
    );
  };

  const goToStep = (targetStep: SetupStep) => {
    if (steps.includes(targetStep)) {
      setStep(targetStep);
    }
  };

  const goToNextStep = () => {
    const nextStep = steps[steps.indexOf(step) + 1];
    if (nextStep) {
      setStep(nextStep);
    }
  };

  const goToPreviousStep = () => {
    const previousStep = steps[steps.indexOf(step) - 1];
    if (previousStep) {
      setStep(previousStep);
    }
  };

  const renderTranslationRow = (translation: BibleTranslation) => {
    const isInstalling = installingTranslationId === translation.id;
    const progress =
      downloadProgress?.translationId === translation.id ? downloadProgress.progress : null;
    const availability = getAudioAvailability({
      featureEnabled: config.features.audioEnabled,
      translationHasAudio: translation.hasAudio,
      remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
      downloadedAudioBooks: translation.downloadedAudioBooks,
    });
    const selectionState = getTranslationSelectionState({
      isDownloaded: translation.isDownloaded,
      hasText: translation.hasText,
      hasAudio: translation.hasAudio,
      canPlayAudio: availability.canPlayAudio,
      hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
      source: translation.source,
      textPackLocalPath: translation.textPackLocalPath,
    });
    const statusLabel =
      selectionState.reason === 'download-required'
        ? t('translations.download')
        : selectionState.isSelectable
          ? t('common.continue')
          : t('common.comingSoon');

    return (
      <TouchableOpacity
        key={translation.id}
        style={[
          styles.optionCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
          },
        ]}
        onPress={() => void handleTranslationSelect(translation)}
        disabled={isInstalling}
        activeOpacity={0.9}
      >
        <View style={styles.optionCopy}>
          <View style={styles.translationTitleRow}>
            <Text style={[styles.optionTitle, { color: colors.primaryText }]} numberOfLines={1}>
              {translation.name}
            </Text>
            <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>
              {translation.abbreviation}
            </Text>
          </View>
          <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>
            {normalizeTranslationLanguage(translation.language)}
          </Text>
          <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>
            {getTranslationAvailabilitySummary(translation, t)}
          </Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.accentGreen + '18',
                  borderColor: colors.accentGreen + '44',
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.accentGreen }]}>
                {isInstalling && progress != null
                  ? `${t('translations.downloading')} ${progress}%`
                  : statusLabel}
              </Text>
            </View>
          </View>
        </View>
        {isInstalling ? (
          <ActivityIndicator color={colors.accentGreen} />
        ) : (
          <Ionicons name="chevron-forward" size={22} color={colors.secondaryText} />
        )}
      </TouchableOpacity>
    );
  };

  const renderCountryRow = (countryCode: string) => {
    const isSelected = selectedCountryCode === countryCode;
    const flag = getFlagEmoji(countryCode);
    const countryName = localeSearchEngine.getCountryDisplayName(
      countryCode,
      selectedInterfaceLanguageCode
    );

    return (
      <TouchableOpacity
        key={countryCode}
        style={[
          styles.optionCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: isSelected ? colors.accentGreen : colors.cardBorder,
          },
        ]}
        onPress={() => {
          setSelectedCountryCode(countryCode);
          setLanguageQuery('');
          setSelectedLanguageCode(null);
        }}
        activeOpacity={0.9}
      >
        <View style={styles.optionCopy}>
          <View style={styles.countryTitleRow}>
            {flag ? <Text style={styles.flagEmoji}>{flag}</Text> : null}
            <Text style={[styles.optionTitle, { color: colors.primaryText }]}>{countryName}</Text>
          </View>
          <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>{countryCode}</Text>
        </View>
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderLanguageRow = (language: LocaleLanguage, isRecommended: boolean) => {
    const isSelected = selectedLanguageCode === language.code;

    return (
      <TouchableOpacity
        key={`${isRecommended ? 'recommended' : 'global'}-${language.code}`}
        style={[
          styles.optionCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: isSelected ? colors.accentGreen : colors.cardBorder,
          },
        ]}
        onPress={() => setSelectedLanguageCode(language.code)}
        activeOpacity={0.9}
      >
        <View style={styles.optionCopy}>
          <Text style={[styles.optionTitle, { color: colors.primaryText }]}>
            {language.nativeName}
          </Text>
          <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>{language.name}</Text>
          <View style={styles.badgeRow}>
            {isRecommended ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: colors.accentGreen + '18',
                    borderColor: colors.accentGreen + '44',
                  },
                ]}
              >
                <Text style={[styles.badgeText, { color: colors.accentGreen }]}>
                  {t('onboarding.recommendedBadge')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const stepSubtitle =
    mode === 'initial'
      ? ''
      : t('onboarding.stepProgress', {
          current: currentStepNumber,
          count: totalSteps,
        });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        {mode === 'settings' ? (
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={22} color={colors.primaryText} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}

        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
            {t('onboarding.title')}
          </Text>
          {stepSubtitle ? (
            <Text style={[styles.headerStep, { color: colors.secondaryText }]}>{stepSubtitle}</Text>
          ) : null}
        </View>

        {mode === 'settings' ? (
          <TouchableOpacity style={styles.headerButton} onPress={completeSetup}>
            <Text style={[styles.headerAction, { color: colors.accentGreen }]}>
              {t('common.done')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {step === 'translation' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.languageTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('home.defaultVerse')}
            </Text>

            <TextInput
              value={translationQuery}
              onChangeText={setTranslationQuery}
              testID="onboarding-translation-search"
              accessibilityLabel={t('onboarding.languageSearchPlaceholder')}
              placeholder={t('onboarding.languageSearchPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                  color: colors.primaryText,
                },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <View style={styles.listSection}>
              <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
                {t('translations.title')}
              </Text>
              {isHydratingRuntimeCatalog ? <ActivityIndicator color={colors.accentGreen} /> : null}
              {translationResults.map((translation) => renderTranslationRow(translation))}
            </View>
          </>
        ) : step === 'country' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.countryTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.countryBody')}
            </Text>

            <TextInput
              value={countryQuery}
              onChangeText={setCountryQuery}
              testID="onboarding-country-search"
              accessibilityLabel={t('onboarding.countrySearchPlaceholder')}
              placeholder={t('onboarding.countrySearchPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                  color: colors.primaryText,
                },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <View style={styles.listSection}>
              {countryResults.map((country) => renderCountryRow(country.code))}
            </View>
          </>
        ) : step === 'contentLanguage' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.languageTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.languageBody', {
                country: selectedCountryDisplayName || t('common.notSet'),
              })}
            </Text>

            <View style={styles.countryPillRow}>
              <TouchableOpacity
                style={[
                  styles.countryPill,
                  { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                ]}
                onPress={() => goToStep('country')}
              >
                <Ionicons name="location-outline" size={16} color={colors.accentGreen} />
                {selectedCountry ? (
                  <Text style={styles.pillFlagEmoji}>{getFlagEmoji(selectedCountry.code)}</Text>
                ) : null}
                <Text style={[styles.countryPillText, { color: colors.primaryText }]}>
                  {selectedCountryDisplayName}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={languageQuery}
              onChangeText={setLanguageQuery}
              testID="onboarding-language-search"
              accessibilityLabel={t('onboarding.languageSearchPlaceholder')}
              placeholder={t('onboarding.languageSearchPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                  color: colors.primaryText,
                },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {languageResults.recommended.length > 0 ? (
              <View style={styles.listSection}>
                <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
                  {t('onboarding.recommendedLanguages', {
                    country: selectedCountryDisplayName,
                  })}
                </Text>
                {languageResults.recommended.map((language) => renderLanguageRow(language, true))}
              </View>
            ) : null}

            {languageResults.global.length > 0 ? (
              <View style={styles.listSection}>
                <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
                  {t('onboarding.moreLanguages')}
                </Text>
                {languageResults.global.map((language) => renderLanguageRow(language, false))}
              </View>
            ) : null}

            {languageResults.recommended.length === 0 && languageResults.global.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
                  {t('onboarding.noLanguagesFound')}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                  {t('onboarding.noLanguagesFoundBody')}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {mode === 'settings' ? (
        <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
          {step !== steps[0] ? (
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
              testID="onboarding-secondary-action"
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={goToPreviousStep}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.primaryText }]}>
                {t('common.back')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerSpacer} />
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.bibleControlBackground,
                opacity:
                  step === 'country' ? (selectedCountry ? 1 : 0.45) : selectedLanguage ? 1 : 0.45,
              },
            ]}
            testID="onboarding-primary-action"
            accessibilityRole="button"
            accessibilityLabel={isFinalStep ? t('onboarding.finish') : t('common.continue')}
            onPress={async () => {
              if (step === 'country') {
                if (selectedCountry) {
                  goToNextStep();
                }
                return;
              }

              if (step === 'contentLanguage') {
                if (selectedLanguage) {
                  void completeSetup();
                }
                return;
              }
            }}
            disabled={step === 'country' ? !selectedCountry : !selectedLanguage}
          >
            <Text style={[styles.primaryButtonText, { color: colors.bibleBackground }]}>
              {isFinalStep ? t('onboarding.finish') : t('common.continue')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 56,
    minHeight: 24,
    justifyContent: 'center',
  },
  headerCopy: {
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerStep: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerAction: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  listSection: {
    marginTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionCopy: {
    flex: 1,
    gap: 4,
  },
  translationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  flagEmoji: {
    fontSize: 20,
  },
  optionMeta: {
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countryPillRow: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  countryPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillFlagEmoji: {
    fontSize: 16,
  },
  emptyCard: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    gap: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1.35,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
