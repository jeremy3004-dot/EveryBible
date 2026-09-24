import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { AppButton } from '../../../components/ui';
import { radius, spacing, typography } from '../../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { modalStyles, useModalButtonsStyle } from './settingsStyles';

interface ChapterFeedbackIdentityModalProps {
  visible: boolean;
  name: string;
  role: string;
  error: string | null;
  isSaving: boolean;
  onChangeName: (value: string) => void;
  onChangeRole: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

/** The name-and-role form a chapter feedback response is signed with. */
export function ChapterFeedbackIdentityModal({
  visible,
  name,
  role,
  error,
  isSaving,
  onChangeName,
  onChangeRole,
  onClose,
  onSave,
}: ChapterFeedbackIdentityModalProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const modalButtonsStyle = useModalButtonsStyle();
  const inputStyle = [
    styles.feedbackIdentityInput,
    {
      color: colors.primaryText,
      borderColor: colors.controlBorder,
      backgroundColor: colors.background,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[modalStyles.modalOverlay, { backgroundColor: colors.overlay }]}
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
            styles.chapterFeedbackIdentityModalContent,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={[modalStyles.modalTitle, displayFont.bold, { color: colors.primaryText }]}
          >
            {t('settings.chapterFeedbackIdentityTitle')}
          </Text>
          <Text style={[styles.chapterFeedbackIdentityBody, { color: colors.secondaryText }]}>
            {t('settings.chapterFeedbackIdentityRequired')}
          </Text>

          <View style={styles.feedbackIdentityFields}>
            <View style={styles.feedbackIdentityField}>
              <Text style={[styles.feedbackIdentityLabel, { color: colors.primaryText }]}>
                {t('auth.name')}
              </Text>
              <TextInput
                value={name}
                accessibilityLabel={t('auth.name')}
                onChangeText={onChangeName}
                editable={!isSaving}
                placeholder={t('auth.namePlaceholder')}
                placeholderTextColor={colors.secondaryText}
                style={inputStyle}
              />
            </View>

            <View style={styles.feedbackIdentityField}>
              <Text style={[styles.feedbackIdentityLabel, { color: colors.primaryText }]}>
                {t('settings.chapterFeedbackIdentityRole')}
              </Text>
              <TextInput
                value={role}
                accessibilityLabel={t('settings.chapterFeedbackIdentityRole')}
                onChangeText={onChangeRole}
                editable={!isSaving}
                placeholder={t('settings.chapterFeedbackIdentityRolePlaceholder')}
                placeholderTextColor={colors.secondaryText}
                style={inputStyle}
              />
            </View>
          </View>

          {error ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[modalStyles.inlineError, { color: colors.error }]}
            >
              {error}
            </Text>
          ) : null}

          <View style={modalButtonsStyle}>
            <AppButton
              label={t('common.cancel')}
              variant="secondary"
              size="md"
              fullWidth={false}
              disabled={isSaving}
              onPress={onClose}
              style={modalStyles.modalButtonFlex}
            />
            <AppButton
              label={t('common.save')}
              variant="primary"
              size="md"
              fullWidth={false}
              loading={isSaving}
              disabled={isSaving}
              onPress={onSave}
              style={modalStyles.modalButtonFlex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chapterFeedbackIdentityModalContent: {
    width: '88%',
    maxWidth: 360,
  },
  chapterFeedbackIdentityBody: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  feedbackIdentityFields: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  feedbackIdentityField: {
    gap: spacing.sm,
  },
  feedbackIdentityLabel: {
    ...typography.captionStrong,
  },
  feedbackIdentityInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
