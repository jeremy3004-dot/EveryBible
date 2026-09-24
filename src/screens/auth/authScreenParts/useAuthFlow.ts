import { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { announceForAccessibility, announceLiveRegionText } from '../../../utils/a11y';
import { errorHaptic } from '../../../utils/haptics';
import type { AuthScreenMode, AuthStackParamList } from '../../../navigation/types';
import {
  getCurrentSession,
  isSilentAuthError,
  resetPassword,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthResult,
} from '../../../services/auth';
import { pullFromCloud } from '../../../services/sync';
import { useAuthStore } from '../../../stores/authStore';
import {
  authFailureMessageKey,
  authFailureTitleKey,
  hasFormErrors,
  normalizeEmail,
  validateAuthForm,
  type AuthFormErrors,
} from './authFormModel';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'AuthScreen'>;

export interface AuthFlow {
  mode: AuthScreenMode;
  email: string;
  password: string;
  showPassword: boolean;
  isLoading: boolean;
  /** Translation keys of the fields that failed validation. */
  errors: AuthFormErrors;
  /** A sign-up that needs its address verified before the account can sign in. */
  verificationNotice: boolean;
  changeEmail: (text: string) => void;
  changePassword: (text: string) => void;
  toggleShowPassword: () => void;
  changeMode: (mode: AuthScreenMode) => void;
  dismiss: () => void;
  submitEmail: () => Promise<void>;
  continueWithApple: () => Promise<void>;
  continueWithGoogle: () => Promise<void>;
  sendPasswordReset: () => Promise<void>;
}

/** The auth screen's state and its sign-in, sign-up, provider and reset flows. */
export function useAuthFlow(initialMode: AuthScreenMode): AuthFlow {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const setSession = useAuthStore((state) => state.setSession);

  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [verificationNotice, setVerificationNotice] = useState(false);

  const dismiss = () => {
    navigation.getParent()?.goBack();
  };

  const changeMode = (nextMode: AuthScreenMode) => {
    setMode(nextMode);
    setErrors({});
    setVerificationNotice(false);
  };

  const changeEmail = (text: string) => {
    setEmail(text);
    setErrors((current) => ({ ...current, email: undefined }));
  };

  const changePassword = (text: string) => {
    setPassword(text);
    setErrors((current) => ({ ...current, password: undefined }));
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

  const showAuthFailure = (result: AuthResult, fallbackKey: string) => {
    if (isSilentAuthError(result.code)) {
      return;
    }

    errorHaptic();
    Alert.alert(t(authFailureTitleKey(mode)), t(authFailureMessageKey(result.code, fallbackKey)));
  };

  // Runs one auth call with the form locked, reporting a thrown call generically.
  const runLocked = async (work: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await work();
    } catch {
      Alert.alert(t('common.error'), t('auth.somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  };

  const submitEmail = async () => {
    const nextErrors = validateAuthForm(email, password);
    setErrors(nextErrors);
    if (hasFormErrors(nextErrors)) {
      // The field errors are live regions, which only TalkBack reads; VoiceOver
      // otherwise hears nothing after Sign in beyond the error haptic.
      announceLiveRegionText(
        [nextErrors.email, nextErrors.password]
          .filter((key): key is string => Boolean(key))
          .map((key) => t(key))
          .join('. ')
      );
      return;
    }

    setVerificationNotice(false);
    await runLocked(async () => {
      const address = normalizeEmail(email);

      if (mode === 'signUp') {
        const result = await signUpWithEmail(address, password);
        if (!result.success || !result.user) {
          showAuthFailure(result, 'auth.somethingWentWrong');
          return;
        }

        const userId = await hydrateLiveSession();
        if (userId) {
          await pullFromCloud(userId);
          dismiss();
          return;
        }

        setVerificationNotice(true);
        // The notice appears above the form while focus stays on the submit button.
        announceForAccessibility(`${t('auth.accountCreated')}. ${t('auth.verifyEmailMessage')}`);
        setPassword('');
        return;
      }

      const result = await signInWithEmail(address, password);
      if (result.success && result.user) {
        await completeAuthenticatedFlow();
      } else {
        showAuthFailure(result, 'auth.checkCredentials');
      }
    });
  };

  const continueWithProvider = async (
    signIn: () => Promise<AuthResult>,
    fallbackKey: string
  ): Promise<void> => {
    await runLocked(async () => {
      const result = await signIn();
      if (result.success && result.user) {
        await completeAuthenticatedFlow();
      } else {
        showAuthFailure(result, fallbackKey);
      }
    });
  };

  const continueWithApple = async () => {
    // The native Apple control cannot be disabled, so it ignores taps here instead:
    // a second concurrent sign-in would restore and dismiss twice.
    if (isLoading) {
      return;
    }
    await continueWithProvider(signInWithApple, 'auth.appleSignInFailed');
  };

  const continueWithGoogle = () =>
    continueWithProvider(signInWithGoogle, 'auth.googleSignInFailed');

  const sendPasswordReset = async () => {
    const address = normalizeEmail(email);
    if (!address) {
      Alert.alert(t('auth.emailRequired'), t('auth.emailRequiredForReset'));
      return;
    }

    await runLocked(async () => {
      // Typed as AuthResult: a failed reset may carry a code, as a sign-in does.
      const result: AuthResult = await resetPassword(address);
      if (result.success) {
        Alert.alert(t('auth.checkYourEmail'), t('auth.resetLinkSent'));
      } else {
        Alert.alert(
          t('common.error'),
          t(authFailureMessageKey(result.code, 'auth.resetEmailError'))
        );
      }
    });
  };

  return {
    mode,
    email,
    password,
    showPassword,
    isLoading,
    errors,
    verificationNotice,
    changeEmail,
    changePassword,
    toggleShowPassword: () => setShowPassword((current) => !current),
    changeMode,
    dismiss,
    submitEmail,
    continueWithApple,
    continueWithGoogle,
    sendPasswordReset,
  };
}
