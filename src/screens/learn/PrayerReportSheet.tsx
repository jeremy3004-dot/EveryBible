import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppButton, Sheet } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../design/system';
import { PRAYER_REPORT_REASONS, type PrayerReportReason } from '../../services/prayer/prayerModel';

const NOTE_MAX_CHARS = 500;

const REASON_LABEL_KEYS: Record<PrayerReportReason, string> = {
  spam: 'prayer.reportReasonSpam',
  abuse: 'prayer.reportReasonAbuse',
  sexual: 'prayer.reportReasonSexual',
  harm: 'prayer.reportReasonHarm',
  other: 'prayer.reportReasonOther',
};

interface PrayerReportSheetProps {
  visible: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: PrayerReportReason, note: string) => void;
}

// Report form for one prayer request: a required reason and an optional note. A sheet rather
// than an action sheet, because Android alerts hold at most three buttons and no text field.
export function PrayerReportSheet({
  visible,
  isSubmitting,
  onClose,
  onSubmit,
}: PrayerReportSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [reason, setReason] = useState<PrayerReportReason | null>(null);
  // The wall keys this sheet by the reported request, so each report starts blank.
  const [note, setNote] = useState('');

  return (
    <Sheet visible={visible} onClose={onClose} title={t('prayer.reportTitle')}>
      <Text style={[styles.body, { color: colors.secondaryText }]}>{t('prayer.reportBody')}</Text>
      <View accessibilityRole="radiogroup" style={styles.reasons}>
        {PRAYER_REPORT_REASONS.map((option) => {
          const selected = option === reason;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.reasonRow,
                {
                  borderColor: selected ? colors.accentPrimary : colors.cardBorder,
                  backgroundColor: selected ? colors.accentPrimary + '14' : colors.background,
                },
              ]}
              onPress={() => setReason(option)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Text style={[styles.reasonText, { color: colors.primaryText }]}>
                {t(REASON_LABEL_KEYS[option])}
              </Text>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.accentPrimary : colors.secondaryText}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={[
          styles.noteInput,
          {
            color: colors.primaryText,
            backgroundColor: colors.background,
            borderColor: colors.controlBorder,
          },
        ]}
        placeholder={t('prayer.reportNotePlaceholder')}
        placeholderTextColor={colors.secondaryText}
        accessibilityLabel={t('prayer.reportNotePlaceholder')}
        value={note}
        onChangeText={(text) => setNote(text.slice(0, NOTE_MAX_CHARS))}
        maxLength={NOTE_MAX_CHARS}
        multiline
      />
      <AppButton
        label={t('prayer.reportSend')}
        variant="primary"
        fullWidth
        loading={isSubmitting}
        disabled={!reason || isSubmitting}
        onPress={() => {
          if (reason) onSubmit(reason, note);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    ...typography.body,
    marginBottom: spacing.md,
  },
  reasons: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  reasonText: {
    ...typography.body,
    flex: 1,
  },
  noteInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 72,
    maxHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
});
