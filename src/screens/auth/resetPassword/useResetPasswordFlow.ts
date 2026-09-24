import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { AuthStackParamList } from '../../../navigation/types';
import { getCurrentSession, resetPassword, signOut, updatePassword } from '../../../services/auth';
import {
  activatePendingPasswordRecovery,
  clearPendingPasswordRecovery,
  getPendingPasswordRecovery,
} from '../../../services/auth/authDeepLink';
import type { RecoveryProblem } from '../../../services/auth/authRecoveryLink';
import { pullFromCloud } from '../../../services/sync';
import { useAuthStore } from '../../../stores/authStore';
import { announceLiveRegionText } from '../../../utils/a11y';
import { hasFormErrors } from '../authScreenParts/authFormModel';
import {
  activationProblem,
  initialResetPhase,
  resetFailureMessageKey,
  validateNewPassword,
  type NewPasswordErrors,
  type ResetPhase,
} from './resetPasswordModel';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;

export interface ResetPasswordFlow {
  phase: ResetPhase;
  problem: RecoveryProblem;
  /** The account signed in now; the confirm step warns that Continue signs it out. */
  signedInUserId: string | null;
  isActivating: boolean;
  confirmAccount: () => Promise<void>;
  cancel: () => void;
  resendEmail: string;
  changeResendEmail: (text: string) => void;
  isResending: boolean;
  /** Translated reason the last request for a new link failed. */
  resendError: string | null;
  sendNewLink: () => Promise<void>;
  password: string;
  confirmPassword: string;
  changePassword: (text: string) => void;
  changeConfirmPassword: (text: string) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  isSaving: boolean;
  /** Translation keys of the fields that failed validation. */
  errors: NewPasswordErrors;
  /** Translated reason the last password update failed. */
  formError: string | null;
  submitNewPassword: () => Promise<void>;
}

/** The reset link's confirm, new-password and "send a new link" flows. */
export function useResetPasswordFlow(): ResetPasswordFlow {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const setSession = useAuthStore((state) => state.setSession);

  // Captured once: the link as it was when the screen opened.
  const [pendingRecovery] = useState(() => getPendingPasswordRecovery());
  // Live: Continue signs this account out before the code is exchanged, and the
  // confirm step says so while someone is signed in.
  const signedInUserId = useAuthStore((state) => state.user?.uid ?? null);

  const [phase, setPhase] = useState<ResetPhase>(() => initialResetPhase(pendingRecovery));
  const [problem, setProblem] = useState<RecoveryProblem>('expired');
  const [isActivating, setIsActivating] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<NewPasswordErrors>({});

  const didActivateRef = useRef(false);
  const didUpdatePasswordRef = useRef(false);
  const isMountedRef = useRef(true);

  // Leaving the screen must never strand a live recovery session. Any account that
  // was signed in was signed out before the exchange, so the recovery session is
  // the only one here and ends with the screen unless the password was set.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPendingPasswordRecovery();
      if (didActivateRef.current && !didUpdatePasswordRef.current) {
        void signOut();
      }
    };
  }, []);

  const dismiss = () => {
    navigation.getParent()?.goBack();
  };

  const cancel = useCallback(() => {
    clearPendingPasswordRecovery();
    dismiss();
    // dismiss is a stable navigation call; re-creating it would not change behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const confirmAccount = useCallback(async () => {
    setIsActivating(true);
    try {
      // Read now, not at render: the exchange replaces this device's session, so a
      // signed-in account goes through the normal sign-out first.
      const result = await activatePendingPasswordRecovery({
        signedInUserId: useAuthStore.getState().user?.uid ?? null,
        signOutCurrentAccount: () => useAuthStore.getState().signOut(),
      });

      const nextProblem = activationProblem(result);
      if (nextProblem === null) {
        // Closed while the code was exchanged: the cleanup above has already run,
        // so end the recovery session it could not see.
        if (!isMountedRef.current) {
          void signOut();
          return;
        }
        didActivateRef.current = true;
        setPhase('form');
        return;
      }

      setProblem(nextProblem);
      setPhase('problem');
    } finally {
      setIsActivating(false);
    }
  }, []);

  // The error texts are live regions, which only TalkBack reads; VoiceOver is
  // told directly, or a failed save or resend is silent.
  useEffect(() => {
    if (formError) announceLiveRegionText(formError);
  }, [formError]);
  useEffect(() => {
    if (resendError) announceLiveRegionText(resendError);
  }, [resendError]);

  const changeResendEmail = (text: string) => {
    setResendEmail(text);
    setResendError(null);
  };

  // The new link is requested from this install, so its code verifier is stored
  // here and the emailed link works on this device.
  const sendNewLink = async () => {
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

  const changePassword = (text: string) => {
    setPassword(text);
    setFormError(null);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const changeConfirmPassword = (text: string) => {
    setConfirmPassword(text);
    setFormError(null);
    setErrors((current) => ({ ...current, confirmPassword: undefined }));
  };

  const submitNewPassword = async () => {
    const nextErrors = validateNewPassword(password, confirmPassword);
    setErrors(nextErrors);
    if (hasFormErrors(nextErrors)) {
      announceLiveRegionText(
        [nextErrors.password, nextErrors.confirmPassword]
          .filter((key): key is string => Boolean(key))
          .map((key) => t(key))
          .join('. ')
      );
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const result = await updatePassword(password);
      if (!result.success) {
        setFormError(t(resetFailureMessageKey(result.code)));
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
      setIsSaving(false);
    }
  };

  return {
    phase,
    problem,
    signedInUserId,
    isActivating,
    confirmAccount,
    cancel,
    resendEmail,
    changeResendEmail,
    isResending,
    resendError,
    sendNewLink,
    password,
    confirmPassword,
    changePassword,
    changeConfirmPassword,
    showPassword,
    toggleShowPassword: () => setShowPassword((current) => !current),
    isSaving,
    errors,
    formError,
    submitNewPassword,
  };
}
