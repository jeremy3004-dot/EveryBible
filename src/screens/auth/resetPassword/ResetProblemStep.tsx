import { Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { canRequestNewLink } from './resetPasswordModel';
import { ResetPrimaryButton, ResetSecondaryButton } from './ResetButtons';
import { useResetPasswordStyles } from './resetPasswordStyles';
import type { ResetPasswordFlow } from './useResetPasswordFlow';

type ResetProblemStepProps = Pick<
  ResetPasswordFlow,
  | 'problem'
  | 'resendEmail'
  | 'changeResendEmail'
  | 'isResending'
  | 'resendError'
  | 'sendNewLink'
  | 'cancel'
>;

/** With a backend, emails a new link to the address given; Cancel closes the flow. */
export function ResetProblemStep({
  problem,
  resendEmail,
  changeResendEmail,
  isResending,
  resendError,
  sendNewLink,
  cancel,
}: ResetProblemStepProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useResetPasswordStyles();

  return (
    <View style={styles.form}>
      {canRequestNewLink(problem) ? (
        <>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <TextInput
              style={[styles.input, resendError ? styles.inputError : null]}
              value={resendEmail}
              onChangeText={changeResendEmail}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={colors.secondaryText}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!isResending}
              returnKeyType="send"
              onSubmitEditing={() => void sendNewLink()}
              accessibilityLabel={
                resendError ? `${t('auth.email')}, ${resendError}` : t('auth.email')
              }
            />
            {resendError ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {resendError}
              </Text>
            ) : null}
          </View>

          <ResetPrimaryButton
            label={t('auth.sendNewResetLink')}
            onPress={() => void sendNewLink()}
            busy={isResending}
          />
        </>
      ) : null}

      <ResetSecondaryButton label={t('common.cancel')} onPress={cancel} disabled={isResending} />
    </View>
  );
}
