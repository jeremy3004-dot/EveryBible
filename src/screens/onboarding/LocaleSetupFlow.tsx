import { useMemo, useState } from 'react';
import {
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
import { LANGUAGES, type Language, type LanguageCode } from '../../constants/languages';
import { useAuthStore } from '../../stores/authStore';
import { changeLanguage } from '../../i18n';
import { interfaceLanguageSearchEngine } from '../../services/onboarding/interfaceLanguageSelection';
import { syncPreferences } from '../../services/sync';
import { localeSearchEngine, type LocaleLanguage } from '../../services/onboarding/localeSelection';
import { getLocaleSetupSteps, type SetupMode, type SetupStep } from './localeSetupModel';
import { radius } from '../../design/system';

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
  const steps = useMemo(() => getLocaleSetupSteps(mode), [mode]);

  const deviceCountryCode = Localization.getLocales()[0]?.regionCode ?? null;
  const initialCountry =
    localeSearchEngine.getCountryByCode(preferences.countryCode || deviceCountryCode) ?? null;
  const initialLanguage = localeSearchEngine.getLanguageByCode(preferences.contentLanguageCode);
  const totalSteps = steps.length;
  const initialInterfaceLanguage =
    interfaceLanguageSearchEngine.getLanguageByCode(preferences.language) ?? LANGUAGES.en;

  const [step, setStep] = useState<SetupStep>(steps[0] ?? 'interface');
  const [interfaceLanguageQuery, setInterfaceLanguageQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const [selectedInterfaceLanguageCode, setSelectedInterfaceLanguageCode] = useState<LanguageCode>(
    initialInterfaceLanguage.code
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    initialCountry?.code ?? null
  );
  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string | null>(
    initialLanguage?.code ?? null
  );

  const selectedInterfaceLanguage =
    interfaceLanguageSearchEngine.getLanguageByCode(selectedInterfaceLanguageCode) ?? LANGUAGES.en;
  const selectedCountry = localeSearchEngine.getCountryByCode(selectedCountryCode);
  const selectedLanguage = localeSearchEngine.getLanguageByCode(selectedLanguageCode);
  const selectedCountryDisplayName = selectedCountry
    ? localeSearchEngine.getCountryDisplayName(selectedCountry.code, selectedInterfaceLanguageCode)
    : '';
  const currentStepNumber = Math.max(steps.indexOf(step) + 1, 1);
  const isFinalStep = step === steps[steps.length - 1];

  const interfaceLanguageResults = useMemo(
    () => interfaceLanguageSearchEngine.search(interfaceLanguageQuery, 24),
    [interfaceLanguageQuery]
  );

  const countryResults = useMemo(
    () => localeSearchEngine.searchCountries(countryQuery, selectedInterfaceLanguageCode),
    [countryQuery, selectedInterfaceLanguageCode]
  );

  const languageResults = useMemo(
    () => localeSearchEngine.searchLanguages(languageQuery, selectedCountryCode, 30),
    [languageQuery, selectedCountryCode]
  );

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

  const renderInterfaceLanguageRow = (language: Language) => {
    const isSelected = selectedInterfaceLanguageCode === language.code;

    return (
      <TouchableOpacity
        key={language.code}
        style={[
          styles.optionCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: isSelected ? colors.accentGreen : colors.cardBorder,
          },
        ]}
        onPress={() => {
          setSelectedInterfaceLanguageCode(language.code);
          void changeLanguage(language.code);
        }}
        activeOpacity={0.9}
      >
        <View style={styles.optionCopy}>
          <Text style={[styles.optionTitle, { color: colors.primaryText }]}>
            {language.nativeName}
          </Text>
          <Text style={[styles.optionMeta, { color: colors.secondaryText }]}>{language.name}</Text>
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
                {language.appLanguageLabel}
              </Text>
            </View>
          </View>
        </View>
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
        ) : null}
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

  const stepSubtitle = t('onboarding.stepProgress', {
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
          <Text style={[styles.headerStep, { color: colors.secondaryText }]}>{stepSubtitle}</Text>
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
        {step === 'interface' ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
              {t('onboarding.interfaceLanguageTitle')}
            </Text>
            <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
              {t('onboarding.interfaceLanguageBody')}
            </Text>

            <TextInput
              value={interfaceLanguageQuery}
              onChangeText={setInterfaceLanguageQuery}
              testID="onboarding-interface-language-search"
              accessibilityLabel={t('onboarding.interfaceLanguageSearchPlaceholder')}
              placeholder={t('onboarding.interfaceLanguageSearchPlaceholder')}
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
                {t('onboarding.availableInterfaceLanguages')}
              </Text>
              {interfaceLanguageResults.map((language) => renderInterfaceLanguageRow(language))}
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
                step === 'interface'
                  ? selectedInterfaceLanguage
                    ? 1
                    : 0.45
                  : step === 'country'
                      ? selectedCountry
                        ? 1
                        : 0.45
                      : selectedLanguage
                        ? 1
                        : 0.45,
            },
          ]}
          testID="onboarding-primary-action"
          accessibilityRole="button"
          accessibilityLabel={
            isFinalStep ? t('onboarding.finish') : t('common.continue')
          }
          onPress={async () => {
            if (step === 'interface') {
              await changeLanguage(selectedInterfaceLanguageCode);
              goToNextStep();
              return;
            }

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
          disabled={
            step === 'interface'
              ? !selectedInterfaceLanguage
              : step === 'country'
                  ? !selectedCountry
                  : !selectedLanguage
          }
        >
          <Text style={[styles.primaryButtonText, { color: colors.bibleBackground }]}>
            {isFinalStep ? t('onboarding.finish') : t('common.continue')}
          </Text>
        </TouchableOpacity>
      </View>
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
