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
import { signUpWithEmail, signInWithApple, signInWithGoogle } from '../../services/auth';
import { useAuthStore } from '../../stores/authStore';
import { syncAll } from '../../services/sync';
import type { AuthStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export function SignUpScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);

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
        setUser(result.user);
        await syncAll();
        Alert.alert(t('auth.accountCreated'), t('auth.verifyEmailMessage'), [
          { text: t('common.ok'), onPress: () => navigation.getParent()?.goBack() },
        ]);
      } else {
        Alert.alert(t('auth.signUpFailed'), result.error || t('auth.somethingWentWrong'));
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
        await syncAll();
        navigation.getParent()?.goBack();
      } else if (result.error !== t('auth.signInCancelled')) {
        Alert.alert(t('auth.signUpFailed'), result.error || t('auth.appleSignInFailed'));
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
        await syncAll();
        navigation.getParent()?.goBack();
      } else if (result.error !== 'Google sign in cancelled') {
        Alert.alert(t('auth.signUpFailed'), result.error || t('auth.googleSignInFailed'));
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
              <Ionicons name="logo-google" size={20} color="#DB4437" />
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
    padding: 16,
  },
  backButton: {
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
  signUpButton: {
    backgroundColor: colors.accentGreen,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
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
