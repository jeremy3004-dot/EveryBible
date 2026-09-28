import type { Session } from '@supabase/supabase-js';
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
import { supabase } from '../../../services/supabase';
import { pullFromCloud } from '../../../services/sync';
import { isAccessTokenExpired } from '../../../services/auth/authSession';
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

const sameSession = (left: Session | null, right: Session | null): boolean =>
  left?.user.id === right?.user.id &&
  left?.access_token === right?.access_token &&
  left?.refresh_token === right?.refresh_token;

/** The reset link's confirm, new-password and "send a new link" flows. */
export function useResetPasswordFlow(): ResetPasswordFlow {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();

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
  const activationPendingRef = useRef(false);
  const releaseObserverRef = useRef<(() => void) | null>(null);
  const recoveryOwnerRef = useRef<{ isCurrent: () => boolean; release: () => void } | null>(null);

  const endOwnedRecovery = useCallback(async () => {
    const owner = recoveryOwnerRef.current;
    recoveryOwnerRef.current = null;
    if (!owner) return;
    try {
      if (owner.isCurrent()) await signOut(owner.isCurrent);
    } finally {
      owner.release();
    }
  }, []);

  // Leaving an unsaved recovery ends only the session this exchange still owns.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPendingPasswordRecovery(pendingRecovery);
      if (didActivateRef.current && !didUpdatePasswordRef.current) {
        void endOwnedRecovery().catch(() => undefined);
      } else if (!activationPendingRef.current) {
        releaseObserverRef.current?.();
      }
    };
  }, [endOwnedRecovery, pendingRecovery]);

  const dismiss = () => {
    navigation.getParent()?.goBack();
  };

  const cancel = useCallback(() => {
    clearPendingPasswordRecovery(pendingRecovery);
    dismiss();
    // dismiss is a stable navigation call; re-creating it would not change behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, pendingRecovery]);

  const confirmAccount = useCallback(async () => {
    if (activationPendingRef.current) return;
    activationPendingRef.current = true;
    setIsActivating(true);
    let observedSession: Session | null = null;
    let revision = 0;
    let observing = true;
    // Explicit PKCE exchange emits SIGNED_IN; foreground reconciliation may
    // repeat that event. Only new credentials invalidate ownership. Refresh
    // rotates credentials while retaining the same recovery-session owner.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        if (!sameSession(observedSession, session)) revision += 1;
        observedSession = session;
      } else if (event === 'TOKEN_REFRESHED') {
        if (observedSession?.user.id !== session?.user.id) revision += 1;
        observedSession = session;
      } else if (event === 'SIGNED_OUT') {
        revision += 1;
        observedSession = null;
      }
    });
    const release = () => {
      if (!observing) return;
      observing = false;
      subscription.unsubscribe();
      if (releaseObserverRef.current === release) releaseObserverRef.current = null;
    };
    releaseObserverRef.current = release;
    try {
      // Read now, not at render: the exchange replaces this device's session, so a
      // signed-in account goes through sign-out first. Its completed onboarding
      // keeps the isolated recovery route mounted, while account data is cleared.
      const result = await activatePendingPasswordRecovery({
        signedInUserId: useAuthStore.getState().user?.uid ?? null,
        signOutCurrentAccount: () =>
          useAuthStore.getState().signOut({ reason: 'password-recovery' }),
        onActivated: (session) => {
          const current = useAuthStore.getState();
          if (!sameSession(observedSession, session) || !sameSession(current.session, session))
            return;
          const generation = current.authGeneration;
          const admittedRevision = revision;
          recoveryOwnerRef.current = {
            release,
            isCurrent: () => {
              const latest = useAuthStore.getState();
              return (
                observing &&
                revision === admittedRevision &&
                latest.user?.uid === session.user.id &&
                latest.authGeneration === generation
              );
            },
          };
        },
      });

      const nextProblem =
        result.status === 'activated' && !recoveryOwnerRef.current
          ? 'network'
          : activationProblem(result);
      if (nextProblem === null) {
        // Closed while the code was exchanged: the cleanup above has already run,
        // so end the recovery session it could not see.
        if (!isMountedRef.current) {
          await endOwnedRecovery();
          return;
        }
        didActivateRef.current = true;
        setPhase('form');
        return;
      }

      setProblem(nextProblem);
      setPhase('problem');
    } finally {
      activationPendingRef.current = false;
      if (!recoveryOwnerRef.current) release();
      setIsActivating(false);
    }
  }, [endOwnedRecovery]);

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

    const owner = recoveryOwnerRef.current;
    const isCurrent = () =>
      isMountedRef.current && recoveryOwnerRef.current === owner && Boolean(owner?.isCurrent());
    if (!isCurrent()) {
      setFormError(t(resetFailureMessageKey('invalid_credentials')));
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      let session = useAuthStore.getState().session;
      if (session && isAccessTokenExpired(session)) {
        await getCurrentSession();
        if (!isCurrent()) return;
        session = useAuthStore.getState().session;
      }
      if (!session || !isCurrent()) return;
      const result = await updatePassword(password, { session, isCurrent });
      if (!isCurrent()) return;
      if (!result.success) {
        setFormError(t(resetFailureMessageKey(result.code)));
        return;
      }

      didUpdatePasswordRef.current = true;
      const { session: liveSession } = await getCurrentSession();
      if (!isCurrent()) return;
      if (liveSession && liveSession.user.id === session.user.id) {
        await pullFromCloud(liveSession.user.id);
        if (!isCurrent()) return;
      }

      Alert.alert(t('auth.resetPasswordSuccess'), undefined, [
        {
          text: t('common.ok'),
          onPress: () => {
            if (isCurrent()) dismiss();
          },
        },
      ]);
    } catch {
      if (!isCurrent()) return;
      setFormError(t('auth.resetPasswordError'));
    } finally {
      if (isMountedRef.current) setIsSaving(false);
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
