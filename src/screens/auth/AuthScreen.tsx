import { useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../design/system';
import type { AuthScreenMode, AuthStackParamList } from '../../navigation/types';
import {
  getCurrentSession,
  isSilentAuthError,
  resetPassword,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthResult,
} from '../../services/auth';
import { pullFromCloud } from '../../services/sync';
import { useAuthStore } from '../../stores/authStore';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'AuthScreen'>;
type ScreenRouteProp = RouteProp<AuthStackParamList, 'AuthScreen'>;

interface FormErrors {
  email?: string;
  password?: string;
}

function getModeCopy(t: (key: string) => string, mode: AuthScreenMode) {
  if (mode === 'signUp') {
    return {
      title: t('auth.createAccount'),
      subtitle: t('auth.signUpSubtitle'),
      primaryLabel: t('auth.createAccount'),
      switchLead: t('auth.alreadyHaveAccount'),
      switchAction: t('auth.signIn'),
      successTitle: t('auth.accountCreated'),
      successBody: t('auth.verifyEmailMessage'),
    };
  }

  return {
    title: t('auth.welcomeBack'),
    subtitle: t('auth.signInSubtitle'),
    primaryLabel: t('auth.signIn'),
    switchLead: t('auth.dontHaveAccount'),
    switchAction: t('auth.createAccount'),
    successTitle: '',
    successBody: '',
  };
}

export function AuthScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const setSession = useAuthStore((state) => state.setSession);

  const [mode, setMode] = useState<AuthScreenMode>(route.params?.initialMode ?? 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [verificationNotice, setVerificationNotice] = useState(false);

  const copy = getModeCopy(t, mode);

  const dismiss = () => {
    navigation.getParent()?.goBack();
  };

  const clearTransientState = () => {
    setErrors({});
    setVerificationNotice(false);
  };

  const handleModeChange = (nextMode: AuthScreenMode) => {
    setMode(nextMode);
    clearTransientState();
  };

  const hydrateLiveSession = async (): Promise<boolean> => {
    const { session } = await getCurrentSession();

    if (!session) {
      return false;
    }

    setSession(session);
    return true;
  };

  const completeAuthenticatedFlow = async () => {
    if (!(await hydrateLiveSession())) {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
      return;
    }

    await pullFromCloud();
    dismiss();
  };

  const showAuthFailure = (result: AuthResult, fallbackMessage: string) => {
    if (isSilentAuthError(result.code)) {
      return;
    }

    Alert.alert(
      mode === 'signUp' ? t('auth.signUpFailed') : t('auth.signInFailed'),
      result.error || fallbackMessage
    );
  };

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!email.trim()) {
      nextErrors.email = t('auth.emailRequired');
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      nextErrors.email = t('auth.emailInvalid');
    }

    if (!password) {
      nextErrors.password = t('auth.passwordRequired');
    } else if (password.length < 6) {
      nextErrors.password = t('auth.passwordMinLength');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEmailSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setVerificationNotice(false);

    try {
      if (mode === 'signUp') {
        const result = await signUpWithEmail(email, password);

        if (result.success && result.user) {
          if (await hydrateLiveSession()) {
            await pullFromCloud();
            dismiss();
            return;
          }

          setVerificationNotice(true);
          setPassword('');
          return;
        }

        showAuthFailure(result, t('auth.somethingWentWrong'));
        return;
      }

      const result = await signInWithEmail(email, password);
      if (result.success && result.user) {
        await completeAuthenticatedFlow();
      } else {
        showAuthFailure(result, t('auth.checkCredentials'));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleAuth = async () => {
    setIsLoading(true);

    try {
      const result = await signInWithApple();
      if (result.success && result.user) {
        await completeAuthenticatedFlow();
      } else {
        showAuthFailure(result, t('auth.appleSignInFailed'));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);

    try {
      const result = await signInWithGoogle();
      if (result.success && result.user) {
        await completeAuthenticatedFlow();
      } else {
        showAuthFailure(result, t('auth.googleSignInFailed'));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert(t('auth.emailRequired'), t('auth.emailRequiredForReset'));
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPassword(email);
      if (result.success) {
        Alert.alert(t('auth.checkYourEmail'), t('auth.resetLinkSent'));
      } else {
        Alert.alert(t('common.error'), result.error || t('auth.resetEmailError'));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <TouchableOpacity style={styles.closeButton} onPress={dismiss}>
              <Ionicons name="close" size={28} color={colors.primaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>

            {verificationNotice ? (
              <View style={styles.noticeCard}>
                <View style={styles.noticeHeader}>
                  <Ionicons name="mail-open-outline" size={20} color={colors.accentPrimary} />
                  <Text style={styles.noticeTitle}>{copy.successTitle}</Text>
                </View>
                <Text style={styles.noticeBody}>{copy.successBody}</Text>
                <TouchableOpacity
                  style={styles.noticeButton}
                  onPress={() => handleModeChange('signIn')}
                  disabled={isLoading}
                >
                  <Text style={styles.noticeButtonText}>{t('auth.signIn')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.providerSection}>
              {Platform.OS === 'ios' ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    mode === 'signUp'
                      ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                      : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={handleAppleAuth}
                />
              ) : null}

              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleAuth}
                disabled={isLoading}
              >
                <Ionicons name="logo-google" size={20} color={colors.accentPrimary} />
                <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('common.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setErrors((current) => ({ ...current, email: undefined }));
                  }}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.secondaryText}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!isLoading}
                />
                {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.password')}</Text>
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
                      setErrors((current) => ({ ...current, password: undefined }));
                    }}
                    placeholder={
                      mode === 'signUp' ? t('auth.passwordHint') : t('auth.passwordPlaceholder')
                    }
                    placeholderTextColor={colors.secondaryText}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((current) => !current)}
                    disabled={isLoading}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={22}
                      color={colors.secondaryText}
                    />
                  </TouchableOpacity>
                </View>
                {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
              </View>

              {mode === 'signIn' ? (
                <TouchableOpacity onPress={handleForgotPassword} disabled={isLoading}>
                  <Text style={styles.forgotPassword}>{t('auth.forgotPassword')}</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleEmailSubmit}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.primaryButtonText}>{copy.primaryLabel}</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{copy.switchLead} </Text>
              <TouchableOpacity
                onPress={() => handleModeChange(mode === 'signIn' ? 'signUp' : 'signIn')}
                disabled={isLoading}
              >
                <Text style={styles.footerLink}>{copy.switchAction}</Text>
              </TouchableOpacity>
            </View>
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
    noticeCard: {
      backgroundColor: colors.cardBackground,
      borderColor: colors.cardBorder,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.lg,
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    noticeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    noticeTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    noticeBody: {
      ...typography.body,
      color: colors.secondaryText,
    },
    noticeButton: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.sm,
    },
    noticeButtonText: {
      ...typography.bodyStrong,
      color: colors.accentPrimary,
    },
    providerSection: {
      gap: spacing.md,
    },
    appleButton: {
      height: 50,
    },
    googleButton: {
      height: 52,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      backgroundColor: colors.cardBackground,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    googleButtonText: {
      ...typography.button,
      color: colors.primaryText,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.xl,
      gap: spacing.md,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.cardBorder,
    },
    dividerText: {
      ...typography.micro,
      color: colors.secondaryText,
      textTransform: 'uppercase',
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
      borderColor: colors.cardBorder,
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
    forgotPassword: {
      ...typography.bodyStrong,
      color: colors.accentPrimary,
      textAlign: 'right',
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
    buttonDisabled: {
      opacity: 0.7,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.xl,
      flexWrap: 'wrap',
    },
    footerText: {
      ...typography.body,
      color: colors.secondaryText,
    },
    footerLink: {
      ...typography.bodyStrong,
      color: colors.accentPrimary,
    },
  });
