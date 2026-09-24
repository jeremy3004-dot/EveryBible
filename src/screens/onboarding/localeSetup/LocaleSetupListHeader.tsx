import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, MapPin, Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../../contexts/ThemeContext';
import type { Language, LanguageCode } from '../../../constants/languages';
import { radius, spacing, typography } from '../../../design/system';
import { AppCard } from '../../../components/ui';
import type { DisplayFontOverrides } from '../../../hooks/useDisplayFont';
import type { SetupMode, SetupStep } from '../localeSetupModel';
import { InterfaceLanguageList } from './LocaleSetupCards';
import { SectionEyebrow } from './LocaleSetupOptionRow';
import { getFlagEmoji } from './localeSetupFlowModel';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';

const SEARCH_FIELD_HEIGHT = 46;

interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  testID: string;
  colors: ThemeColors;
}

function SearchField({ value, onChangeText, placeholder, testID, colors }: SearchFieldProps) {
  return (
    <View
      style={[
        styles.searchField,
        { backgroundColor: colors.cardBackground, borderColor: colors.controlBorder },
      ]}
    >
      <Search size={17} color={colors.secondaryText} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        testID={testID}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryText}
        style={[styles.searchInput, { color: colors.primaryText }]}
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
  );
}

interface LocaleSetupListHeaderProps {
  step: SetupStep;
  mode: SetupMode;
  colors: ThemeColors;
  displayFont: DisplayFontOverrides;
  selectedInterfaceLanguage: Language;
  selectedInterfaceLanguageCode: LanguageCode;
  showInterfaceLanguagePicker: boolean;
  onToggleInterfaceLanguagePicker: () => void;
  onInterfaceLanguageSelect: (language: Language) => void;
  showsTranslationSearch: boolean;
  translationQuery: string;
  onTranslationQueryChange: (next: string) => void;
  countryQuery: string;
  onCountryQueryChange: (next: string) => void;
  countryCatalogSize: number;
  languageQuery: string;
  onLanguageQueryChange: (next: string) => void;
  /** The chosen nation's code, once the locale engine has resolved it. */
  selectedCountryCode: string | null;
  selectedCountryDisplayName: string;
  onEditCountry: () => void;
}

/**
 * Hero copy, the app-language control and the search field ride in the list
 * header rather than in the item array. Items are recycled cells: a search
 * TextInput inside one can be unmounted as the results below it re-filter,
 * which would drop focus and dismiss the keyboard mid-word. The header is
 * re-rendered in place instead, so the input keeps focus — it is one stable
 * component type, never an inline function component.
 */
export function LocaleSetupListHeader({
  step,
  mode,
  colors,
  displayFont,
  selectedInterfaceLanguage,
  selectedInterfaceLanguageCode,
  showInterfaceLanguagePicker,
  onToggleInterfaceLanguagePicker,
  onInterfaceLanguageSelect,
  showsTranslationSearch,
  translationQuery,
  onTranslationQueryChange,
  countryQuery,
  onCountryQueryChange,
  countryCatalogSize,
  languageQuery,
  onLanguageQueryChange,
  selectedCountryCode,
  selectedCountryDisplayName,
  onEditCountry,
}: LocaleSetupListHeaderProps) {
  const { t } = useTranslation();
  const heroTitleStyle = [styles.heroTitle, displayFont.bold, { color: colors.primaryText }];
  const heroBodyStyle = [styles.heroBody, { color: colors.secondaryText }];

  return (
    <View>
      {step === 'interfaceLanguage' ? (
        <>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={heroTitleStyle}
          >
            {t('onboarding.interfaceLanguageTitle')}
          </Text>
          <Text style={heroBodyStyle}>{t('onboarding.interfaceLanguageBody')}</Text>

          <SectionEyebrow
            label={t('onboarding.availableInterfaceLanguages')}
            colors={colors}
            eyebrowFont={displayFont.regular}
          />
        </>
      ) : null}

      {step === 'translation' ? (
        <>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={heroTitleStyle}
          >
            {t('onboarding.languageTitle')}
          </Text>

          {mode === 'initial' ? (
            <>
              <View testID="onboarding-interface-language-toggle">
                <AppCard
                  pressable
                  padding={14}
                  style={styles.inlinePreferenceCard}
                  // The label replaces the card's text, so the current language is
                  // restated; expanded says the list below opens and closes here.
                  accessibilityLabel={`${selectedInterfaceLanguage.appLanguageLabel}, ${selectedInterfaceLanguage.nativeName}`}
                  accessibilityState={{ expanded: showInterfaceLanguagePicker }}
                  onPress={onToggleInterfaceLanguagePicker}
                >
                  <View style={styles.inlinePreferenceRow}>
                    <View style={styles.inlinePreferenceCopy}>
                      <Text
                        style={[
                          typography.eyebrow,
                          displayFont.regular,
                          { color: colors.secondaryText },
                        ]}
                      >
                        {selectedInterfaceLanguage.appLanguageLabel}
                      </Text>
                      <Text style={[styles.inlinePreferenceValue, { color: colors.primaryText }]}>
                        {selectedInterfaceLanguage.nativeName}
                      </Text>
                    </View>
                    {showInterfaceLanguagePicker ? (
                      <ChevronUp size={18} color={colors.textTertiary} strokeWidth={2} />
                    ) : (
                      <ChevronDown size={18} color={colors.textTertiary} strokeWidth={2} />
                    )}
                  </View>
                </AppCard>
              </View>

              {showInterfaceLanguagePicker ? (
                <InterfaceLanguageList
                  selectedCode={selectedInterfaceLanguageCode}
                  colors={colors}
                  onSelect={onInterfaceLanguageSelect}
                  testID="onboarding-interface-language-inline-picker"
                />
              ) : null}
            </>
          ) : null}

          {showsTranslationSearch ? (
            <SearchField
              value={translationQuery}
              onChangeText={onTranslationQueryChange}
              placeholder={t('onboarding.languageSearchPlaceholder')}
              testID="onboarding-translation-search"
              colors={colors}
            />
          ) : null}
        </>
      ) : null}

      {step === 'country' ? (
        <>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={heroTitleStyle}
          >
            {t('onboarding.countryTitle')}
          </Text>
          <Text style={heroBodyStyle}>{t('onboarding.countryBody')}</Text>

          <SearchField
            value={countryQuery}
            onChangeText={onCountryQueryChange}
            placeholder={t('onboarding.countrySearchPlaceholderCount', {
              total: countryCatalogSize,
            })}
            testID="onboarding-country-search"
            colors={colors}
          />
        </>
      ) : null}

      {step === 'contentLanguage' ? (
        <>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={heroTitleStyle}
          >
            {t('onboarding.languageTitle')}
          </Text>
          <Text style={heroBodyStyle}>
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
              accessibilityRole="button"
              accessibilityLabel={selectedCountryDisplayName}
              onPress={onEditCountry}
              activeOpacity={0.85}
            >
              <MapPin size={16} color={colors.accentPrimary} strokeWidth={2} />
              {selectedCountryCode !== null ? (
                <Text style={styles.pillFlagEmoji}>{getFlagEmoji(selectedCountryCode)}</Text>
              ) : null}
              <Text style={[typography.captionStrong, { color: colors.primaryText }]}>
                {selectedCountryDisplayName}
              </Text>
            </TouchableOpacity>
          </View>

          <SearchField
            value={languageQuery}
            onChangeText={onLanguageQueryChange}
            placeholder={t('onboarding.languageSearchPlaceholder')}
            testID="onboarding-language-search"
            colors={colors}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroTitle: {
    ...typography.displayHero,
    fontSize: 34,
    lineHeight: 37,
    letterSpacing: -1.36,
    marginBottom: spacing.sm,
  },
  heroBody: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  // minHeight, not height: the typed query grows with the user's text size.
  searchField: {
    minHeight: SEARCH_FIELD_HEIGHT,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: 0,
  },
  inlinePreferenceCard: {
    marginBottom: spacing.md,
  },
  inlinePreferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  inlinePreferenceCopy: {
    flex: 1,
    gap: 2,
  },
  inlinePreferenceValue: {
    ...typography.cardTitle,
  },
  countryPillRow: {
    marginBottom: spacing.md,
    flexDirection: 'row',
  },
  countryPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pillFlagEmoji: {
    fontSize: 16,
  },
});
