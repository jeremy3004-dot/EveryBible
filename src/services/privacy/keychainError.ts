/**
 * expo-secure-store's keychain failures: ERR_KEY_CHAIN on iOS (an unsigned build, a
 * read while the device is locked), ERR_SECURESTORE_* on Android. Import-free, so
 * session restore can classify its failures without loading the privacy services.
 */
export function isKeychainError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^ERR_(KEY_CHAIN|SECURESTORE)/.test(code);
}
