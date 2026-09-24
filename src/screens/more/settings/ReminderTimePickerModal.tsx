import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks';
import { AppButton } from '../../../components/ui';
import { radius, spacing, typography } from '../../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { modalStyles, useModalButtonsStyle } from './settingsStyles';
import { REMINDER_HOURS, REMINDER_MINUTES } from './settingsScreenModel';

interface ReminderTimePickerModalProps {
  visible: boolean;
  selectedHour: number;
  selectedMinute: string;
  onSelectHour: (hour: number) => void;
  onSelectMinute: (minute: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/** Two scrolling columns — hours, then quarter hours — for the daily reminder. */
export function ReminderTimePickerModal({
  visible,
  selectedHour,
  selectedMinute,
  onSelectHour,
  onSelectMinute,
  onClose,
  onConfirm,
}: ReminderTimePickerModalProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const modalButtonsStyle = useModalButtonsStyle();

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
            {t('settings.setReminderTime')}
          </Text>

          <View style={styles.timePickerContainer}>
            <ScrollView
              style={styles.timeColumn}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timeColumnContent}
            >
              {REMINDER_HOURS.map((hour) => (
                <TouchableOpacity
                  key={hour}
                  style={[
                    styles.timeOption,
                    selectedHour === hour && { backgroundColor: colors.accentPrimary },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedHour === hour }}
                  onPress={() => onSelectHour(hour)}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      { color: colors.secondaryText },
                      selectedHour === hour && {
                        color: colors.onAccent,
                      },
                    ]}
                  >
                    {hour.toString().padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.timeSeparator, { color: colors.primaryText }]}>:</Text>

            <ScrollView
              style={styles.timeColumn}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timeColumnContent}
            >
              {REMINDER_MINUTES.map((minute) => (
                <TouchableOpacity
                  key={minute}
                  style={[
                    styles.timeOption,
                    selectedMinute === minute && { backgroundColor: colors.accentPrimary },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMinute === minute }}
                  onPress={() => onSelectMinute(minute)}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      { color: colors.secondaryText },
                      selectedMinute === minute && {
                        color: colors.onAccent,
                      },
                    ]}
                  >
                    {minute}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
              label={t('settings.setTime')}
              variant="primary"
              size="md"
              fullWidth={false}
              onPress={onConfirm}
              style={modalStyles.modalButtonFlex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginBottom: spacing.lg,
  },
  timeColumn: {
    flex: 1,
    maxWidth: 80,
  },
  timeColumnContent: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  timeOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    marginVertical: 2,
  },
  // ASCII digits only, so these keep the display face without a locale fallback.
  timeOptionText: {
    ...typography.numeralRow,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.8,
  },
  timeSeparator: {
    ...typography.numeralRow,
    marginHorizontal: spacing.sm,
  },
});
