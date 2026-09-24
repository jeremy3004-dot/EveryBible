import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks';
import { AppButton } from '../../../components/ui';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../../constants/languages';
import { radius, spacing, typography } from '../../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { ICON_STROKE, modalStyles } from './settingsStyles';

interface InterfaceLanguagePickerModalProps {
  visible: boolean;
  currentLanguage: LanguageCode;
  onSelect: (languageCode: LanguageCode) => void;
  onClose: () => void;
}

/** Every bundled interface language, each named in itself, in English and as an app label. */
export function InterfaceLanguagePickerModal({
  visible,
  currentLanguage,
  onSelect,
  onClose,
}: InterfaceLanguagePickerModalProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[modalStyles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            modalStyles.modalContent,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={[modalStyles.modalTitle, displayFont.bold, { color: colors.primaryText }]}
          >
            {t('settings.selectLanguage')}
          </Text>

          <ScrollView
            style={styles.languageList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.languageListContent}
          >
            {SUPPORTED_LANGUAGES.map((language) => (
              <TouchableOpacity
                key={language.code}
                style={[
                  styles.languageOption,
                  { borderBottomColor: colors.borderStrong },
                  currentLanguage === language.code && {
                    backgroundColor: colors.accentSoft,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: currentLanguage === language.code }}
                onPress={() => onSelect(language.code)}
              >
                <View style={styles.languageInfo}>
                  <Text style={[styles.languageNative, { color: colors.primaryText }]}>
                    {language.nativeName}
                  </Text>
                  <Text style={[styles.languageName, { color: colors.secondaryText }]}>
                    {language.name}
                  </Text>
                  <Text
                    style={[styles.languageHint, { color: colors.secondaryText }]}
                    numberOfLines={2}
                  >
                    {language.appLanguageLabel}
                  </Text>
                </View>
                {currentLanguage === language.code && (
                  <CheckCircle2 size={22} color={colors.accentPrimary} strokeWidth={ICON_STROKE} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <AppButton
            label={t('common.cancel')}
            variant="secondary"
            size="md"
            onPress={onClose}
            style={styles.languageCancelButton}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  languageList: {
    marginBottom: spacing.sm,
    maxHeight: 420,
  },
  languageListContent: {
    paddingBottom: spacing.xs,
  },
  languageCancelButton: {
    marginTop: spacing.lg,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  languageInfo: {
    flex: 1,
  },
  languageNative: {
    ...typography.cardTitle,
    marginBottom: 2,
  },
  languageName: {
    ...typography.caption,
  },
  languageHint: {
    ...typography.micro,
    marginTop: spacing.xs,
  },
});
