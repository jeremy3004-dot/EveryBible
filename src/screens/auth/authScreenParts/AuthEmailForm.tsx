import { useRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { AppButton, PressableScale } from '../../../components/ui';
import { authModeCopyKeys } from './authFormModel';
import { AuthFieldError } from './AuthFieldError';
import { useAuthScreenStyles } from './authScreenStyles';
import type { AuthFlow } from './useAuthFlow';

type AuthEmailFormProps = Pick<
  AuthFlow,
  | 'mode'
  | 'email'
  | 'password'
  | 'showPassword'
  | 'isLoading'
  | 'errors'
  | 'changeEmail'
  | 'changePassword'
  | 'toggleShowPassword'
  | 'submitEmail'
  | 'sendPasswordReset'
>;

/** The email and password fields, "forgot password" in sign-in mode, and the primary button. */
export function AuthEmailForm({
  mode,
  email,
  password,
  showPassword,
  isLoading,
  errors,
  changeEmail,
  changePassword,
  toggleShowPassword,
  submitEmail,
  sendPasswordReset,
}: AuthEmailFormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useAuthScreenStyles();
  const displayFont = useDisplayFont();
  const passwordInputRef = useRef<TextInput>(null);
  const copy = authModeCopyKeys(mode);
  const isSignUp = mode === 'signUp';
  const emailError = errors.email ? t(errors.email) : undefined;
  const passwordError = errors.password ? t(errors.password) : undefined;

  return (
    <View style={styles.form}>
      <View style={styles.inputContainer}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, displayFont.regular]}>{t('auth.email')}</Text>
        </View>
        <TextInput
          style={[styles.input, emailError && styles.inputError]}
          value={email}
          onChangeText={changeEmail}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          editable={!isLoading}
          returnKeyType="next"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
          blurOnSubmit={false}
          accessibilityLabel={emailError ? `${t('auth.email')}, ${emailError}` : t('auth.email')}
        />
        {emailError ? <AuthFieldError message={emailError} /> : null}
      </View>

      <View style={styles.inputContainer}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, displayFont.regular]}>{t('auth.password')}</Text>
          {mode === 'signIn' ? (
            <PressableScale
              onPress={sendPasswordReset}
              disabled={isLoading}
              hitSlop={8}
              haptic="light"
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoading }}
            >
              <Text style={styles.forgotPassword}>{t('auth.forgotPassword')}</Text>
            </PressableScale>
          ) : null}
        </View>
        <View style={styles.passwordContainer}>
          <TextInput
            ref={passwordInputRef}
            style={[styles.input, styles.passwordInput, passwordError && styles.inputError]}
            value={password}
            onChangeText={changePassword}
            placeholder={t(copy.passwordPlaceholder)}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            editable={!isLoading}
            returnKeyType={isSignUp ? 'next' : 'go'}
            onSubmitEditing={submitEmail}
            accessibilityLabel={
              passwordError ? `${t('auth.password')}, ${passwordError}` : t('auth.password')
            }
          />
          <PressableScale
            style={styles.eyeButton}
            onPress={toggleShowPassword}
            disabled={isLoading}
            hitSlop={8}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            accessibilityState={{ disabled: isLoading }}
          >
            {showPassword ? (
              <EyeOff size={18} color={colors.secondaryText} strokeWidth={2} />
            ) : (
              <Eye size={18} color={colors.secondaryText} strokeWidth={2} />
            )}
          </PressableScale>
        </View>
        {passwordError ? <AuthFieldError message={passwordError} /> : null}
      </View>

      <AppButton
        label={t(copy.primaryLabel)}
        onPress={submitEmail}
        loading={isLoading}
        disabled={isLoading}
        style={styles.primaryButton}
      />
    </View>
  );
}
