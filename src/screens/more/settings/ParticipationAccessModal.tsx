import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { AppButton } from '../../../components/ui';
import { TranslationNotCoveredNotice } from '../../../components/feedback/TranslationNotCoveredNotice';
import { layout, radius, spacing, typography } from '../../../design/system';
import type { ParticipationAccessKind } from '../participationAccess';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { modalStyles, useModalButtonsStyle } from './settingsStyles';
import {
  ACCESS_KEYPAD_ROWS,
  isAccessKeypadCommand,
  type AccessKeypadKey,
} from './settingsScreenModel';

interface ParticipationAccessModalProps {
  visible: boolean;
  kind: ParticipationAccessKind;
  passcode: string;
  error: string | null;
  /** Translations an accepted team code opens, when it does not open the current one. */
  coverage: string[] | null;
  isChecking: boolean;
  currentTranslation: string;
  onPressKey: (key: AccessKeypadKey) => void;
  onClose: () => void;
  onSubmit: () => void;
}

/** The keypad passcode dialog for translator review and the Scripture council. */
export function ParticipationAccessModal({
  visible,
  kind,
  passcode,
  error,
  coverage,
  isChecking,
  currentTranslation,
  onPressKey,
  onClose,
  onSubmit,
}: ParticipationAccessModalProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const modalButtonsStyle = useModalButtonsStyle();
  const isCouncil = kind === 'scripture_council';

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
        <TouchableOpacity
          style={modalStyles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('interface.close')}
        />
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
            {isCouncil ? t('feedback.council') : t('settings.translatorAccessTitle')}
          </Text>
          {coverage !== null ? (
            <>
              <TranslationNotCoveredNotice
                translationId={currentTranslation}
                coveredTranslationIds={coverage}
                onSwitched={onClose}
              />
              <View style={modalButtonsStyle}>
                <AppButton
                  label={t('common.done')}
                  variant="primary"
                  size="md"
                  fullWidth={false}
                  onPress={onClose}
                  style={modalStyles.modalButtonFlex}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.translatorAccessBody, { color: colors.secondaryText }]}>
                {isCouncil ? t('feedback.councilAccessBody') : t('settings.translatorAccessBody')}
              </Text>
              <TextInput
                value={passcode}
                accessibilityLabel={t('settings.translatorAccessPlaceholder')}
                editable={false}
                secureTextEntry
                keyboardType="number-pad"
                placeholder={t('settings.translatorAccessPlaceholder')}
                placeholderTextColor={colors.secondaryText}
                style={[
                  styles.translatorAccessInput,
                  {
                    color: colors.primaryText,
                    borderColor: colors.controlBorder,
                    backgroundColor: colors.background,
                  },
                ]}
              />
              {error ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[modalStyles.inlineError, { color: colors.error }]}
                >
                  {error}
                </Text>
              ) : null}
              <View style={styles.translatorKeypad}>
                {ACCESS_KEYPAD_ROWS.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.translatorKeyRow}>
                    {row.map((key) => (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.translatorKey,
                          {
                            backgroundColor: isAccessKeypadCommand(key)
                              ? colors.muted
                              : colors.background,
                          },
                        ]}
                        accessibilityRole="button"
                        onPress={() => onPressKey(key)}
                      >
                        <Text style={[styles.translatorKeyText, { color: colors.primaryText }]}>
                          {key === 'clear'
                            ? t('privacy.clearKey')
                            : key === 'delete'
                              ? t('privacy.deleteKey')
                              : key}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
              <View style={modalButtonsStyle}>
                <AppButton
                  label={t('common.cancel')}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  onPress={onClose}
                  style={modalStyles.modalButtonFlex}
                />
                <AppButton
                  label={t('settings.translatorAccessUnlock')}
                  variant="primary"
                  size="md"
                  fullWidth={false}
                  loading={isChecking}
                  disabled={passcode.length === 0 || isChecking}
                  onPress={onSubmit}
                  style={modalStyles.modalButtonFlex}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  translatorAccessBody: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  translatorAccessInput: {
    ...typography.sectionTitle,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  translatorKeypad: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  translatorKeyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  translatorKey: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translatorKeyText: {
    ...typography.button,
  },
});
