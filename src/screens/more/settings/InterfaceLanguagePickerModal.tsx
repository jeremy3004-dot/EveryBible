import { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { AppButton } from '../../../components/ui';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../../constants/languages';
import { radius, spacing, typography } from '../../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { ICON_STROKE, modalStyles } from './settingsStyles';

const SELECTED_ROW_PEEK = spacing.xl;

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
  // Rows differ in height, so the chosen one is found by its own layout. It is
  // scrolled to once per opening: later layouts must not fight the reader's scrolling.
  const listRef = useRef<ScrollView>(null);
  const hasPositionedRef = useRef(false);
  useEffect(() => {
    if (!visible) hasPositionedRef.current = false;
  }, [visible]);
  const handleSelectedLayout = useCallback((event: LayoutChangeEvent) => {
    if (hasPositionedRef.current) return;
    hasPositionedRef.current = true;
    const { y } = event.nativeEvent.layout;
    // Leave the row above it peeking so the list reads as continuing upwards.
    listRef.current?.scrollTo({ y: Math.max(0, y - SELECTED_ROW_PEEK), animated: false });
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[modalStyles.modalOverlay, { backgroundColor: colors.overlay }]}
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={onClose}
      >
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
            ref={listRef}
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
                onLayout={currentLanguage === language.code ? handleSelectedLayout : undefined}
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
    textAlign: 'left',
    marginBottom: 2,
  },
  languageName: {
    ...typography.caption,
    textAlign: 'left',
  },
  languageHint: {
    ...typography.micro,
    textAlign: 'left',
    marginTop: spacing.xs,
  },
});
