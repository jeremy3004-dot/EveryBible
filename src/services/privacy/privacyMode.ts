import type { AppStateStatus } from 'react-native';

export type PrivacyPinErrorKey =
  | 'privacy.pinTooShort'
  | 'privacy.pinTooLong'
  | 'privacy.pinInvalidCharacters';

const multiplicationCharacters = new Set(['x', 'X', '×', '*']);
const divisionCharacters = new Set(['÷', '/']);
const allowedSymbols = new Set(['+', '-', '*', '/']);

export const normalizePrivacyPin = (input: string): string => {
  return input
    .replace(/\s+/g, '')
    .split('')
    .map((character) => {
      if (multiplicationCharacters.has(character)) {
        return '*';
      }

      if (divisionCharacters.has(character)) {
        return '/';
      }

      return character.toUpperCase();
    })
    .join('');
};

export const validatePrivacyPin = (
  input: string
): { isValid: boolean; normalized: string; errorKey: PrivacyPinErrorKey | null } => {
  const normalized = normalizePrivacyPin(input);

  if (normalized.length < 4) {
    return {
      isValid: false,
      normalized,
      errorKey: 'privacy.pinTooShort',
    };
  }

  if (normalized.length > 6) {
    return {
      isValid: false,
      normalized,
      errorKey: 'privacy.pinTooLong',
    };
  }

  const hasInvalidCharacters = normalized.split('').some((character) => {
    return !/[0-9]/.test(character) && !allowedSymbols.has(character);
  });

  if (hasInvalidCharacters) {
    return {
      isValid: false,
      normalized,
      errorKey: 'privacy.pinInvalidCharacters',
    };
  }

  return {
    isValid: true,
    normalized,
    errorKey: null,
  };
};

export const shouldLockForAppStateChange = (
  previousState: AppStateStatus,
  nextState: AppStateStatus
): boolean => {
  return previousState === 'active' && (nextState === 'inactive' || nextState === 'background');
};
