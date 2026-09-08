import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleAlert, Eye, EyeOff, MailOpen, X } from 'lucide-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { layout, motion, radius, shadows, spacing, typography } from '../../design/system';
import { AppButton, AppCard, IconButton, PressableScale } from '../../components/ui';
import { errorHaptic } from '../../utils/haptics';
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

// The app mark, shown at 52pt above the title. Same asset the About screen uses.
const APP_ICON = require('../../../assets/icon.png');
// Google's official multicolour "G". It is a brand asset, not an icon we may
// recolour or replace with a Lucide glyph.
const GOOGLE_MARK = require('../../../assets/icons/google-g.png');

const APP_ICON_SIZE = 52;
const GOOGLE_MARK_SIZE = 18;
const FIELD_HEIGHT = 48;
const PROVIDER_GAP = 10;

interface FormErrors {
  email?: string;
  password?: string;
}

function getModeCopy(t: (key: string) => string, mode: AuthScreenMode) {
  if (mode === 'signUp') {
    return {
      title: t('auth.createAnAccount'),
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
    switchLead: t('auth.newHere'),
    switchAction: t('auth.createAnAccount'),
    successTitle: '',
    successBody: '',
  };
}

// The Google strip: geometrically the `secondary` AppButton (50pt paper pill,
// hairline border, card shadow), but its leading mark is a brand bitmap rather
// than a LucideIcon, which AppButton cannot take. Kept screen-local so the
// shared primitive stays icon-typed.
function GoogleButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={disabled ? undefined : 'medium'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        googleStyles.button,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        shadows.card,
        disabled && googleStyles.disabled,
      ]}
    >
      <Image source={GOOGLE_MARK} style={googleStyles.mark} />
      <Text style={[typography.bodyStrong, { color: colors.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function AuthScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const displayFont = useDisplayFont();
  const reduceMotion = useReducedMotion();
  // Field errors fade+slide in (opacity-only under reduced motion).
  const errorEntering = reduceMotion
    ? FadeIn.duration(motion.duration.base)
    : FadeInDown.duration(motion.duration.fast);
  const passwordInputRef = useRef<TextInput>(null);
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

  const hydrateLiveSession = async (): Promise<string | null> => {
    const { session } = await getCurrentSession();

    if (!session) {
      return null;
    }

    setSession(session);
    return session.user.id;
  };

  const completeAuthenticatedFlow = async () => {
    const userId = await hydrateLiveSession();
    if (!userId) {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
      return;
    }

    await pullFromCloud(userId);
    dismiss();
  };

  // result.error is always raw, untranslated English from the auth service layer.
  // Never surface it directly — map by code instead so every locale shows translated text.
  const getAuthFailureMessage = (result: AuthResult, fallbackMessage: string): string => {
    switch (result.code) {
      case 'in_progress':
        return t('auth.signInAlreadyInProgress');
      case 'provider_unavailable':
        return t('auth.providerUnavailable');
      case 'service_unavailable':
        return t('auth.serviceUnavailable');
      case 'configuration':
        return t('auth.backendNotConfigured');
      default:
        return fallbackMessage;
    }
  };

  const showAuthFailure = (result: AuthResult, fallbackMessage: string) => {
    if (isSilentAuthError(result.code)) {
      return;
    }

    errorHaptic();
    Alert.alert(
      mode === 'signUp' ? t('auth.signUpFailed') : t('auth.signInFailed'),
      getAuthFailureMessage(result, fallbackMessage)
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
          const userId = await hydrateLiveSession();
          if (userId) {
            await pullFromCloud(userId);
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
        Alert.alert(t('common.error'), getAuthFailureMessage(result, t('auth.resetEmailError')));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <IconButton icon={X} onPress={dismiss} accessibilityLabel={t('interface.close')} />
            <Text style={[styles.headerEyebrow, displayFont.regular]}>
              {t('auth.accountEyebrow')}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.content}>
            <Image source={APP_ICON} style={styles.appIcon} accessibilityIgnoresInvertColors />

            <Text style={[styles.title, displayFont.bold]}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>

            {verificationNotice ? (
              <AppCard style={styles.noticeCard}>
                <View style={styles.noticeHeader}>
                  <MailOpen size={18} color={colors.accentPrimary} strokeWidth={2} />
                  <Text style={styles.noticeTitle}>{copy.successTitle}</Text>
                </View>
                <Text style={styles.noticeBody}>{copy.successBody}</Text>
                <AppButton
                  label={t('auth.signIn')}
                  variant="ghost"
                  size="md"
                  fullWidth={false}
                  onPress={() => handleModeChange('signIn')}
                  disabled={isLoading}
                  style={styles.noticeButton}
                />
              </AppCard>
            ) : null}

            <View style={styles.providerSection}>
              {Platform.OS === 'ios' ? (
                // Apple requires its own button for Sign in with Apple, so the
                // spec's plain ink pill is rendered by the native control: same
                // 50pt height and 25pt radius, and the only place in this screen
                // allowed to branch on `isDark` — the control takes a style enum,
                // not a theme colour, and BLACK/WHITE are the two that match the
                // ink pill in each scope.
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    mode === 'signUp'
                      ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                      : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                  }
                  buttonStyle={
                    isDark
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={layout.pillHeight / 2}
                  style={styles.appleButton}
                  onPress={handleAppleAuth}
                />
              ) : null}

              <GoogleButton
                label={t('auth.continueWithGoogle')}
                onPress={handleGoogleAuth}
                disabled={isLoading}
              />
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={[styles.dividerText, displayFont.regular]}>{t('auth.orWithEmail')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, displayFont.regular]}>{t('auth.email')}</Text>
                </View>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setErrors((current) => ({ ...current, email: undefined }));
                  }}
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
                />
                {errors.email ? (
                  <Animated.View entering={errorEntering} style={styles.errorRow}>
                    <CircleAlert size={14} color={colors.error} strokeWidth={2} />
                    <Text style={styles.errorText}>{errors.email}</Text>
                  </Animated.View>
                ) : null}
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, displayFont.regular]}>{t('auth.password')}</Text>
                  {mode === 'signIn' ? (
                    <PressableScale
                      onPress={handleForgotPassword}
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
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                    textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                    editable={!isLoading}
                    returnKeyType={mode === 'signUp' ? 'next' : 'go'}
                    onSubmitEditing={handleEmailSubmit}
                  />
                  <PressableScale
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((current) => !current)}
                    disabled={isLoading}
                    hitSlop={8}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={colors.secondaryText} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={colors.secondaryText} strokeWidth={2} />
                    )}
                  </PressableScale>
                </View>
                {errors.password ? (
                  <Animated.View entering={errorEntering} style={styles.errorRow}>
                    <CircleAlert size={14} color={colors.error} strokeWidth={2} />
                    <Text style={styles.errorText}>{errors.password}</Text>
                  </Animated.View>
                ) : null}
              </View>

              <AppButton
                label={copy.primaryLabel}
                onPress={handleEmailSubmit}
                loading={isLoading}
                disabled={isLoading}
                style={styles.primaryButton}
              />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{copy.switchLead} </Text>
              <PressableScale
                onPress={() => handleModeChange(mode === 'signIn' ? 'signUp' : 'signIn')}
                disabled={isLoading}
                hitSlop={8}
                haptic="light"
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading }}
              >
                <Text style={styles.footerLink}>{copy.switchAction}</Text>
              </PressableScale>
            </View>

            <Text style={[styles.tagline, displayFont.regular]}>{t('auth.tagline')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const googleStyles = StyleSheet.create({
  button: {
    height: layout.pillHeight,
    borderRadius: layout.pillHeight / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.xl,
  },
  mark: {
    width: GOOGLE_MARK_SIZE,
    height: GOOGLE_MARK_SIZE,
    resizeMode: 'contain',
  },
  disabled: {
    opacity: 0.45,
  },
});

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
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    headerEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      flex: 1,
      textAlign: 'center',
    },
    // Balances the 40pt icon button so the eyebrow is optically centred.
    headerSpacer: {
      width: layout.iconButton,
    },
    // `flexGrow`, not `flex`: the column fills a tall screen so the tagline can
    // settle on the bottom edge, but keeps its intrinsic height once the
    // keyboard is up, so the form scrolls instead of compressing.
    content: {
      flexGrow: 1,
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
    },
    appIcon: {
      width: APP_ICON_SIZE,
      height: APP_ICON_SIZE,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    // One step above `displayHero` — the sign-in title is the largest type in
    // the app after the streak numeral. -0.04em tracking at 36px.
    title: {
      ...typography.displayHero,
      fontSize: 36,
      lineHeight: 35,
      letterSpacing: -1.44,
      color: colors.primaryText,
      marginTop: spacing.lg,
    },
    subtitle: {
      ...typography.body,
      color: colors.secondaryText,
      marginTop: spacing.md,
    },
    noticeCard: {
      marginTop: spacing.xl,
      gap: spacing.sm,
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
      paddingHorizontal: 0,
    },
    providerSection: {
      gap: PROVIDER_GAP,
      marginTop: spacing.xl,
    },
    appleButton: {
      height: layout.pillHeight,
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
      backgroundColor: colors.borderStrong,
    },
    dividerText: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    form: {
      gap: spacing.lg,
    },
    inputContainer: {
      gap: spacing.sm,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    input: {
      height: FIELD_HEIGHT,
      backgroundColor: colors.cardBackground,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.primaryText,
      fontSize: 15,
      paddingHorizontal: spacing.lg,
      paddingVertical: 0,
    },
    inputError: {
      borderColor: colors.error,
    },
    passwordContainer: {
      position: 'relative',
      justifyContent: 'center',
    },
    passwordInput: {
      paddingRight: spacing.xxl + spacing.md,
    },
    eyeButton: {
      position: 'absolute',
      right: spacing.lg,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    errorText: {
      ...typography.caption,
      color: colors.error,
      flex: 1,
    },
    forgotPassword: {
      ...typography.captionStrong,
      color: colors.accentPrimary,
    },
    primaryButton: {
      marginTop: spacing.sm,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.xl,
      flexWrap: 'wrap',
    },
    footerText: {
      ...typography.captionStrong,
      fontWeight: '400',
      fontSize: 13.5,
      color: colors.secondaryText,
    },
    footerLink: {
      ...typography.captionStrong,
      fontSize: 13.5,
      color: colors.accentPrimary,
    },
    // Sits on the bottom edge of the page on tall screens, a comfortable gap
    // below the footer on short ones.
    tagline: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      textAlign: 'center',
      marginTop: 'auto',
      paddingTop: spacing.xxl,
      paddingBottom: spacing.lg,
    },
  });
