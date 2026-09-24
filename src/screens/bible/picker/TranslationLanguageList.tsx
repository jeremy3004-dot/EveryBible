import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import { hexWithAlpha } from '../../../utils';
import type { TranslationLanguageOption } from '../bibleTranslationModel';
import { groupRowStyle, pickerStyles as styles } from './pickerStyles';
import { groupPosition } from './translationPickerRowsModel';

/** The picker's language mode: every language with its Bible count, and a way back. */
export function TranslationLanguageList({
  languageOptions,
  selectedLanguage,
  onSelectLanguage,
  onBack,
}: {
  languageOptions: TranslationLanguageOption[];
  selectedLanguage: string | null;
  onSelectLanguage: (language: string) => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <ScrollView
      style={styles.translationList}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={styles.translationListContent}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        style={styles.languageModeBackButton}
        onPress={onBack}
        activeOpacity={0.75}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={16} color={colors.bibleAccent} />
        <Text style={[styles.languageModeBackText, { color: colors.bibleAccent }]}>
          {t('translations.languagePreference')}
        </Text>
      </TouchableOpacity>

      {languageOptions.map((language, index) => {
        const isSelected = selectedLanguage === language.value;
        const position = groupPosition(index, languageOptions.length);

        return (
          <TouchableOpacity
            key={language.value}
            style={[
              styles.groupRow,
              groupRowStyle[position],
              styles.languageRow,
              {
                backgroundColor: isSelected
                  ? hexWithAlpha(colors.bibleAccent, 0.08)
                  : colors.bibleSurface,
                borderColor: colors.bibleDivider,
              },
            ]}
            onPress={() => onSelectLanguage(language.value)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.biblePrimaryText }]}>
                {language.label}
              </Text>
              <Text style={[styles.rowMeta, { color: colors.bibleSecondaryText }]}>
                {language.count}
              </Text>
            </View>
            {isSelected ? <Ionicons name="checkmark" size={18} color={colors.bibleAccent} /> : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
