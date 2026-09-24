import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme, type ThemeColors } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';

const APP_ICON_SIZE = 52;
const FIELD_HEIGHT = 48;
const PROVIDER_GAP = 10;

export type AuthScreenStyles = ReturnType<typeof createAuthScreenStyles>;

/** The auth screen's themed styles, shared by its parts. */
export function useAuthScreenStyles(): AuthScreenStyles {
  const { colors } = useTheme();
  return useMemo(() => createAuthScreenStyles(colors), [colors]);
}

export const createAuthScreenStyles = (colors: ThemeColors) =>
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
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    headerEyebrow: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      flex: 1,
      textAlign: 'center',
    },
    // Balances the 40pt icon button so the eyebrow is optically centred.
    headerSpacer: {
      width: layout.iconButton,
    },
    // `flexGrow`, not `flex`: the column fills a tall screen so the tagline can
    // settle on the bottom edge, but keeps its intrinsic height once the
    // keyboard is up, so the form scrolls instead of compressing.
    content: {
      flexGrow: 1,
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.lg,
    },
    appIcon: {
      width: APP_ICON_SIZE,
      height: APP_ICON_SIZE,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    // One step above `displayHero` — the sign-in title is the largest type in
    // the app after the streak numeral. -0.04em tracking at 36px.
    title: {
      ...typography.displayHero,
      fontSize: 36,
      lineHeight: 35,
      letterSpacing: -1.44,
      color: colors.primaryText,
      marginTop: spacing.lg,
    },
    subtitle: {
      ...typography.body,
      color: colors.secondaryText,
      marginTop: spacing.md,
    },
    noticeCard: {
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
    noticeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    noticeTitle: {
      ...typography.bodyStrong,
      color: colors.primaryText,
    },
    noticeBody: {
      ...typography.body,
      color: colors.secondaryText,
    },
    noticeButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 0,
    },
    providerSection: {
      gap: PROVIDER_GAP,
      marginTop: spacing.xl,
    },
    appleButton: {
      height: layout.pillHeight,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.xl,
      gap: spacing.md,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.borderStrong,
    },
    dividerText: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    form: {
      gap: spacing.lg,
    },
    inputContainer: {
      gap: spacing.sm,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {
      ...typography.eyebrow,
      color: colors.secondaryText,
    },
    input: {
      // minHeight, not height: at accessibility text sizes the typed email and
      // password outgrew a fixed 48pt field and were clipped top and bottom.
      minHeight: FIELD_HEIGHT,
      backgroundColor: colors.cardBackground,
      borderColor: colors.controlBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.primaryText,
      fontSize: 15,
      paddingHorizontal: spacing.lg,
      paddingVertical: 0,
    },
    inputError: {
      borderColor: colors.error,
    },
    passwordContainer: {
      position: 'relative',
      justifyContent: 'center',
    },
    passwordInput: {
      paddingRight: spacing.xxl + spacing.md,
    },
    eyeButton: {
      position: 'absolute',
      right: spacing.lg,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    errorText: {
      ...typography.caption,
      color: colors.error,
      flex: 1,
    },
    forgotPassword: {
      ...typography.captionStrong,
      color: colors.accentPrimary,
    },
    primaryButton: {
      marginTop: spacing.sm,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.xl,
      flexWrap: 'wrap',
    },
    footerText: {
      ...typography.captionStrong,
      fontWeight: '400',
      fontSize: 13.5,
      color: colors.secondaryText,
    },
    footerLink: {
      ...typography.captionStrong,
      fontSize: 13.5,
      color: colors.accentPrimary,
    },
    // Sits on the bottom edge of the page on tall screens, a comfortable gap
    // below the footer on short ones.
    tagline: {
      ...typography.eyebrow,
      color: colors.secondaryText,
      textAlign: 'center',
      marginTop: 'auto',
      paddingTop: spacing.xxl,
      paddingBottom: spacing.lg,
    },
  });
