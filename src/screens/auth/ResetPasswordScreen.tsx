import { KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import {
  NewPasswordStep,
  ResetConfirmStep,
  ResetProblemStep,
  useResetPasswordFlow,
  useResetPasswordStyles,
} from './resetPassword';

// Reachable only from a password-reset deep link; see resetPassword/resetPasswordModel.ts
// for the confirm → form / problem steps.
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useResetPasswordStyles();
  const insets = useSafeAreaInsets();
  const flow = useResetPasswordFlow();

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
                signedInUserId={flow.signedInUserId}
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
