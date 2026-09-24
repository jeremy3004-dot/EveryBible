import { Modal, StyleSheet, Text, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks';
import { AppButton } from '../../../components/ui';
import { spacing, typography } from '../../../design/system';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { ICON_STROKE, modalStyles, useModalButtonsStyle } from './settingsStyles';

interface DeleteAccountModalProps {
  visible: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** The last stop before an account and its data on this device are deleted. */
export function DeleteAccountModal({
  visible,
  isDeleting,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
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
      onRequestClose={() => !isDeleting && onClose()}
    >
      <View style={[modalStyles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            modalStyles.modalContent,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
          ]}
        >
          <TriangleAlert
            size={44}
            color={colors.error}
            strokeWidth={ICON_STROKE}
            style={styles.deleteWarningIcon}
          />
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
            accessibilityRole="header"
            style={[modalStyles.modalTitle, displayFont.bold, { color: colors.primaryText }]}
          >
            {t('settings.deleteAccount')}
          </Text>
          <Text style={[styles.deleteWarningText, { color: colors.secondaryText }]}>
            {t('settings.deleteAccountWarning')}
          </Text>

          <View style={modalButtonsStyle}>
            <AppButton
              label={t('common.cancel')}
              variant="secondary"
              fullWidth={false}
              disabled={isDeleting}
              onPress={onClose}
              style={modalStyles.modalButtonFlex}
            />
            <AppButton
              label={t('settings.delete')}
              variant="destructive"
              fullWidth={false}
              loading={isDeleting}
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
  deleteWarningIcon: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  deleteWarningText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
