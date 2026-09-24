import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useResetPasswordStyles } from './resetPasswordStyles';

interface ResetButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
}

/** The filled action: a spinner replaces its label while `busy`, and it is disabled then. */
export function ResetPrimaryButton({
  label,
  onPress,
  busy,
}: Omit<ResetButtonProps, 'disabled'> & { busy: boolean }) {
  const { colors } = useTheme();
  const styles = useResetPasswordStyles();

  return (
    <TouchableOpacity
      style={[styles.primaryButton, busy && styles.buttonDisabled]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
    >
      {busy ? (
        <ActivityIndicator color={colors.bibleBackground} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

/** The outlined secondary action (Cancel). */
export function ResetSecondaryButton({ label, onPress, disabled }: ResetButtonProps) {
  const styles = useResetPasswordStyles();

  return (
    <TouchableOpacity
      style={styles.secondaryButton}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}
