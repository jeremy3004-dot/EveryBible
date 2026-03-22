import { useCallback, useState } from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacyStore } from '../../stores';
import { validatePrivacyPin } from '../../services/privacy';

// ---------- calculator engine ----------

type CalcState = {
  display: string;
  previousValue: number | null;
  operator: string | null;
  waitingForOperand: boolean;
  rawKeySequence: string; // hidden - tracks keys for PIN matching
};

const initialCalcState: CalcState = {
  display: '0',
  previousValue: null,
  operator: null,
  waitingForOperand: false,
  rawKeySequence: '',
};

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const s = String(n);
  if (s.length > 12) {
    return n.toExponential(6);
  }
  return s;
}

function applyOperator(left: number, op: string, right: number): number {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '×':
      return left * right;
    case '÷':
      return right === 0 ? NaN : left / right;
    default:
      return right;
  }
}

// ---------- keypad layout (iOS calculator style) ----------

const buttonRows = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0_wide', '.', '='],
] as const;

type ButtonKey = (typeof buttonRows)[number][number];

function isOperator(key: string): boolean {
  return key === '÷' || key === '×' || key === '-' || key === '+';
}

// ---------- colors (iOS calculator palette) ----------

const palette = {
  background: '#000000',
  numButton: '#333333',
  numText: '#FFFFFF',
  opButton: '#FF9500',
  opButtonActive: '#FFFFFF',
  opText: '#FFFFFF',
  opTextActive: '#FF9500',
  fnButton: '#A5A5A5',
  fnText: '#000000',
  display: '#FFFFFF',
};

// ---------- component ----------

const { width: screenWidth } = Dimensions.get('window');
const buttonSpacing = 12;
const horizontalPad = 20;
const availableWidth = screenWidth - horizontalPad * 2;
const buttonSize = (availableWidth - buttonSpacing * 3) / 4;

export function PrivacyLockScreen() {
  const unlock = usePrivacyStore((state) => state.unlock);
  const [calc, setCalc] = useState<CalcState>(initialCalcState);
  const [activeOp, setActiveOp] = useState<string | null>(null);

  const handlePress = useCallback(
    async (key: ButtonKey | string) => {
      const rawKey = key === '0_wide' ? '0' : key;

      setCalc((prev) => {
        const seq = prev.rawKeySequence + rawKey;

        // --- clear ---
        if (rawKey === 'C') {
          setActiveOp(null);
          return { ...initialCalcState, rawKeySequence: '' };
        }

        // --- percent ---
        if (rawKey === '%') {
          const value = parseFloat(prev.display);
          const result = value / 100;
          return {
            ...prev,
            display: formatNumber(result),
            rawKeySequence: seq,
          };
        }

        // --- plus/minus ---
        if (rawKey === '±') {
          const value = parseFloat(prev.display);
          return {
            ...prev,
            display: formatNumber(value * -1),
            rawKeySequence: seq,
          };
        }

        // --- operators ---
        if (isOperator(rawKey)) {
          setActiveOp(rawKey);
          const currentValue = parseFloat(prev.display);

          if (prev.operator && !prev.waitingForOperand) {
            const result = applyOperator(prev.previousValue!, prev.operator, currentValue);
            return {
              display: formatNumber(result),
              previousValue: result,
              operator: rawKey,
              waitingForOperand: true,
              rawKeySequence: seq,
            };
          }

          return {
            ...prev,
            previousValue: currentValue,
            operator: rawKey,
            waitingForOperand: true,
            rawKeySequence: seq,
          };
        }

        // --- equals ---
        if (rawKey === '=') {
          setActiveOp(null);

          if (prev.operator && prev.previousValue !== null) {
            const currentValue = parseFloat(prev.display);
            const result = applyOperator(prev.previousValue, prev.operator, currentValue);
            return {
              display: formatNumber(result),
              previousValue: null,
              operator: null,
              waitingForOperand: true,
              rawKeySequence: seq,
            };
          }

          return { ...prev, rawKeySequence: seq };
        }

        // --- decimal ---
        if (rawKey === '.') {
          if (prev.waitingForOperand) {
            setActiveOp(null);
            return {
              ...prev,
              display: '0.',
              waitingForOperand: false,
              rawKeySequence: seq,
            };
          }
          if (prev.display.includes('.')) {
            return { ...prev, rawKeySequence: seq };
          }
          return {
            ...prev,
            display: prev.display + '.',
            rawKeySequence: seq,
          };
        }

        // --- digit ---
        setActiveOp(null);
        if (prev.waitingForOperand) {
          return {
            ...prev,
            display: rawKey,
            waitingForOperand: false,
            rawKeySequence: seq,
          };
        }

        return {
          ...prev,
          display: prev.display === '0' ? rawKey : prev.display + rawKey,
          rawKeySequence: seq,
        };
      });

      // --- check PIN on = press ---
      if (rawKey === '=') {
        // Small delay so state updates first
        setTimeout(async () => {
          setCalc((current) => {
            // Extract only digits and basic operator chars from the sequence
            const pinCandidate = current.rawKeySequence
              .replace(/[C%±.=]/g, '')
              .replace(/×/g, '*')
              .replace(/÷/g, '/');

            // Try the last 4-6 chars as a PIN
            for (let len = 4; len <= 6; len++) {
              if (pinCandidate.length >= len) {
                const attempt = pinCandidate.slice(-len);
                const validation = validatePrivacyPin(attempt);
                if (validation.isValid) {
                  void unlock(validation.normalized).then((success) => {
                    if (success) {
                      // Will unmount — no state update needed
                    }
                  });
                }
              }
            }

            return current;
          });
        }, 50);
      }
    },
    [unlock]
  );

  // Dynamic font size for display
  const displayFontSize =
    calc.display.length > 9
      ? Math.max(32, 72 - (calc.display.length - 9) * 6)
      : 72;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Display */}
      <View style={styles.displayArea}>
        <Text
          style={[styles.displayText, { fontSize: displayFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {calc.display}
        </Text>
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {buttonRows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key) => {
              const isWideZero = key === '0_wide';
              const displayKey = isWideZero ? '0' : key;
              const isOp = isOperator(key);
              const isFn = key === 'C' || key === '±' || key === '%';
              const isOpActive = isOp && activeOp === key;

              const bgColor = isOp
                ? isOpActive
                  ? palette.opButtonActive
                  : palette.opButton
                : isFn
                  ? palette.fnButton
                  : palette.numButton;

              const textColor = isOp
                ? isOpActive
                  ? palette.opTextActive
                  : palette.opText
                : isFn
                  ? palette.fnText
                  : palette.numText;

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.button,
                    {
                      backgroundColor: bgColor,
                      width: isWideZero ? buttonSize * 2 + buttonSpacing : buttonSize,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => void handlePress(key)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: textColor },
                      isOp ? styles.buttonTextOp : null,
                    ]}
                  >
                    {displayKey}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: 'flex-end',
    paddingHorizontal: horizontalPad,
    paddingBottom: Platform.OS === 'ios' ? 12 : 24,
  },
  displayArea: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    minHeight: 100,
  },
  displayText: {
    color: palette.display,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  keypad: {
    gap: buttonSpacing,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: buttonSpacing,
  },
  button: {
    height: buttonSize,
    borderRadius: buttonSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 32,
    fontWeight: '500',
  },
  buttonTextOp: {
    fontSize: 36,
  },
});
