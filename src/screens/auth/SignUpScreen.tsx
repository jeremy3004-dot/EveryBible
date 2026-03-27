import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import {
  getCurrentSession,
  isSilentAuthError,
  signInWithApple,
  signInWithGoogle,
  signUpWithEmail,
  type AuthResult,
} from '../../services/auth';
import { useAuthStore } from '../../stores/authStore';
import { syncAll } from '../../services/sync';
import type { AuthStackParamList } from '../../navigation/types';
import { radius, spacing, typography } from '../../design/system';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export function SignUpScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const setSession = useAuthStore((state) => state.setSession);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const hydrateLiveSession = async (): Promise<boolean> => {
    const { session } = await getCurrentSession();

    if (!session) {
      return false;
    }

    setSession(session);
    return true;
  };

  const completeProviderSignIn = async () => {
    if (!(await hydrateLiveSession())) {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
      return;
    }

    await syncAll();
    navigation.getParent()?.goBack();
  };

  const showAuthFailure = (result: AuthResult, fallbackMessage: string) => {
    if (isSilentAuthError(result.code)) {
      return;
    }

    Alert.alert(t('auth.signUpFailed'), result.error || fallbackMessage);
  };

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = t('auth.nameRequired');
    }

    if (!email.trim()) {
      newErrors.email = t('auth.emailRequired');
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t('auth.emailInvalid');
    }

    if (!password) {
      newErrors.password = t('auth.passwordRequired');
    } else if (password.length < 6) {
      newErrors.password = t('auth.passwordMinLength');
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('auth.passwordsDoNotMatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const result = await signUpWithEmail(email, password, name);
      if (result.success && result.user) {
        if (await hydrateLiveSession()) {
          await syncAll();
        }
        Alert.alert(t('auth.accountCreated'), t('auth.verifyEmailMessage'), [
          { text: t('common.ok'), onPress: () => navigation.getParent()?.goBack() },
        ]);
      } else {
        showAuthFailure(result, t('auth.somethingWentWrong'));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithApple();
      if (result.success && result.user) {
        await completeProviderSignIn();
      } else {
        showAuthFailure(result, t('auth.appleSignInFailed'));
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.success && result.user) {
        await completeProviderSignIn();
      } else {
        showAuthFailure(result, t('auth.googleSignInFailed'));
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{t('auth.createAccount')}</Text>
            <Text style={styles.subtitle}>{t('auth.signUpSubtitle')}</Text>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.name')}</Text>
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setErrors((e) => ({ ...e, name: undefined }));
                  }}
                  placeholder={t('auth.namePlaceholder')}
                  placeholderTextColor={colors.secondaryText}
                  autoCapitalize="words"
                  autoComplete="name"
                  editable={!isLoading}
                />
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setErrors((e) => ({ ...e, email: undefined }));
                  }}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.secondaryText}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!isLoading}
                />
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
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
                      setErrors((e) => ({ ...e, password: undefined }));
                    }}
                    placeholder={t('auth.passwordHint')}
                    placeholderTextColor={colors.secondaryText}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={22}
                      color={colors.secondaryText}
                    />
                  </TouchableOpacity>
                </View>
                {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
                <TextInput
                  style={[styles.input, errors.confirmPassword && styles.inputError]}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setErrors((e) => ({ ...e, confirmPassword: undefined }));
                  }}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                {errors.confirmPassword && (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.signUpButton, isLoading && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.signUpButtonText}>{t('auth.createAccount')}</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('common.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              <Ionicons name="logo-google" size={20} color={colors.accentPrimary} />
              <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')} </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
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
      padding: spacing.lg,
    },
    backButton: {
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
      marginBottom: spacing.xxl,
    },
    form: {
      gap: 20,
    },
    inputContainer: {
      gap: spacing.sm,
    },
    label: {
      ...typography.label,
      color: colors.primaryText,
    },
    input: {
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.sm,
      padding: spacing.lg,
      ...typography.body,
      color: colors.primaryText,
    },
    inputError: {
      borderColor: colors.error,
    },
    passwordContainer: {
      position: 'relative',
    },
    passwordInput: {
      paddingRight: 50,
    },
    eyeButton: {
      position: 'absolute',
      right: spacing.lg,
      top: spacing.lg,
    },
    errorText: {
      ...typography.micro,
      color: colors.error,
    },
    signUpButton: {
      backgroundColor: colors.accentPrimary,
      borderRadius: radius.sm,
      padding: spacing.lg,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    signUpButtonText: {
      ...typography.button,
      color: colors.primaryText,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.xl,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.cardBorder,
    },
    dividerText: {
      ...typography.label,
      color: colors.secondaryText,
      marginHorizontal: spacing.lg,
    },
    appleButton: {
      height: 50,
      width: '100%',
    },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 14,
      marginTop: spacing.md,
      gap: 10,
    },
    googleButtonText: {
      ...typography.button,
      color: colors.primaryText,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: spacing.xl,
    },
    footerText: {
      ...typography.label,
      color: colors.secondaryText,
    },
    footerLink: {
      ...typography.label,
      color: colors.accentPrimary,
      fontWeight: '600',
    },
  });
