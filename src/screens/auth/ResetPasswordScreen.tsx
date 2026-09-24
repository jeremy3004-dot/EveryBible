import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';
import {
  NewPasswordStep,
  ResetConfirmStep,
  ResetProblemStep,
  resetStepCopy,
  useResetPasswordFlow,
  useResetPasswordStyles,
} from './resetPassword';

// Reachable only from a password-reset deep link. It asks before the link's code is
// exchanged (confirm), then takes the new password (form); a link that cannot be
// used explains why and can email a new one (problem). See resetPassword/.
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useResetPasswordStyles();
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  const flow = useResetPasswordFlow();
  const copy = resetStepCopy(flow.phase, flow.problem, flow.signedInUserId !== null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          // Only the top edge is safe-area padded; keep the submit button clear of an
          // Android three-button navigation bar (edge-to-edge draws content beneath it).
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={flow.cancel}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
            >
              <Ionicons name="close" size={28} color={colors.primaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
              accessibilityRole="header"
              style={[styles.title, displayFont.bold]}
            >
              {t(copy.titleKey)}
            </Text>
            <Text
              style={styles.subtitle}
              accessibilityLiveRegion={copy.liveSubtitle ? 'polite' : undefined}
            >
              {t(copy.subtitleKey)}
            </Text>

            {flow.phase === 'problem' ? (
              <ResetProblemStep
                problem={flow.problem}
                resendEmail={flow.resendEmail}
                changeResendEmail={flow.changeResendEmail}
                isResending={flow.isResending}
                resendError={flow.resendError}
                sendNewLink={flow.sendNewLink}
                cancel={flow.cancel}
              />
            ) : flow.phase === 'confirm' ? (
              <ResetConfirmStep
                isActivating={flow.isActivating}
                confirmAccount={flow.confirmAccount}
                cancel={flow.cancel}
              />
            ) : (
              <NewPasswordStep
                password={flow.password}
                confirmPassword={flow.confirmPassword}
                changePassword={flow.changePassword}
                changeConfirmPassword={flow.changeConfirmPassword}
                showPassword={flow.showPassword}
                toggleShowPassword={flow.toggleShowPassword}
                isSaving={flow.isSaving}
                errors={flow.errors}
                formError={flow.formError}
                submitNewPassword={flow.submitNewPassword}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
