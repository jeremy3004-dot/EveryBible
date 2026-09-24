import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { radius, spacing, typography } from '../../design/system';
import type { AuthStackParamList } from '../../navigation/types';
import {
  getCurrentSession,
  resetPassword,
  signOut,
  updatePassword,
  type AuthResult,
} from '../../services/auth';
import {
  activatePendingPasswordRecovery,
  clearPendingPasswordRecovery,
  getPendingPasswordRecovery,
} from '../../services/auth/authDeepLink';
import {
  recoveryProblemMessageKey,
  type RecoveryProblem,
} from '../../services/auth/authRecoveryLink';
import { pullFromCloud } from '../../services/sync';
import { useAuthStore } from '../../stores/authStore';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../design/largeTextLayout';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;

interface FormErrors {
  password?: string;
  confirmPassword?: string;
}

// The screen is only reachable from a password-reset deep link. The link's PKCE
// code is parked (never exchanged) until the user confirms here — see
// ../../services/auth/authDeepLink.ts. A link that cannot be used (an old
// implicit-flow link, an expired one, or one opened on another device) lands in
// the 'problem' phase, which explains why and can send a fresh link.
type ResetPhase = 'confirm' | 'form' | 'problem';

export function ResetPasswordScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const displayFont = useDisplayFont();
  const insets = useSafeAreaInsets();
  const setSession = useAuthStore((state) => state.setSession);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  // Captured once: the link as it was when the screen opened.
  const [pendingRecovery] = useState(() => getPendingPasswordRecovery());
  // Live: Continue signs this account out before the code is exchanged, and the
  // confirm step says so while someone is signed in.
  const signedInUserId = useAuthStore((state) => state.user?.uid ?? null);

  const [phase, setPhase] = useState<ResetPhase>(() =>
    pendingRecovery?.kind === 'code' ? 'confirm' : 'problem'
  );
  const [problem, setProblem] = useState<RecoveryProblem>('expired');
  const [isActivating, setIsActivating] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const didActivateRef = useRef(false);
  const didUpdatePasswordRef = useRef(false);

  // Leaving the screen must never strand a live recovery session. Any account that
  // was signed in was signed out before the exchange, so the recovery session is
  // the only one here and ends with the screen unless the password was set.
  useEffect(() => {
    return () => {
      clearPendingPasswordRecovery();
      if (didActivateRef.current && !didUpdatePasswordRef.current) {
        void signOut();
      }
    };
  }, []);

  const dismiss = () => {
    navigation.getParent()?.goBack();
  };

  const handleCancel = useCallback(() => {
    clearPendingPasswordRecovery();
    dismiss();
    // dismiss is a stable navigation call; re-creating it would not change behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const handleConfirmAccount = useCallback(async () => {
    setIsActivating(true);
    try {
      // Read now, not at render: the exchange replaces this device's session, so a
      // signed-in account goes through the normal sign-out first.
      const result = await activatePendingPasswordRecovery({
        signedInUserId: useAuthStore.getState().user?.uid ?? null,
        signOutCurrentAccount: () => useAuthStore.getState().signOut(),
      });

      if (result.status === 'activated') {
        didActivateRef.current = true;
        setPhase('form');
        return;
      }

      setProblem(result.status === 'failed' ? result.problem : 'expired');
      setPhase('problem');
    } finally {
      setIsActivating(false);
    }
  }, []);

  // The new link is requested from this install, so its code verifier is stored
  // here and the emailed link works on this device.
  const handleSendNewLink = async () => {
    const email = resendEmail.trim();
    if (!email) {
      setResendError(t('auth.emailRequiredForReset'));
      return;
    }

    setResendError(null);
    setIsResending(true);
    try {
      const result = await resetPassword(email);
      if (!result.success) {
        setResendError(t('auth.resetEmailError'));
        return;
      }
      Alert.alert(t('auth.checkYourEmail'), t('auth.resetLinkSent'), [
        { text: t('common.ok'), onPress: dismiss },
      ]);
    } catch {
      setResendError(t('auth.resetEmailError'));
    } finally {
      setIsResending(false);
    }
  };

  // result.error is always raw, untranslated English from the auth service layer.
  // Never surface it directly — map by code instead so every locale shows translated text.
  const getFailureMessage = (result: AuthResult): string => {
    if (result.code === 'service_unavailable') {
      return t('auth.serviceUnavailable');
    }
    if (result.code === 'configuration') {
      return t('auth.backendNotConfigured');
    }
    // No active/valid recovery session (expired or already-used link) also lands here,
    // since Supabase reports it as a generic auth error rather than a distinct code.
    return t('auth.resetPasswordInvalidSession');
  };

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!password) {
      nextErrors.password = t('auth.passwordRequired');
    } else if (password.length < 6) {
      nextErrors.password = t('auth.passwordMinLength');
    }

    if (confirmPassword !== password) {
      nextErrors.confirmPassword = t('auth.passwordsDoNotMatch');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setFormError(null);
    try {
      const result = await updatePassword(password);

      if (!result.success) {
        setFormError(getFailureMessage(result));
        return;
      }

      didUpdatePasswordRef.current = true;

      const { session } = await getCurrentSession();
      if (session) {
        setSession(session);
        await pullFromCloud(session.user.id);
      }

      Alert.alert(t('auth.resetPasswordSuccess'), undefined, [
        { text: t('common.ok'), onPress: dismiss },
      ]);
    } catch {
      setFormError(t('auth.resetPasswordError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Without a backend a new link cannot be sent either.
  const canResend = problem !== 'configuration';

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
              onPress={handleCancel}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
            >
              <Ionicons name="close" size={28} color={colors.primaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {phase === 'problem' ? (
              <>
                <Text
                  maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
                  accessibilityRole="header"
                  style={[styles.title, displayFont.bold]}
                >
                  {t('auth.resetPasswordTitle')}
                </Text>
                <Text style={styles.subtitle} accessibilityLiveRegion="polite">
                  {t(recoveryProblemMessageKey(problem))}
                </Text>

                <View style={styles.form}>
                  {canResend ? (
                    <>
                      <View style={styles.inputContainer}>
                        <Text style={styles.label}>{t('auth.email')}</Text>
                        <TextInput
                          style={[styles.input, resendError ? styles.inputError : null]}
                          value={resendEmail}
                          onChangeText={(text) => {
                            setResendEmail(text);
                            setResendError(null);
                          }}
                          placeholder={t('auth.emailPlaceholder')}
                          placeholderTextColor={colors.secondaryText}
                          autoCapitalize="none"
                          autoComplete="email"
                          keyboardType="email-address"
                          textContentType="emailAddress"
                          editable={!isResending}
                          returnKeyType="send"
                          onSubmitEditing={() => void handleSendNewLink()}
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

                      <TouchableOpacity
                        style={[styles.primaryButton, isResending && styles.buttonDisabled]}
                        onPress={() => void handleSendNewLink()}
                        disabled={isResending}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={t('auth.sendNewResetLink')}
                        accessibilityState={{ disabled: isResending }}
                      >
                        {isResending ? (
                          <ActivityIndicator color={colors.bibleBackground} />
                        ) : (
                          <Text style={styles.primaryButtonText}>{t('auth.sendNewResetLink')}</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : null}

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleCancel}
                    disabled={isResending}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel')}
                    accessibilityState={{ disabled: isResending }}
                  >
                    <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : phase === 'confirm' ? (
              <>
                <Text
                  maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
                  accessibilityRole="header"
                  style={[styles.title, displayFont.bold]}
                >
                  {t('auth.resetLinkConfirmTitle')}
                </Text>
                <Text style={styles.subtitle}>
                  {signedInUserId
                    ? t('auth.resetLinkSignsOutCurrent')
                    : t('auth.resetPasswordSubtitle')}
                </Text>

                <View style={styles.form}>
                  <TouchableOpacity
                    style={[styles.primaryButton, isActivating && styles.buttonDisabled]}
                    onPress={() => void handleConfirmAccount()}
                    disabled={isActivating}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.continue')}
                    accessibilityState={{ disabled: isActivating }}
                  >
                    {isActivating ? (
                      <ActivityIndicator color={colors.bibleBackground} />
                    ) : (
                      <Text style={styles.primaryButtonText}>{t('common.continue')}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleCancel}
                    disabled={isActivating}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.cancel')}
                    accessibilityState={{ disabled: isActivating }}
                  >
                    <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text
                  maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
                  accessibilityRole="header"
                  style={[styles.title, displayFont.bold]}
                >
                  {t('auth.resetPasswordTitle')}
                </Text>
                <Text style={styles.subtitle}>{t('auth.resetPasswordSubtitle')}</Text>

                <View style={styles.form}>
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('auth.newPassword')}</Text>
                    <View style={styles.passwordContainer}>
                      <TextInput
                        style={[
                          styles.input,
                          styles.passwordInput,
                          errors.password && styles.inputError,
                        ]}
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          setFormError(null);
                          setErrors((current) => ({ ...current, password: undefined }));
                        }}
                        placeholder={t('auth.newPasswordPlaceholder')}
                        placeholderTextColor={colors.secondaryText}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        textContentType="newPassword"
                        editable={!isLoading}
                        returnKeyType="next"
                        onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                        blurOnSubmit={false}
                        accessibilityLabel={
                          errors.password
                            ? `${t('auth.newPassword')}, ${errors.password}`
                            : t('auth.newPassword')
                        }
                      />
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => setShowPassword((current) => !current)}
                        disabled={isLoading}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                        }
                        accessibilityState={{ disabled: isLoading }}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={22}
                          color={colors.secondaryText}
                        />
                      </TouchableOpacity>
                    </View>
                    {errors.password ? (
                      <Text style={styles.errorText} accessibilityLiveRegion="polite">
                        {errors.password}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('auth.confirmNewPassword')}</Text>
                    <TextInput
                      ref={confirmPasswordInputRef}
                      style={[styles.input, errors.confirmPassword && styles.inputError]}
                      value={confirmPassword}
                      onChangeText={(text) => {
                        setConfirmPassword(text);
                        setFormError(null);
                        setErrors((current) => ({ ...current, confirmPassword: undefined }));
                      }}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      placeholderTextColor={colors.secondaryText}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      editable={!isLoading}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                      accessibilityLabel={
                        errors.confirmPassword
                          ? `${t('auth.confirmNewPassword')}, ${errors.confirmPassword}`
                          : t('auth.confirmNewPassword')
                      }
                    />
                    {errors.confirmPassword ? (
                      <Text style={styles.errorText} accessibilityLiveRegion="polite">
                        {errors.confirmPassword}
                      </Text>
                    ) : null}
                  </View>

                  {formError ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">
                      {formError}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.resetPasswordSubmit')}
                    accessibilityState={{ disabled: isLoading }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={colors.bibleBackground} />
                    ) : (
                      <Text style={styles.primaryButtonText}>{t('auth.resetPasswordSubmit')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
    },
    headerSpacer: {
      width: 36,
    },
    closeButton: {
      padding: spacing.xs,
    },
    content: {
      flex: 1,
      padding: spacing.xl,
      paddingTop: 0,
    },
    title: {
      ...typography.screenTitle,
      color: colors.primaryText,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      color: colors.secondaryText,
      marginBottom: spacing.xl,
    },
    form: {
      gap: spacing.lg,
    },
    inputContainer: {
      gap: spacing.xs,
    },
    label: {
      ...typography.micro,
      color: colors.primaryText,
      fontWeight: '600',
    },
    input: {
      backgroundColor: colors.cardBackground,
      borderColor: colors.controlBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.primaryText,
      fontSize: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    inputError: {
      borderColor: colors.error,
    },
    passwordContainer: {
      position: 'relative',
      justifyContent: 'center',
    },
    passwordInput: {
      paddingRight: spacing.xxxl,
    },
    eyeButton: {
      position: 'absolute',
      right: spacing.md,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    errorText: {
      ...typography.micro,
      color: colors.error,
    },
    primaryButton: {
      backgroundColor: colors.bibleControlBackground,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.lg,
    },
    primaryButtonText: {
      ...typography.button,
      color: colors.bibleBackground,
    },
    secondaryButton: {
      alignItems: 'center',
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: 'center',
      paddingVertical: spacing.lg,
    },
    secondaryButtonText: {
      ...typography.button,
      color: colors.primaryText,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
  });
