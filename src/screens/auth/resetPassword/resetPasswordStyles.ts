import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';

export type ResetPasswordStyles = ReturnType<typeof createResetPasswordStyles>;

/** The reset screen's themed styles, shared by its parts. */
export function useResetPasswordStyles(): ResetPasswordStyles {
  const { colors } = useTheme();
  return useMemo(() => createResetPasswordStyles(colors), [colors]);
}

export const createResetPasswordStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
    },
    headerSpacer: {
      width: 36,
    },
    closeButton: {
      padding: spacing.xs,
    },
    content: {
      flex: 1,
      padding: spacing.xl,
      paddingTop: 0,
    },
    title: {
      ...typography.screenTitle,
      color: colors.primaryText,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      color: colors.secondaryText,
      marginBottom: spacing.xl,
    },
    form: {
      gap: spacing.lg,
    },
    inputContainer: {
      gap: spacing.xs,
    },
    label: {
      ...typography.micro,
      color: colors.primaryText,
      fontWeight: '600',
    },
    input: {
      backgroundColor: colors.cardBackground,
      borderColor: colors.controlBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.primaryText,
      fontSize: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    inputError: {
      borderColor: colors.error,
    },
    passwordContainer: {
      position: 'relative',
      justifyContent: 'center',
    },
    passwordInput: {
      paddingRight: spacing.xxxl,
    },
    eyeButton: {
      position: 'absolute',
      right: spacing.md,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    errorText: {
      ...typography.micro,
      color: colors.error,
    },
    primaryButton: {
      backgroundColor: colors.bibleControlBackground,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.lg,
    },
    primaryButtonText: {
      ...typography.button,
      color: colors.bibleBackground,
    },
    secondaryButton: {
      alignItems: 'center',
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      justifyContent: 'center',
      paddingVertical: spacing.lg,
    },
    secondaryButtonText: {
      ...typography.button,
      color: colors.primaryText,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
  });
