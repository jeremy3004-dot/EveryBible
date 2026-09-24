import { useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
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
            {t('settings.setReminderTime')}
          </Text>

          <View style={styles.timePickerContainer}>
            <TimeColumn
              values={REMINDER_HOURS}
              selected={selectedHour}
              onSelect={onSelectHour}
              format={(hour) => hour.toString().padStart(2, '0')}
            />

            <Text style={[styles.timeSeparator, { color: colors.primaryText }]}>:</Text>

            <TimeColumn
              values={REMINDER_MINUTES}
              selected={selectedMinute}
              onSelect={onSelectMinute}
              format={(minute) => minute}
            />
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

interface TimeColumnProps<T extends number | string> {
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  format: (value: T) => string;
}

/**
 * One scrolling column. It opens scrolled so the selected value sits in the middle:
 * without that the hour column opened at midnight, with the 09 that would be saved
 * highlighted out of sight below it. The modal unmounts its content while hidden, so
 * each opening remounts the column and centres the value selected at that moment; a
 * later tap only moves the highlight, never the column under the finger.
 */
function TimeColumn<T extends number | string>({
  values,
  selected,
  onSelect,
  format,
}: TimeColumnProps<T>) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [openedOn] = useState(selected);

  const centreOpenedValue = (value: T, event: LayoutChangeEvent) => {
    if (value !== openedOn) return;
    const { y, height } = event.nativeEvent.layout;
    scrollRef.current?.scrollTo({
      y: Math.max(0, y + height / 2 - TIME_COLUMN_HEIGHT / 2),
      animated: false,
    });
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.timeColumn}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.timeColumnContent}
    >
      {values.map((value) => (
        <TouchableOpacity
          key={value}
          style={[
            styles.timeOption,
            selected === value && { backgroundColor: colors.accentPrimary },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === value }}
          onPress={() => onSelect(value)}
          onLayout={(event) => centreOpenedValue(value, event)}
        >
          <Text
            style={[
              styles.timeOptionText,
              { color: colors.secondaryText },
              selected === value && { color: colors.onAccent },
            ]}
          >
            {format(value)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const TIME_COLUMN_HEIGHT = 200;

const styles = StyleSheet.create({
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: TIME_COLUMN_HEIGHT,
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
