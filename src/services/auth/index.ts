export {
  signUpWithEmail,
  signInWithEmail,
  signInWithApple,
  signInWithGoogle,
  signOut,
  resetPassword,
  getCurrentSession,
  type AuthResult,
} from './authService';
export { isSilentAuthError, type AuthErrorCode } from './authErrors';
