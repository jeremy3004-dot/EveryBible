export {
  signUpWithEmail,
  signInWithEmail,
  signInWithApple,
  signInWithGoogle,
  signOut,
  resetPassword,
  updatePassword,
  getCurrentSession,
  type AuthResult,
} from './authService';
export { isSilentAuthError, type AuthErrorCode } from './authErrors';
