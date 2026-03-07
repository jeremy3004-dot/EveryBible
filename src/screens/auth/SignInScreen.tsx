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
import { colors } from '../../constants';
import { signInWithEmail, signInWithApple, signInWithGoogle, resetPassword } from '../../services/auth';
import { useAuthStore } from '../../stores/authStore';
import { pullFromCloud } from '../../services/sync';
import type { AuthStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export function SignInScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validateForm = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const result = await signInWithEmail(email, password);
      if (result.success && result.user) {
        setUser(result.user);
        await pullFromCloud();
        navigation.getParent()?.goBack();
      } else {
        Alert.alert(t('auth.signInFailed'), result.error || t('auth.checkCredentials'));
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
        setUser(result.user);
        await pullFromCloud();
        navigation.getParent()?.goBack();
      } else if (result.error !== t('auth.signInCancelled')) {
        Alert.alert(t('auth.signInFailed'), result.error || t('auth.appleSignInFailed'));
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
        setUser(result.user);
        await pullFromCloud();
        navigation.getParent()?.goBack();
      } else if (result.error !== 'Google sign in cancelled') {
        Alert.alert(t('auth.signInFailed'), result.error || t('auth.googleSignInFailed'));
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => navigation.getParent()?.goBack()}
            >
              <Ionicons name="close" size={28} color={colors.primaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
            <Text style={styles.subtitle}>{t('auth.signInSubtitle')}</Text>

            <View style={styles.form}>
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
                    placeholder={t('auth.passwordPlaceholder')}
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

              <TouchableOpacity onPress={handleForgotPassword} disabled={isLoading}>
                <Text style={styles.forgotPassword}>{t('auth.forgotPassword')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.signInButton, isLoading && styles.buttonDisabled]}
                onPress={handleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.signInButtonText}>{t('auth.signIn')}</Text>
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
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
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
              <Ionicons name="logo-google" size={20} color="#DB4437" />
              <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.dontHaveAccount')} </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.footerLink}>{t('auth.signUp')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    justifyContent: 'flex-end',
    padding: 16,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.secondaryText,
    marginBottom: 32,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryText,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
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
    right: 16,
    top: 16,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
  },
  forgotPassword: {
    fontSize: 14,
    color: colors.accentGreen,
    textAlign: 'right',
  },
  signInButton: {
    backgroundColor: colors.accentGreen,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryText,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    fontSize: 14,
    color: colors.secondaryText,
    marginHorizontal: 16,
  },
  appleButton: {
    height: 50,
    width: '100%',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: colors.secondaryText,
  },
  footerLink: {
    fontSize: 14,
    color: colors.accentGreen,
    fontWeight: '600',
  },
});
