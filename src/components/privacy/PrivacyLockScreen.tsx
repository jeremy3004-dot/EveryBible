import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { usePrivacyStore } from '../../stores';
import { validatePrivacyPin } from '../../services/privacy';

const keypadRows = [
  ['1', '2', '3', '+'],
  ['4', '5', '6', '-'],
  ['7', '8', '9', '*'],
  ['clear', '0', 'delete', '/'],
] as const;

const maxPinLength = 6;

export function PrivacyLockScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const unlock = usePrivacyStore((state) => state.unlock);
  const [pinInput, setPinInput] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const maskedPin = pinInput.length > 0 ? '•'.repeat(pinInput.length) : t('privacy.pinPlaceholder');

  const handleKeyPress = (key: (typeof keypadRows)[number][number]) => {
    setErrorKey(null);

    if (key === 'clear') {
      setPinInput('');
      return;
    }

    if (key === 'delete') {
      setPinInput((current) => current.slice(0, -1));
      return;
    }

    setPinInput((current) => {
      if (current.length >= maxPinLength) {
        return current;
      }

      return current + key;
    });
  };

  const handleUnlock = async () => {
    const validation = validatePrivacyPin(pinInput);

    if (!validation.isValid) {
      setErrorKey(validation.errorKey);
      return;
    }

    const isUnlocked = await unlock(validation.normalized);

    if (!isUnlocked) {
      setErrorKey('privacy.incorrectPin');
      return;
    }

    setPinInput('');
    setErrorKey(null);
  };

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="privacy-lock-screen"
      accessibilityLabel={t('privacy.lockTitle')}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.bibleSurface,
            borderColor: colors.cardBorder,
          },
        ]}
      >
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Ionicons name="calculator-outline" size={28} color={colors.accentPrimary} />
        </View>

        <Text style={[styles.title, { color: colors.primaryText }]}>{t('privacy.lockTitle')}</Text>
        <Text style={[styles.body, { color: colors.secondaryText }]}>{t('privacy.lockBody')}</Text>

        <View
          style={[
            styles.pinDisplay,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.pinDisplayText, { color: colors.primaryText }]}>{maskedPin}</Text>
        </View>

        <Text style={[styles.pinHint, { color: colors.secondaryText }]}>
          {t('privacy.pinLengthHint')}
        </Text>

        {errorKey ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{t(errorKey)}</Text>
        ) : null}

        <View style={styles.keypad}>
          {keypadRows.map((row) => (
            <View key={row.join('-')} style={styles.keypadRow}>
              {row.map((key) => {
                const isActionKey = key === 'clear' || key === 'delete';
                const label =
                  key === 'clear'
                    ? t('privacy.clearKey')
                    : key === 'delete'
                      ? t('privacy.deleteKey')
                      : key;

                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.keypadKey,
                      {
                        backgroundColor: isActionKey
                          ? colors.bibleElevatedSurface
                          : colors.cardBackground,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                    testID={`privacy-key-${key}`}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    onPress={() => handleKeyPress(key)}
                    activeOpacity={0.88}
                  >
                    {key === 'delete' ? (
                      <Ionicons name="backspace-outline" size={20} color={colors.primaryText} />
                    ) : (
                      <Text style={[styles.keypadKeyText, { color: colors.primaryText }]}>
                        {label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.unlockButton, { backgroundColor: colors.accentPrimary }]}
          testID="privacy-unlock-button"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.unlock')}
          onPress={handleUnlock}
          activeOpacity={0.92}
        >
          <Text style={styles.unlockButtonText}>{t('privacy.unlock')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  pinDisplay: {
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pinDisplayText: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
  },
  pinHint: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  keypad: {
    gap: 10,
    marginBottom: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keypadKey: {
    flex: 1,
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadKeyText: {
    fontSize: 21,
    fontWeight: '600',
  },
  unlockButton: {
    minHeight: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
