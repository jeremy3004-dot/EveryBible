import { useRef } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { ResetPrimaryButton } from './ResetButtons';
import { useResetPasswordStyles } from './resetPasswordStyles';
import type { ResetPasswordFlow } from './useResetPasswordFlow';

type NewPasswordStepProps = Pick<
  ResetPasswordFlow,
  | 'password'
  | 'confirmPassword'
  | 'changePassword'
  | 'changeConfirmPassword'
  | 'showPassword'
  | 'toggleShowPassword'
  | 'isSaving'
  | 'errors'
  | 'formError'
  | 'submitNewPassword'
>;

/** The new password, typed twice under one reveal toggle, then saved. */
export function NewPasswordStep({
  password,
  confirmPassword,
  changePassword,
  changeConfirmPassword,
  showPassword,
  toggleShowPassword,
  isSaving,
  errors,
  formError,
  submitNewPassword,
}: NewPasswordStepProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useResetPasswordStyles();
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const passwordError = errors.password ? t(errors.password) : undefined;
  const confirmError = errors.confirmPassword ? t(errors.confirmPassword) : undefined;

  return (
    <View style={styles.form}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>{t('auth.newPassword')}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.input, styles.passwordInput, passwordError && styles.inputError]}
            value={password}
            onChangeText={changePassword}
            placeholder={t('auth.newPasswordPlaceholder')}
            placeholderTextColor={colors.secondaryText}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!isSaving}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
            blurOnSubmit={false}
            accessibilityLabel={
              passwordError ? `${t('auth.newPassword')}, ${passwordError}` : t('auth.newPassword')
            }
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={toggleShowPassword}
            disabled={isSaving}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            accessibilityState={{ disabled: isSaving }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.secondaryText}
            />
          </TouchableOpacity>
        </View>
        {passwordError ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {passwordError}
          </Text>
        ) : null}
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>{t('auth.confirmNewPassword')}</Text>
        <TextInput
          ref={confirmPasswordInputRef}
          style={[styles.input, confirmError && styles.inputError]}
          value={confirmPassword}
          onChangeText={changeConfirmPassword}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          placeholderTextColor={colors.secondaryText}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isSaving}
          returnKeyType="done"
          onSubmitEditing={submitNewPassword}
          accessibilityLabel={
            confirmError
              ? `${t('auth.confirmNewPassword')}, ${confirmError}`
              : t('auth.confirmNewPassword')
          }
        />
        {confirmError ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {confirmError}
          </Text>
        ) : null}
      </View>

      {formError ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}

      <ResetPrimaryButton
        label={t('auth.resetPasswordSubmit')}
        onPress={submitNewPassword}
        busy={isSaving}
      />
    </View>
  );
}
