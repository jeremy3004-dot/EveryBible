import { memo } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import { hexWithAlpha } from '../../../utils';
import type { TranslationLanguageSearchResult } from '../bibleTranslationModel';
import { groupRowStyle, pickerStyles as styles } from './pickerStyles';

// The picker list's non-Bible rows: the search field above the list, a language
// match while searching, the language pill, and the section headings.

// An 18pt glyph: 13pt a side makes the 44pt touch floor.
const CLEAR_HIT_SLOP = { top: 13, bottom: 13, left: 13, right: 13 };

// The search field is deliberately NOT a row: rows are recycled cells, so a
// scroll far enough down would unmount the focused TextInput and drop the
// keyboard mid-query. FlashList re-renders a header element in place, which
// keeps focus — the same shape the onboarding locale list uses. It has to be
// an element of a stable type (never an inline component) or React remounts
// it on every keystroke and steals focus anyway.
export function TranslationPickerSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View
      style={[
        styles.searchInputShell,
        { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.controlBorder },
      ]}
    >
      <Ionicons name="search" size={18} color={colors.bibleSecondaryText} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        testID="translation-picker-search"
        accessibilityLabel={t('common.search')}
        placeholder={t('common.search')}
        placeholderTextColor={colors.bibleSecondaryText}
        style={[styles.searchInput, { color: colors.biblePrimaryText }]}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <TouchableOpacity
          style={styles.clearSearchButton}
          onPress={() => onChangeText('')}
          hitSlop={CLEAR_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('settings.clear')}
        >
          <Ionicons name="close-circle" size={18} color={colors.bibleSecondaryText} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Shown in place of the rows when a search matches no Bible and no language. */
export function TranslationSearchEmptyState() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Text
      testID="translation-picker-search-empty"
      style={[styles.searchEmptyText, { color: colors.bibleSecondaryText }]}
    >
      {t('bible.translationSearchNoResults')}
    </Text>
  );
}

export const LanguageSearchResultRow = memo(function LanguageSearchResultRow({
  language,
  isSelected,
  onSelect,
}: {
  language: TranslationLanguageSearchResult;
  isSelected: boolean;
  onSelect: (language: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      testID="translation-picker-language-search-result"
      style={[
        styles.groupRow,
        groupRowStyle.only,
        styles.languageRow,
        {
          backgroundColor: isSelected
            ? hexWithAlpha(colors.bibleAccent, 0.08)
            : colors.bibleSurface,
          borderColor: colors.bibleDivider,
        },
      ]}
      onPress={() => onSelect(language.value)}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Ionicons name="globe-outline" size={18} color={colors.bibleSecondaryText} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.biblePrimaryText }]}>{language.label}</Text>
        <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]}>
          {language.translationCount}
        </Text>
      </View>
      <Ionicons
        name={isSelected ? 'checkmark' : 'chevron-forward'}
        size={18}
        color={isSelected ? colors.bibleAccent : colors.bibleSecondaryText}
      />
    </TouchableOpacity>
  );
});

// The language filter is a small control, not a section of its own: a pill
// that names the current language and opens the language list.
export const LanguagePreferencePill = memo(function LanguagePreferencePill({
  languageLabel,
  onPress,
}: {
  languageLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.preferenceRow}>
      <TouchableOpacity
        style={[
          styles.languagePill,
          { backgroundColor: colors.bibleElevatedSurface, borderColor: colors.bibleDivider },
        ]}
        onPress={onPress}
        activeOpacity={0.82}
        hitSlop={5}
        accessibilityRole="button"
        accessibilityLabel={t('translations.languagePreference')}
        accessibilityValue={{ text: languageLabel }}
        testID="translation-picker-language-pill"
      >
        <Ionicons name="globe-outline" size={15} color={colors.bibleSecondaryText} />
        <Text style={[styles.languagePillLabel, { color: colors.biblePrimaryText }]}>
          {languageLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.bibleSecondaryText} />
      </TouchableOpacity>
    </View>
  );
});

// The single heading style in the sheet: one eyebrow, indented to the row text.
export function PickerSectionHeader({ label }: { label: string }) {
  const { colors } = useTheme();

  return (
    <Text
      accessibilityRole="header"
      style={[styles.sectionEyebrow, { color: colors.bibleSecondaryText }]}
    >
      {label}
    </Text>
  );
}
