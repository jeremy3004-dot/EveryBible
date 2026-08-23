import { useMemo, useRef, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../design/system';
import type { AuthStackParamList } from '../../navigation/types';
import { getCurrentSession, updatePassword, type AuthResult } from '../../services/auth';
import { pullFromCloud } from '../../services/sync';
import { useAuthStore } from '../../stores/authStore';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;

interface FormErrors {
  password?: string;
  confirmPassword?: string;
}

export function ResetPasswordScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const setSession = useAuthStore((state) => state.setSession);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const dismiss = () => {
    navigation.getParent()?.goBack();
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
    try {
      const result = await updatePassword(password);

      if (!result.success) {
        Alert.alert(t('common.error'), getFailureMessage(result));
        return;
      }

      const { session } = await getCurrentSession();
      if (session) {
        setSession(session);
        await pullFromCloud(session.user.id);
      }

      Alert.alert(t('auth.resetPasswordSuccess'), undefined, [
        { text: t('common.ok'), onPress: dismiss },
      ]);
    } catch {
      Alert.alert(t('common.error'), t('auth.resetPasswordError'));
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
            <TouchableOpacity
              style={styles.closeButton}
              onPress={dismiss}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="close" size={28} color={colors.primaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
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
                      setErrors((current) => ({ ...current, password: undefined }));
                    }}
                    placeholder={t('auth.newPasswordPlaceholder')}
                    placeholderTextColor={colors.secondaryText}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((current) => !current)}
                    disabled={isLoading}
                    hitSlop={8}
                    accessibilityRole="button"
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

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('auth.confirmNewPassword')}</Text>
                <TextInput
                  ref={confirmPasswordInputRef}
                  style={[styles.input, errors.confirmPassword && styles.inputError]}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setErrors((current) => ({ ...current, confirmPassword: undefined }));
                  }}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                {errors.confirmPassword ? (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.bibleBackground} />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('auth.resetPasswordSubmit')}</Text>
                )}
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
  });
